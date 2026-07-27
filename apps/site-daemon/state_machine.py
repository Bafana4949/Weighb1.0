from __future__ import annotations

import asyncio
import logging
import statistics
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Awaitable, Callable
from uuid import uuid4

from config import AppConfig
from database import EdgeDatabase
from models import ActiveBooking, Alert, AnprResult, EdgeTransaction, TelemetryFrame, WeighingState
if TYPE_CHECKING:
    from mqtt_client import MqttService
from protocol import build_command

LOGGER = logging.getLogger(__name__)
SendCommand = Callable[[bytes], Awaitable[None]]
SnapshotCallback = Callable[[], Awaitable[str | None]]
AlertCallback = Callable[[Alert], Awaitable[None]]


class WeighingStateMachine:
    def __init__(
        self,
        config: AppConfig,
        database: EdgeDatabase,
        mqtt: "MqttService",
        send_command: SendCommand,
        capture_snapshot: SnapshotCallback,
        raise_alert: AlertCallback,
    ) -> None:
        self.config = config
        self.database = database
        self.mqtt = mqtt
        self.send_command = send_command
        self.capture_snapshot = capture_snapshot
        self.raise_alert = raise_alert
        self.state = WeighingState.IDLE
        self.session_id = str(uuid4())
        self.booking: ActiveBooking | None = None
        self.anpr_result: AnprResult | None = None
        self.entry_at: datetime | None = None
        self.positioning_started_at: datetime | None = None
        self.stabilising_started_at: datetime | None = None
        self.weight_window: deque[tuple[datetime, int]] = deque()
        self.last_transaction: EdgeTransaction | None = None
        self.driver_mismatch_alerted = False
        self.scale_fault_alerted = False
        self.manual_mode_reason: str | None = None
        self.pending_gross_weight_kg: int | None = None
        self.pending_captured_at: datetime | None = None

    async def transition(self, new_state: WeighingState, reason: str) -> None:
        if self.state == new_state:
            return
        previous = self.state
        self.state = new_state
        LOGGER.info("State %s -> %s (%s)", previous, new_state, reason)
        self.mqtt.publish("state", {"state": new_state, "previous_state": previous, "reason": reason}, qos=0, retain=True)
        if new_state == WeighingState.IDLE:
            await asyncio.to_thread(self.database.clear_session, self.session_id)
        else:
            await asyncio.to_thread(
                self.database.save_session,
                self.session_id,
                self.state,
                self.booking,
                {
                    "reason": reason,
                    "entry_at": self.entry_at.isoformat() if self.entry_at else None,
                    "last_weight": self.weight_window[-1][1] if self.weight_window else None,
                },
            )

    async def authorise(self, booking: ActiveBooking, anpr_result: AnprResult) -> None:
        self.booking = booking
        self.anpr_result = anpr_result
        self.entry_at = datetime.now(timezone.utc)
        self.driver_mismatch_alerted = False
        self.scale_fault_alerted = False
        await self.transition(WeighingState.VEHICLE_APPROACHING, "plate matched active booking")
        await self.send_command(build_command("LIGHT", "ENTRY", "RED"))

    async def reject_unauthorised(self, plate: str | None, confidence: float, image_path: str | None) -> None:
        await self.send_command(build_command("LIGHT", "ENTRY", "RED"))
        await self.send_command(build_command("GATE_CLOSE", "ENTRY"))
        await self.raise_alert(Alert(
            type="UNAUTHORISED_ACCESS",
            severity="HIGH",
            title="Unauthorised vehicle attempt",
            description=f"No active pre-authorisation matched plate {plate or 'UNREADABLE'} (confidence {confidence:.0%}).",
            evidence_urls=[image_path] if image_path else [],
            metadata={"plate": plate, "confidence": confidence},
        ))

    async def enter_manual_mode(self, reason: str) -> None:
        self.manual_mode_reason = reason
        await self.transition(WeighingState.MANUAL_MODE, reason)
        for command in (
            build_command("LIGHT", "ENTRY", "RED"),
            build_command("LIGHT", "EXIT", "RED"),
        ):
            try:
                await self.send_command(command)
            except ConnectionError:
                LOGGER.warning("Could not deliver fail-safe command because hardware transport is disconnected")

    async def process(self, frame: TelemetryFrame) -> None:
        if self.state == WeighingState.MANUAL_MODE:
            return
        if frame.scale_status == "FAULT":
            await self._scale_fault("Scale firmware reported a fault")
            return
        if self.booking is None:
            if frame.weight_kg > self.config.weighbridge.empty_scale_threshold_kg or frame.position_sensor_1:
                await self.transition(WeighingState.VEHICLE_APPROACHING, "vehicle detected; awaiting ANPR authorisation")
            elif self.state != WeighingState.IDLE:
                await self.transition(WeighingState.IDLE, "scale empty")
            return

        if self.state in {WeighingState.VEHICLE_APPROACHING, WeighingState.POSITIONING}:
            if frame.rfid_tag and frame.rfid_tag != self.booking.driver_rfid:
                await self._driver_mismatch(frame.rfid_tag)
                return
            if frame.rfid_tag == self.booking.driver_rfid:
                await self.send_command(build_command("BUZZER", value="OFF"))
                await self.send_command(build_command("LIGHT", "ENTRY", "GREEN"))
                await self.send_command(build_command("GATE_OPEN", "ENTRY"))
                await self.transition(WeighingState.POSITIONING, "plate and driver RFID verified")

            if frame.position_sensor_1 and frame.position_sensor_2:
                if self.positioning_started_at is None:
                    self.positioning_started_at = frame.received_at
                held = (frame.received_at - self.positioning_started_at).total_seconds()
                if held >= self.config.weighbridge.positioning_hold_seconds:
                    await self.send_command(build_command("GATE_CLOSE", "ENTRY"))
                    await self.send_command(build_command("LIGHT", "ENTRY", "RED"))
                    self.stabilising_started_at = frame.received_at
                    self.weight_window.clear()
                    await self.transition(WeighingState.STABILISING, "both position beams held")
            else:
                self.positioning_started_at = None
            return

        if self.state == WeighingState.STABILISING:
            if not (frame.position_sensor_1 and frame.position_sensor_2):
                self.positioning_started_at = None
                self.stabilising_started_at = None
                self.weight_window.clear()
                await self.transition(WeighingState.POSITIONING, "vehicle moved out of safe position")
                return
            self._append_weight(frame)
            if self._is_stable(frame.received_at):
                stable_weights = [value for _, value in self.weight_window]
                gross_weight = int(round(statistics.fmean(stable_weights) / 20) * 20)
                await self.transition(WeighingState.CAPTURED, "stable gross weight captured")
                await self._process_captured_weight(gross_weight)
                return
            if self.stabilising_started_at and (frame.received_at - self.stabilising_started_at).total_seconds() > self.config.weighbridge.unstable_timeout_seconds:
                await self._scale_fault("Weight remained unstable for more than the configured timeout")
            return

        if self.state == WeighingState.COMPLETE:
            if not frame.position_sensor_1 and not frame.position_sensor_2 and frame.weight_kg <= self.config.weighbridge.empty_scale_threshold_kg:
                await self.send_command(build_command("GATE_CLOSE", "EXIT"))
                await self.send_command(build_command("LIGHT", "EXIT", "RED"))
                await self.reset()

    def _append_weight(self, frame: TelemetryFrame) -> None:
        self.weight_window.append((frame.received_at, frame.weight_kg))
        minimum_time = frame.received_at - timedelta(seconds=self.config.weighbridge.stability_duration_seconds)
        while self.weight_window and self.weight_window[0][0] < minimum_time:
            self.weight_window.popleft()

    def _is_stable(self, now: datetime) -> bool:
        if not self.weight_window:
            return False
        elapsed = (now - self.weight_window[0][0]).total_seconds()
        values = [value for _, value in self.weight_window]
        return (
            elapsed >= self.config.weighbridge.stability_duration_seconds * 0.98
            and max(values) - min(values) <= self.config.weighbridge.stability_threshold_kg
            and min(values) > self.config.weighbridge.empty_scale_threshold_kg
        )

    async def _process_captured_weight(self, gross_weight: int) -> None:
        assert self.booking is not None
        await self.transition(WeighingState.PROCESSING, "calculating net weight and policy checks")
        net_weight = gross_weight - self.booking.tare_weight_kg
        allowed_net = int(self.booking.target_tonnage_kg * (1 + self.config.weighbridge.overload_tolerance_percent / 100))
        overload_variance = max(0, net_weight - allowed_net)
        overload = overload_variance > 0 or gross_weight > self.booking.legal_max_gvw_kg
        if gross_weight > self.config.weighbridge.max_capacity_kg:
            overload = True
            overload_variance = max(overload_variance, gross_weight - self.config.weighbridge.max_capacity_kg)

        # A crossing with little to no net cargo is an "empty" pass (the truck is either
        # arriving to collect a dispatch load, or leaving after delivering a receipt load)
        # and must stay under the empty-vehicle limit; a crossing carrying meaningful cargo
        # is a "loaded" pass and must not exceed the bridge's loaded-vehicle limit. These are
        # hard physical/legal limits, independent of the booking's target tonnage.
        EMPTY_CARGO_TOLERANCE_KG = 2_000
        is_empty_pass = net_weight <= EMPTY_CARGO_TOLERANCE_KG
        underweight_empty = is_empty_pass and gross_weight >= self.config.weighbridge.empty_vehicle_max_kg
        overweight_loaded = (not is_empty_pass) and gross_weight > self.config.weighbridge.loaded_vehicle_max_kg
        hard_block = underweight_empty or overweight_loaded

        if overload or hard_block:
            snapshot = await self.capture_snapshot()
            captured_at = datetime.now(timezone.utc)
            transaction = await asyncio.to_thread(
                self.database.create_transaction,
                site_code=self.config.site.id,
                booking=self.booking,
                gross_weight_kg=gross_weight,
                captured_at=captured_at,
                entry_at=self.entry_at,
                exit_at=None,
                overload=overload,
                overload_variance_kg=overload_variance,
                underweight_empty=underweight_empty,
                overweight_loaded=overweight_loaded,
                anpr_confidence=self.anpr_result.confidence if self.anpr_result else None,
                entry_photo_url=self.anpr_result.image_path if self.anpr_result else None,
                scale_photo_url=snapshot,
            )
            self.last_transaction = transaction
            self.mqtt.publish("transaction", transaction.model_dump(mode="json"), qos=1)
            await self.send_command(build_command("LIGHT", "EXIT", "RED"))
            await self.send_command(build_command("GATE_CLOSE", "EXIT"))
            await self.send_command(build_command("BUZZER", value="ON"))
            if underweight_empty:
                await self.raise_alert(Alert(
                    type="UNDERWEIGHT_EMPTY",
                    severity="HIGH",
                    title="Underweight empty vehicle detected",
                    description=f"Empty gross weight {gross_weight:,} kg is not under the {self.config.weighbridge.empty_vehicle_max_kg:,} kg empty-vehicle limit.",
                    booking_id=self.booking.id,
                    vehicle_id=self.booking.vehicle_id,
                    driver_id=self.booking.driver_id,
                    evidence_urls=[snapshot] if snapshot else [],
                    metadata={"transaction": transaction.model_dump(mode="json")},
                ))
            if overweight_loaded:
                await self.raise_alert(Alert(
                    type="OVERLOAD",
                    severity="HIGH",
                    title="Loaded vehicle weight limit exceeded",
                    description=f"Loaded gross weight {gross_weight:,} kg exceeds the {self.config.weighbridge.loaded_vehicle_max_kg:,} kg loaded-vehicle limit.",
                    booking_id=self.booking.id,
                    vehicle_id=self.booking.vehicle_id,
                    driver_id=self.booking.driver_id,
                    evidence_urls=[snapshot] if snapshot else [],
                    metadata={"transaction": transaction.model_dump(mode="json")},
                ))
            if overload:
                await self.raise_alert(Alert(
                    type="OVERLOAD",
                    severity="HIGH",
                    title="Overload detected",
                    description=f"Net weight {net_weight:,} kg exceeds the permitted value by {overload_variance:,} kg.",
                    booking_id=self.booking.id,
                    vehicle_id=self.booking.vehicle_id,
                    driver_id=self.booking.driver_id,
                    evidence_urls=[snapshot] if snapshot else [],
                    metadata={"transaction": transaction.model_dump(mode="json")},
                ))
            await self.transition(WeighingState.COMPLETE, "transaction held for review")
            return

        # Weight is within every configured limit. Rather than releasing the exit gate
        # immediately, hold here so the driver can check the captured load on the kiosk
        # and either accept it (exit released) or send the truck back to reload.
        self.pending_gross_weight_kg = gross_weight
        self.pending_captured_at = datetime.now(timezone.utc)
        await self.send_command(build_command("BUZZER", value="OFF"))
        await self.transition(WeighingState.AWAITING_DRIVER_DECISION, "weight captured; awaiting driver load check")

    async def accept_load(self) -> EdgeTransaction:
        if self.state != WeighingState.AWAITING_DRIVER_DECISION or self.booking is None or self.pending_gross_weight_kg is None:
            raise ValueError("No captured weight is awaiting a driver decision")
        gross_weight = self.pending_gross_weight_kg
        captured_at = self.pending_captured_at or datetime.now(timezone.utc)
        snapshot = await self.capture_snapshot()
        exit_release_at = datetime.now(timezone.utc)
        transaction = await asyncio.to_thread(
            self.database.create_transaction,
            site_code=self.config.site.id,
            booking=self.booking,
            gross_weight_kg=gross_weight,
            captured_at=captured_at,
            entry_at=self.entry_at,
            exit_at=exit_release_at,
            overload=False,
            overload_variance_kg=0,
            underweight_empty=False,
            overweight_loaded=False,
            anpr_confidence=self.anpr_result.confidence if self.anpr_result else None,
            entry_photo_url=self.anpr_result.image_path if self.anpr_result else None,
            scale_photo_url=snapshot,
            driver_decision="ACCEPTED",
        )
        self.last_transaction = transaction
        self.mqtt.publish("transaction", transaction.model_dump(mode="json"), qos=1)
        self.pending_gross_weight_kg = None
        self.pending_captured_at = None
        await self.send_command(build_command("LIGHT", "EXIT", "GREEN"))
        await self.send_command(build_command("GATE_OPEN", "EXIT"))
        await self.transition(WeighingState.COMPLETE, "driver accepted load; exit released")
        return transaction

    async def request_reload(self) -> None:
        if self.state != WeighingState.AWAITING_DRIVER_DECISION or self.booking is None:
            raise ValueError("No captured weight is awaiting a driver decision")
        self.pending_gross_weight_kg = None
        self.pending_captured_at = None
        self.positioning_started_at = None
        self.stabilising_started_at = None
        self.weight_window.clear()
        await self.send_command(build_command("LIGHT", "ENTRY", "GREEN"))
        await self.send_command(build_command("GATE_OPEN", "ENTRY"))
        await self.transition(WeighingState.POSITIONING, "driver requested reload; truck returning to loading area")

    async def _driver_mismatch(self, actual_rfid: str) -> None:
        await self.send_command(build_command("LIGHT", "ENTRY", "RED"))
        await self.send_command(build_command("GATE_CLOSE", "ENTRY"))
        await self.send_command(build_command("BUZZER", value="ON"))
        if self.driver_mismatch_alerted:
            return
        self.driver_mismatch_alerted = True
        assert self.booking is not None
        await self.raise_alert(Alert(
            type="DRIVER_MISMATCH",
            severity="CRITICAL",
            title="Driver and plate mismatch",
            description=f"Booking expects RFID {self.booking.driver_rfid}; hardware read {actual_rfid}.",
            booking_id=self.booking.id,
            vehicle_id=self.booking.vehicle_id,
            driver_id=self.booking.driver_id,
            metadata={"expected_rfid": self.booking.driver_rfid, "actual_rfid": actual_rfid},
        ))

    async def _scale_fault(self, description: str) -> None:
        await self.send_command(build_command("LIGHT", "ENTRY", "RED"))
        await self.send_command(build_command("LIGHT", "EXIT", "RED"))
        await self.send_command(build_command("GATE_CLOSE", "ENTRY"))
        await self.send_command(build_command("GATE_CLOSE", "EXIT"))
        await self.transition(WeighingState.FAULT, description)
        if not self.scale_fault_alerted:
            self.scale_fault_alerted = True
            await self.raise_alert(Alert(type="SCALE_FAULT", severity="HIGH", title="Scale fault", description=description))

    async def reset(self) -> None:
        await asyncio.to_thread(self.database.clear_session, self.session_id)
        self.session_id = str(uuid4())
        self.booking = None
        self.anpr_result = None
        self.entry_at = None
        self.positioning_started_at = None
        self.stabilising_started_at = None
        self.weight_window.clear()
        self.driver_mismatch_alerted = False
        self.scale_fault_alerted = False
        self.manual_mode_reason = None
        self.pending_gross_weight_kg = None
        self.pending_captured_at = None
        await self.transition(WeighingState.IDLE, "cycle complete and scale clear")

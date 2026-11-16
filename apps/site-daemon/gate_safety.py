from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Iterable, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError

from config import GateConfig
from models import Alert, TelemetryFrame, WeighingState
from protocol import build_command, parse_command

LOGGER = logging.getLogger(__name__)
GATE_TARGETS = ("ENTRY", "EXIT")
ERROR_STATES = frozenset({WeighingState.FAULT, WeighingState.MANUAL_MODE})


class GateInterlockError(RuntimeError):
    """A gate open was refused by the interlock. The gate was left closed."""


def beam_obstruction(target: str, frame: TelemetryFrame) -> str | None:
    # P1 is the entry-side beam and P2 the exit-side beam. Both blocked means a
    # vehicle is fully on the deck; neither means the deck is clear. The patterns
    # below are the ones where moving the barrier would put it over something
    # other than the vehicle being admitted or released.
    if target == "ENTRY" and frame.position_sensor_2 and not frame.position_sensor_1:
        return "positioning beams report an obstruction on the deck (P2 blocked, P1 clear)"
    if target == "EXIT" and frame.position_sensor_1 != frame.position_sensor_2:
        return "positioning beams report a vehicle straddling the deck (only one beam blocked)"
    return None


def gate_open_refusal(
    target: str,
    *,
    state: str,
    frame: TelemetryFrame | None,
    connected: bool,
    now: datetime,
    telemetry_max_age_seconds: float,
) -> str | None:
    """Why opening `target` is unsafe right now, or None when it may open."""
    if target not in GATE_TARGETS:
        return f"unknown gate {target!r}"
    if state in ERROR_STATES:
        return f"lane is in {state}"
    if not connected:
        return "hardware transport is disconnected"
    if frame is None:
        return "no telemetry received yet; beam state unknown"
    age = (now - frame.received_at).total_seconds()
    if age > telemetry_max_age_seconds:
        return f"telemetry is stale ({age:.1f}s old); beam state unknown"
    if frame.scale_status == "FAULT":
        return "scale reports FAULT"
    return beam_obstruction(target, frame)


def vehicle_in_gate_path(frame: TelemetryFrame | None) -> bool:
    return frame is not None and (frame.position_sensor_1 or frame.position_sensor_2)


class GateController:
    """Single choke point for one lane's barrier relays: interlocks every open,
    remembers the commanded positions and enforces the auto-close timeout."""

    def __init__(
        self,
        *,
        lane_id: str,
        settings: GateConfig,
        transmit: Callable[[bytes], Awaitable[None]],
        state: Callable[[], str],
        frame: Callable[[], TelemetryFrame | None],
        connected: Callable[[], bool],
        alert: Callable[[Alert], Awaitable[None]] | None = None,
        on_change: Callable[[str, str, str], None] | None = None,
        poll_seconds: float = 0.25,
    ) -> None:
        self.lane_id = lane_id
        self.settings = settings
        self.transmit = transmit
        self.state = state
        self.frame = frame
        self.connected = connected
        self.alert = alert
        self.on_change = on_change
        self.poll_seconds = poll_seconds
        self.positions = {target: "CLOSED" for target in GATE_TARGETS}
        self.auto_close_seconds = {target: settings.auto_close_seconds for target in GATE_TARGETS}
        self._timers: dict[str, asyncio.Task[None]] = {}
        self._last_refusal: dict[str, str] = {}

    def open_refusal(self, target: str) -> str | None:
        return gate_open_refusal(
            target,
            state=self.state(),
            frame=self.frame(),
            connected=self.connected(),
            now=datetime.now(timezone.utc),
            telemetry_max_age_seconds=self.settings.telemetry_max_age_seconds,
        )

    async def send(self, command: bytes, *, source: str) -> None:
        action, target, _ = parse_command(command)
        if action not in {"GATE_OPEN", "GATE_CLOSE"}:
            await self.transmit(command)
            return
        if target not in GATE_TARGETS:
            raise ValueError(f"gate command without a valid target: {command!r}")
        if action == "GATE_OPEN":
            refusal = self.open_refusal(target)
            if refusal:
                # The state machine retries on every telemetry frame; only log changes.
                if self._last_refusal.get(target) != refusal:
                    LOGGER.warning("[lane %s] %s gate open refused (source=%s): %s", self.lane_id, target, source, refusal)
                self._last_refusal[target] = refusal
                raise GateInterlockError(f"{target} gate open refused: {refusal}")
            self._last_refusal.pop(target, None)
        await self.transmit(command)
        if action == "GATE_OPEN":
            self._set_position(target, "OPEN", source)
            self._arm_auto_close(target)
        else:
            self._cancel_auto_close(target)
            self._set_position(target, "CLOSED", source)

    def _set_position(self, target: str, position: str, source: str) -> None:
        changed = self.positions[target] != position
        self.positions[target] = position
        LOGGER.info("[lane %s] %s gate %s (source=%s)", self.lane_id, target, position, source)
        if self.on_change is not None and changed:
            self.on_change(target, position, source)

    def _arm_auto_close(self, target: str) -> None:
        self._cancel_auto_close(target)
        self._timers[target] = asyncio.create_task(self._auto_close(target), name=f"gate-auto-close-{self.lane_id}-{target}")

    def _cancel_auto_close(self, target: str) -> None:
        task = self._timers.pop(target, None)
        if task is not None and task is not asyncio.current_task():
            task.cancel()

    def cancel_all(self) -> None:
        for target in list(self._timers):
            self._cancel_auto_close(target)

    async def _auto_close(self, target: str) -> None:
        try:
            await asyncio.sleep(self.auto_close_seconds[target])
            loop = asyncio.get_running_loop()
            waiting_since = loop.time()
            alerted = False
            # Never bring the barrier down onto a vehicle that is still on the beams.
            while vehicle_in_gate_path(self.frame()):
                if not alerted and loop.time() - waiting_since >= self.settings.max_hold_open_seconds:
                    alerted = True
                    if self.alert is not None:
                        await self.alert(Alert(
                            type="GATE_HELD_OPEN", severity="HIGH",
                            title=f"{target.title()} gate held open",
                            description=f"Auto-close of the {target} gate is waiting for the positioning beams to clear.",
                            metadata={"lane": self.lane_id, "gate": target},
                        ))
                await asyncio.sleep(self.poll_seconds)
            await self.send(build_command("GATE_CLOSE", target), source="auto-close")
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("[lane %s] auto-close of %s gate failed", self.lane_id, target)


class GateCommand(BaseModel):
    """Inbound `{prefix}/lane/{n}/gate/command` payload."""

    model_config = ConfigDict(extra="ignore")
    action: Literal["GATE_OPEN", "GATE_CLOSE"]
    target: Literal["ENTRY", "EXIT"]
    ts: str
    seq: StrictInt = Field(ge=0)
    reason: str | None = None
    requested_by: str | None = None
    lane_number: StrictInt | None = None


class GateCommandRejected(ValueError):
    pass


class GateCommandValidator:
    """Validates remote gate commands before anything touches a relay: schema, known
    lane, `ts` within max_age_seconds of now, and `seq` never reused on a lane."""

    def __init__(self, lane_numbers: Callable[[], Iterable[int]] | Iterable[int], max_age_seconds: float = 30) -> None:
        self._lane_numbers = lane_numbers
        self.max_age_seconds = max_age_seconds
        self._seen: dict[int, dict[int, float]] = {}

    def _known_lanes(self) -> set[int]:
        source = self._lane_numbers() if callable(self._lane_numbers) else self._lane_numbers
        return set(source)

    def validate(self, lane_number: int | None, payload: Any, now: datetime | None = None) -> GateCommand:
        if lane_number is None or lane_number not in self._known_lanes():
            raise GateCommandRejected(f"unknown lane {lane_number!r}")
        if not isinstance(payload, dict):
            raise GateCommandRejected("payload must be a JSON object")
        try:
            command = GateCommand.model_validate(payload)
        except ValidationError as error:
            first = error.errors()[0]
            raise GateCommandRejected(f"schema: {'.'.join(str(part) for part in first['loc'])}: {first['msg']}") from error
        if command.lane_number is not None and command.lane_number != lane_number:
            raise GateCommandRejected(f"payload lane_number {command.lane_number} does not match topic lane {lane_number}")
        try:
            sent_at = datetime.fromisoformat(command.ts.replace("Z", "+00:00"))
        except ValueError as error:
            raise GateCommandRejected(f"ts is not ISO-8601: {command.ts!r}") from error
        if sent_at.tzinfo is None:
            raise GateCommandRejected("ts must carry a UTC offset")
        now = now or datetime.now(timezone.utc)
        skew = abs((now - sent_at).total_seconds())
        if skew > self.max_age_seconds:
            raise GateCommandRejected(f"stale command: ts is {skew:.0f}s from now (limit {self.max_age_seconds:.0f}s)")
        seen = self._seen.setdefault(lane_number, {})
        # Anything older than this would already fail the ts check, so it can be forgotten.
        horizon = now.timestamp() - 2 * self.max_age_seconds
        for seq, stamped in list(seen.items()):
            if stamped < horizon:
                del seen[seq]
        if command.seq in seen:
            raise GateCommandRejected(f"replayed seq {command.seq}")
        seen[command.seq] = sent_at.timestamp()
        return command

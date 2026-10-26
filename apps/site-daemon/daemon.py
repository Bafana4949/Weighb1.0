#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import re
import shutil
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

import serial_asyncio
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import cv2
except ImportError:
    cv2 = None

from anpr import AnprEngine, normalise_plate
from cloud_client import CLOUD_ERRORS, CloudClient, describe_error
from config import (
    EDGE_VERSION, AppConfig, ConfigError, LaneConfig, enforce_startup_policy, lane_configs, load_config, simulation_sources,
)
from database import EdgeDatabase
from gate_safety import GateCommandRejected, GateCommandValidator, GateController, GateInterlockError
from heartbeat import LaneHealthSnapshot, build_heartbeat, edge_controller_report, filter_registered, lane_device_reports
from models import ActiveBooking, Alert, AnprResult, CloudEdgeConfig, TelemetryFrame, WeighingState
from mqtt_client import MqttService
from protocol import TelemetryParser, build_command, parse_command
from state_machine import WeighingStateMachine
from sync_worker import SyncWorker
from topics import build_prefix

# Redacts secret-shaped substrings that could end up in a formatted log message
# (e.g. an httpx exception echoing a request URL/header). Nothing in this
# codebase currently interpolates site_api_key/tokens directly into a log
# call, but this is a defence-in-depth net rather than trusting every future
# LOGGER.info/warning/error call site to remember that by hand.
_SECRET_PATTERN = re.compile(r"(site[_-]?api[_-]?key|x-edge-token|password|token|secret|authorization)([=:]\s*)\S+", re.IGNORECASE)
_SITE_KEY_PATTERN = re.compile(r"wbe_[A-Za-z0-9_\-]+")


class JsonLogFormatter(logging.Formatter):
    """Structured (one-JSON-object-per-line) log output, so the daemon's logs
    can be shipped to the same aggregation pipeline as the web app's
    (see apps/web/src/lib/logger.ts) instead of being free-text-parsed."""

    def format(self, record: logging.LogRecord) -> str:
        message = _SECRET_PATTERN.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]", record.getMessage())
        message = _SITE_KEY_PATTERN.sub("wbe_[REDACTED]", message)
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": message,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_handler = logging.StreamHandler()
_handler.setFormatter(JsonLogFormatter())
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), handlers=[_handler])
LOGGER = logging.getLogger("site-daemon")

EDGE_CONFIG_CACHE_KEY = "edge_config"


class CheckInRequest(BaseModel):
    image_path: str | None = None
    manual_plate: str | None = None
    lane: str | None = None


class HardwareCommandRequest(BaseModel):
    action: str
    target: str | None = None
    value: str | None = None
    lane: str | None = None
    reason: str | None = None


class DriverDecisionRequest(BaseModel):
    decision: str
    lane: str | None = None


class ManualOverrideRequest(BaseModel):
    command: HardwareCommandRequest
    operator_id: str
    reason: str
    lane: str | None = None


class LaneResetRequest(BaseModel):
    operator_id: str
    reason: str
    lane: str | None = None


class LaneRuntime:
    """One independent weighing lane: its own hardware transport connection,
    telemetry parser, ANPR engine, gate controller and WeighingStateMachine. A
    BIDIRECTIONAL_SINGLE site runs exactly one of these (id="default"); a
    DUAL_ENTRY_EXIT site runs one per configured lane, all sharing the parent
    Runtime's SQLite ledger, MQTT client and cloud sync worker."""

    def __init__(
        self,
        lane_config: LaneConfig,
        config: AppConfig,
        database: EdgeDatabase,
        mqtt: MqttService,
        fetch_active_booking: Callable[[str], Awaitable[ActiveBooking | None]],
        raise_alert: Callable[[Alert], Awaitable[None]],
    ) -> None:
        self.lane_config = lane_config
        self.config = config
        self.database = database
        self.mqtt = mqtt
        self.fetch_active_booking = fetch_active_booking
        self.raise_alert_upstream = raise_alert
        self.anpr = AnprEngine(config.anpr)
        self.parser = TelemetryParser()
        self.writer: asyncio.StreamWriter | None = None
        self.latest_frame: TelemetryFrame | None = None
        self.last_serial_seen: datetime | None = None
        self.serial_connected = False
        self.check_in_lock = asyncio.Lock()
        self.lights = {"ENTRY": "RED", "EXIT": "RED"}
        self.last_beams: tuple[bool, bool] | None = None
        self.last_rfid_tag: str | None = None
        self.printer_reachable: bool | None = None
        self.gate = GateController(
            lane_id=lane_config.id,
            settings=config.gates,
            transmit=self.transmit,
            state=lambda: self.state_machine.state,
            frame=lambda: self.latest_frame,
            connected=lambda: self.serial_connected,
            alert=self.raise_alert,
            on_change=self.publish_gate_status,
        )
        self.state_machine = WeighingStateMachine(
            config,
            database,
            mqtt,
            self.safe_send_command,
            self.capture_snapshot,
            self.raise_alert,
            lane_number=lane_config.lane_number,
        )

    async def safe_send_command(self, command: bytes) -> None:
        try:
            await self.send_command(command, source="state_machine")
        except ConnectionError:
            LOGGER.debug("[lane %s] command ignored: hardware disconnected", self.lane_config.id)

    async def raise_alert(self, alert: Alert) -> None:
        alert.lane_number = self.lane_config.lane_number
        await self.raise_alert_upstream(alert)

    async def serial_supervisor(self) -> None:
        disconnected_since: datetime | None = None
        while True:
            try:
                if self.lane_config.mode.lower() == "tcp":
                    if not self.lane_config.tcp_host:
                        raise ValueError(f"lane {self.lane_config.id} is configured for tcp mode but has no tcp_host")
                    reader, writer = await asyncio.open_connection(self.lane_config.tcp_host, self.lane_config.tcp_port)
                elif self.lane_config.mode.lower() == "serial":
                    if not self.lane_config.serial_port:
                        raise ValueError(f"lane {self.lane_config.id} is configured for serial mode but has no serial_port")
                    reader, writer = await serial_asyncio.open_serial_connection(
                        url=self.lane_config.serial_port,
                        baudrate=self.lane_config.serial_baud_rate,
                    )
                else:
                    raise ValueError(f"unsupported transport mode: {self.lane_config.mode}")
                self.writer = writer
                self.serial_connected = True
                disconnected_since = None
                LOGGER.info("[lane %s] Hardware transport connected", self.lane_config.id)
                await self.read_telemetry(reader)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self.serial_connected = False
                self.gate.cancel_all()
                if self.writer:
                    self.writer.close()
                    try:
                        await self.writer.wait_closed()
                    except OSError:
                        pass
                self.writer = None
                if disconnected_since is None:
                    disconnected_since = datetime.now(timezone.utc)
                elapsed = (datetime.now(timezone.utc) - disconnected_since).total_seconds()
                if isinstance(error, (OSError, ValueError)):
                    LOGGER.warning("[lane %s] Hardware transport unavailable: %s", self.lane_config.id, error)
                else:
                    LOGGER.exception("[lane %s] Hardware transport loop failed", self.lane_config.id)
                if elapsed >= self.config.serial.manual_mode_after_seconds and self.state_machine.state != WeighingState.MANUAL_MODE:
                    await self.state_machine.enter_manual_mode("Hardware transport disconnected for more than 30 seconds")
                    await self.raise_alert(Alert(type="SENSOR_FAULT", severity="HIGH", title=f"Hardware connection lost (lane {self.lane_config.id})", description=str(error)))
                await asyncio.sleep(self.config.serial.reconnect_seconds)

    async def read_telemetry(self, reader: asyncio.StreamReader) -> None:
        previous_p1 = False
        while True:
            chunk = await reader.read(1024)
            if not chunk:
                raise ConnectionError("hardware transport closed")
            for frame in self.parser.feed(chunk):
                self.latest_frame = frame
                self.last_serial_seen = frame.received_at
                self.publish_frame(frame)
                if frame.position_sensor_1 and not previous_p1 and self.state_machine.booking is None and self.anpr.available:
                    asyncio.create_task(self.automatic_check_in())
                previous_p1 = frame.position_sensor_1
                try:
                    await self.state_machine.process(frame)
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    LOGGER.exception("[lane %s] state machine failed on a telemetry frame", self.lane_config.id)
                    try:
                        await self.state_machine.fail_safe(f"internal error while processing telemetry: {error}")
                    except Exception:
                        LOGGER.exception("[lane %s] fail-safe handling failed", self.lane_config.id)

    def publish_frame(self, frame: TelemetryFrame) -> None:
        lane_number = self.lane_config.lane_number
        self.mqtt.publish("scale/weight", {
            "weight_kg": frame.weight_kg,
            "scale_status": frame.scale_status,
            "lane": self.lane_config.id,
        }, qos=0, lane_number=lane_number)
        beams = (frame.position_sensor_1, frame.position_sensor_2)
        if beams != self.last_beams:
            self.last_beams = beams
            self.mqtt.publish("sensors/state", {
                "position_sensor_1": frame.position_sensor_1,
                "position_sensor_2": frame.position_sensor_2,
                "lane": self.lane_config.id,
            }, qos=1, retain=True, lane_number=lane_number)
        if frame.rfid_tag != self.last_rfid_tag:
            self.last_rfid_tag = frame.rfid_tag
            if frame.rfid_tag:
                self.mqtt.publish("rfid/event", {"rfid_tag": frame.rfid_tag, "lane": self.lane_config.id}, qos=1, lane_number=lane_number)

    async def transmit(self, command: bytes) -> None:
        if not self.writer:
            raise ConnectionError(f"hardware transport is disconnected for lane {self.lane_config.id}")
        self.writer.write(command)
        await self.writer.drain()
        action, target, value = parse_command(command)
        LOGGER.info("[lane %s] UART command: %s", self.lane_config.id, command.decode().strip())
        if action == "LIGHT" and target and value:
            self.lights[target] = value

    async def send_command(self, command: bytes, *, source: str) -> None:
        await self.gate.send(command, source=source)

    def publish_gate_status(self, target: str, position: str, source: str) -> None:
        self.mqtt.publish("gate/status", {
            "target": target,
            "position": position,
            "source": source,
            "gates": dict(self.gate.positions),
            "lane": self.lane_config.id,
        }, qos=1, retain=True, lane_number=self.lane_config.lane_number)

    async def automatic_check_in(self) -> dict[str, Any]:
        if self.check_in_lock.locked() or self.state_machine.booking is not None:
            return {"status": "already-processing"}
        async with self.check_in_lock:
            try:
                source = self.lane_config.camera_source or self.config.anpr.camera_source
                result = await asyncio.to_thread(self.anpr.recognise, source)
                self.anpr.last_error = None
            except Exception as error:
                LOGGER.exception("[lane %s] ANPR pipeline failed", self.lane_config.id)
                self.anpr.last_error = str(error)
                result = AnprResult(plate_text=None, confidence=0, timestamp=datetime.now(timezone.utc), image_path=None, bbox_coordinates=None)
                await self.raise_alert(Alert(type="ANPR_FAILURE", severity="HIGH", title="ANPR failed", description=str(error)))
            return await self.authorise_from_anpr(result)

    async def manual_check_in(self, request: CheckInRequest) -> dict[str, Any]:
        if request.manual_plate:
            result = AnprResult(
                plate_text=request.manual_plate.upper(), confidence=1.0,
                timestamp=datetime.now(timezone.utc), image_path=request.image_path,
                bbox_coordinates=None,
            )
        else:
            if not self.anpr.available:
                raise ValueError(f"ANPR is unavailable ({self.anpr.unavailable_reason}); supply manual_plate")
            source = request.image_path or self.lane_config.camera_source or self.config.anpr.camera_source
            result = await asyncio.to_thread(self.anpr.recognise, source)
        return await self.authorise_from_anpr(result)

    async def authorise_from_anpr(self, result: AnprResult) -> dict[str, Any]:
        if not result.plate_text:
            await self.state_machine.reject_unauthorised(None, result.confidence, result.image_path)
            return {"authorised": False, "reason": "ANPR confidence below threshold", "anpr": result.model_dump(mode="json")}
        plate_normalized = normalise_plate(result.plate_text)
        booking = await self.fetch_active_booking(plate_normalized)
        if not booking:
            await self.state_machine.reject_unauthorised(result.plate_text, result.confidence, result.image_path)
            return {"authorised": False, "reason": "No active booking", "anpr": result.model_dump(mode="json")}
        await asyncio.to_thread(self.database.cache_booking, booking)
        await self.state_machine.authorise(booking, result)
        return {"authorised": True, "booking": booking.model_dump(mode="json"), "anpr": result.model_dump(mode="json")}

    async def capture_snapshot(self) -> str | None:
        source = self.lane_config.camera_source or self.config.anpr.camera_source
        if source is None:
            return None
        source_path = Path(str(source))
        destination = Path(self.config.storage.evidence_directory) / f"scale-{self.lane_config.id}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.jpg"
        try:
            if isinstance(source, str) and source_path.exists():
                shutil.copy2(source_path, destination)
                return str(destination)
            if cv2 is None:
                LOGGER.warning("[lane %s] OpenCV not installed; skipping camera snapshot", self.lane_config.id)
                return None
            capture = cv2.VideoCapture(int(source) if str(source).isdigit() else source)
            try:
                ok, frame = capture.read()
                if not ok:
                    return None
                cv2.imwrite(str(destination), frame)
                return str(destination)
            finally:
                capture.release()
        except OSError:
            LOGGER.exception("[lane %s] Unable to save evidence snapshot", self.lane_config.id)
            return None

    async def refresh_printer_health(self) -> None:
        address = self.lane_config.printer_address
        if not (address and self.lane_config.device_keys.printer):
            self.printer_reachable = None
            return
        host, _, port = address.rpartition(":")
        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(host, int(port)), timeout=2)
            writer.close()
            self.printer_reachable = True
        except (OSError, ValueError, asyncio.TimeoutError):
            self.printer_reachable = False

    def health_snapshot(self) -> LaneHealthSnapshot:
        frame = self.latest_frame
        return LaneHealthSnapshot(
            lane_id=self.lane_config.id,
            lane_number=self.lane_config.lane_number,
            device_keys=self.lane_config.device_keys,
            connected=self.serial_connected,
            telemetry_age_seconds=None if frame is None else (datetime.now(timezone.utc) - frame.received_at).total_seconds(),
            state=str(self.state_machine.state),
            scale_status=frame.scale_status if frame else None,
            weight_kg=frame.weight_kg if frame else None,
            position_sensor_1=frame.position_sensor_1 if frame else None,
            position_sensor_2=frame.position_sensor_2 if frame else None,
            rfid_tag=frame.rfid_tag if frame else None,
            corrupt_frames=self.parser.corrupt_frame_count,
            gates=dict(self.gate.positions),
            lights=dict(self.lights),
            anpr_available=self.anpr.available,
            anpr_message=self.anpr.unavailable_reason,
            anpr_last_error=self.anpr.last_error,
            printer_reachable=self.printer_reachable,
        )

    def health(self) -> dict[str, Any]:
        return {
            "lane": self.lane_config.id,
            "lane_number": self.lane_config.lane_number,
            "status": "ok" if self.serial_connected else "degraded",
            "state": self.state_machine.state,
            "serial_connected": self.serial_connected,
            "gates": dict(self.gate.positions),
            "anpr_available": self.anpr.available,
        }

    def live(self) -> dict[str, Any]:
        frame = self.latest_frame
        return {
            "lane": self.lane_config.id,
            "state": self.state_machine.state,
            "manual_mode_reason": self.state_machine.manual_mode_reason,
            "telemetry": None if frame is None else {
                "weight_kg": frame.weight_kg,
                "position_sensor_1": frame.position_sensor_1,
                "position_sensor_2": frame.position_sensor_2,
                "rfid_tag": frame.rfid_tag,
                "scale_status": frame.scale_status,
                "received_at": frame.received_at,
            },
            "gates": dict(self.gate.positions),
            "booking": self.state_machine.booking,
            "last_transaction": self.state_machine.last_transaction,
            "serial_connected": self.serial_connected,
            "pending_driver_decision": None if self.state_machine.state != WeighingState.AWAITING_DRIVER_DECISION else {
                "gross_weight_kg": self.state_machine.pending_gross_weight_kg,
                "net_weight_kg": (self.state_machine.pending_gross_weight_kg - self.state_machine.booking.tare_weight_kg) if self.state_machine.pending_gross_weight_kg is not None and self.state_machine.booking else None,
                "captured_at": self.state_machine.pending_captured_at,
            },
        }


class Runtime:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.started_at = time.monotonic()
        self.database = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
        self.loop = asyncio.get_running_loop()
        self.mqtt = MqttService(config, self.loop)
        self.cloud = CloudClient(config)
        self.edge_config: CloudEdgeConfig | None = None
        self.simulation_active = False
        self.simulation_halted = False
        self.cloud_offline_since: datetime | None = None
        self.sync_failure_alerted = False
        self.heartbeat_failures = 0
        self._reported_unregistered: set[str] = set()
        self.tasks: list[asyncio.Task[Any]] = []
        self.sync_worker = SyncWorker(config, self.database, self.mqtt)
        self.lanes: dict[str, LaneRuntime] = {
            lane_config.id: LaneRuntime(lane_config, config, self.database, self.mqtt, self.fetch_active_booking, self.raise_alert)
            for lane_config in lane_configs(config)
        }
        self.gate_commands = GateCommandValidator(
            lambda: [lane.lane_config.lane_number for lane in self.lanes.values()],
            config.gates.command_max_age_seconds,
        )
        self.mqtt.command_handler = self.handle_mqtt_command

    def lane(self, lane_id: str | None) -> LaneRuntime:
        if lane_id is not None:
            runtime = self.lanes.get(lane_id)
            if runtime is None:
                raise HTTPException(status_code=404, detail=f"Unknown lane '{lane_id}'. Configured lanes: {list(self.lanes)}")
            return runtime
        # Default to the first configured lane if none provided, allowing
        # single-lane dashboard components to gracefully fall back to lane A
        # rather than completely breaking with a 422 error.
        return next(iter(self.lanes.values()))

    def lane_by_number(self, lane_number: int) -> LaneRuntime | None:
        return next((lane for lane in self.lanes.values() if lane.lane_config.lane_number == lane_number), None)

    async def start(self) -> None:
        Path(self.config.storage.evidence_directory).mkdir(parents=True, exist_ok=True)
        requeued = await asyncio.to_thread(self.database.reset_inflight_sync)
        if requeued:
            LOGGER.info("Re-queued %d sync item(s) that were in flight at shutdown", requeued)
        # Must run before anything can drive hardware: it can refuse to start.
        await self.refresh_edge_config(startup=True)
        self.mqtt.start()
        await self.bootstrap_chain_head()
        self.tasks = [
            asyncio.create_task(self.sync_worker.run(), name="sync-worker"),
            asyncio.create_task(self.heartbeat_loop(), name="heartbeat"),
            asyncio.create_task(self.edge_config_loop(), name="edge-config"),
            asyncio.create_task(self.sync_failure_monitor(), name="sync-failure-monitor"),
            asyncio.create_task(self.backup_loop(), name="backup-loop"),
        ]
        for lane_id, lane in self.lanes.items():
            self.tasks.append(asyncio.create_task(lane.serial_supervisor(), name=f"serial-supervisor-{lane_id}"))
        chain_problems = await asyncio.to_thread(self.database.verify_chain)
        if chain_problems:
            await self.raise_alert(Alert(
                type="LEDGER_INTEGRITY",
                severity="CRITICAL",
                title="Local transaction ledger failed hash-chain verification",
                description=f"{len(chain_problems)} problem(s): {'; '.join(chain_problems[:5])}",
                metadata={"problems": chain_problems[:50]},
            ))
        incomplete = await asyncio.to_thread(self.database.incomplete_sessions)
        if incomplete:
            await self.raise_alert(Alert(
                type="POWER_RECOVERY",
                severity="HIGH",
                title="Incomplete transaction recovery",
                description=f"Found {len(incomplete)} incomplete edge session(s) after startup. Operator review is required.",
                metadata={"sessions": incomplete},
            ))

    async def stop(self) -> None:
        self.sync_worker.stop()
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        for lane in self.lanes.values():
            lane.gate.cancel_all()
            if lane.writer:
                lane.writer.close()
                try:
                    await lane.writer.wait_closed()
                except OSError:
                    pass
        self.mqtt.stop()
        await self.cloud.close()

    def topic_prefix(self, edge_config: CloudEdgeConfig | None) -> str | None:
        if edge_config is not None:
            return edge_config.mqtt.topic_prefix
        site = self.config.site
        if site.organisation_id and site.cloud_id:
            try:
                return build_prefix(site.organisation_id, site.cloud_id)
            except ValueError as error:
                LOGGER.error("%s", error)
        return None

    async def refresh_edge_config(self, startup: bool = False) -> None:
        edge_config: CloudEdgeConfig | None = None
        source = "cloud"
        try:
            edge_config = await self.cloud.fetch_edge_config()
            await asyncio.to_thread(self.database.set_metadata, EDGE_CONFIG_CACHE_KEY, edge_config.model_dump_json(by_alias=True))
        except CLOUD_ERRORS as error:
            if self.edge_config is not None:
                LOGGER.warning("Could not refresh edge config from the cloud (%s); keeping the last known copy", describe_error(error))
                return
            source = "cache"
            cached = await asyncio.to_thread(self.database.get_metadata, EDGE_CONFIG_CACHE_KEY)
            if cached:
                try:
                    edge_config = CloudEdgeConfig.model_validate_json(cached)
                except ValueError:
                    LOGGER.warning("Ignoring unreadable cached edge config")
            LOGGER.warning("Cloud edge config unavailable (%s); using %s", describe_error(error), "the cached copy" if edge_config else "config.yaml only")
        await self.apply_edge_config(edge_config, source=source, startup=startup)

    async def apply_edge_config(self, edge_config: CloudEdgeConfig | None, *, source: str, startup: bool) -> None:
        if edge_config is not None:
            site = edge_config.site
            if site.code != self.config.site.id:
                message = f"the site API key belongs to site {site.code}, but this edge is configured for site {self.config.site.id}"
                if startup:
                    raise ConfigError(f"refusing to start: {message}")
                LOGGER.error("%s; ignoring the %s edge config", message, source)
                return
            if site.operating_tier == "MANUAL":
                LOGGER.warning("Site %s is on the MANUAL tier; it is not expected to run an edge controller", site.code)
            cloud_lanes = {lane.lane_number for lane in edge_config.lanes}
            for lane in self.lanes.values():
                if cloud_lanes and lane.lane_config.lane_number not in cloud_lanes:
                    LOGGER.warning("Lane %s (laneNumber %s) has no matching lane in the cloud", lane.lane_config.id, lane.lane_config.lane_number)
            self.apply_gate_settings(edge_config)
            LOGGER.info(
                "Edge config (%s): site %s (%s), tier %s, %d lane(s), %d device(s)",
                source, site.code, site.id, site.operating_tier, len(edge_config.lanes), len(edge_config.devices),
            )
        if startup:
            enforce_startup_policy(self.config, edge_config)
        sources = simulation_sources(self.config, edge_config)
        if sources and self.config.runtime.production and not self.config.runtime.allow_simulation:
            await self.halt_for_simulation(sources)
        self.simulation_active = bool(sources)
        self.mqtt.simulated = self.simulation_active
        if sources:
            LOGGER.warning("SIMULATION ACTIVE: %s", "; ".join(sources))
        prefix = self.topic_prefix(edge_config)
        if prefix:
            try:
                self.mqtt.set_topic_prefix(prefix)
            except ValueError as error:
                LOGGER.error("%s", error)
        elif self.mqtt.topics is None:
            LOGGER.warning("MQTT topic prefix unknown (cloud unreachable and site.organisation_id/site.cloud_id unset); MQTT messages are buffered")
        if edge_config is not None:
            self.edge_config = edge_config

    def apply_gate_settings(self, edge_config: CloudEdgeConfig) -> None:
        for lane in self.lanes.values():
            keys = lane.lane_config.device_keys
            for target, device_key in (("ENTRY", keys.entry_gate), ("EXIT", keys.exit_gate)):
                device = edge_config.device(device_key)
                delay = (device.configuration or {}).get("autoCloseDelaySeconds") if device else None
                if isinstance(delay, (int, float)) and not isinstance(delay, bool) and 1 <= delay <= 600:
                    lane.gate.auto_close_seconds[target] = float(delay)

    async def halt_for_simulation(self, sources: list[str]) -> None:
        """A simulated device appeared after startup in production: stop driving hardware."""
        if self.simulation_halted:
            return
        self.simulation_halted = True
        reason = "Simulated hardware detected in production: " + "; ".join(sources)
        LOGGER.critical(reason)
        for lane in self.lanes.values():
            await lane.state_machine.enter_manual_mode(reason)
        await self.raise_alert(Alert(type="SIMULATION_IN_PRODUCTION", severity="CRITICAL", title="Simulated hardware in production", description=reason))

    async def edge_config_loop(self) -> None:
        while True:
            # Retry sooner while the cloud identity (and so the topic prefix) is unknown.
            await asyncio.sleep(self.config.cloud.config_refresh_seconds if self.edge_config is not None else 30)
            try:
                await self.refresh_edge_config()
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("Edge config refresh failed")

    async def bootstrap_chain_head(self) -> None:
        try:
            chain_hash = await self.cloud.fetch_chain_head()
            if chain_hash:
                changed = await asyncio.to_thread(self.database.bootstrap_chain_head, chain_hash)
                if changed:
                    LOGGER.info("Bootstrapped local transaction chain from cloud head %s", chain_hash)
        except CLOUD_ERRORS as error:
            LOGGER.warning("Unable to bootstrap cloud chain head; continuing with local ledger: %s", describe_error(error))

    async def handle_mqtt_command(self, topic: str, lane_number: int | None, payload: Any) -> None:
        try:
            command = self.gate_commands.validate(lane_number, payload)
        except GateCommandRejected as error:
            LOGGER.warning("Rejected MQTT gate command on %s: %s", topic, error)
            return
        lane = self.lane_by_number(lane_number)  # type: ignore[arg-type]
        if lane is None:
            LOGGER.warning("Rejected MQTT gate command on %s: lane disappeared", topic)
            return
        source = f"mqtt:{command.requested_by or 'unknown'}"
        try:
            await lane.send_command(build_command(command.action, command.target), source=source)
            LOGGER.info("Applied MQTT gate command %s %s on lane %s (seq %s, reason %r)", command.action, command.target, lane_number, command.seq, command.reason)
        except GateInterlockError as error:
            LOGGER.warning("MQTT gate command on %s refused: %s", topic, error)
        except ConnectionError as error:
            LOGGER.warning("MQTT gate command on %s not delivered: %s", topic, error)
        except Exception:
            LOGGER.exception("MQTT gate command on %s failed", topic)

    async def fetch_active_booking(self, plate_normalized: str) -> ActiveBooking | None:
        try:
            booking = await self.cloud.fetch_active_booking(plate_normalized)
            if booking:
                return booking
        except CLOUD_ERRORS as error:
            LOGGER.warning("Cloud booking lookup failed; using local cache: %s", describe_error(error))
        return await asyncio.to_thread(self.database.find_active_booking, plate_normalized, self.config.site.id)

    async def raise_alert(self, alert: Alert) -> None:
        payload = alert.model_dump(mode="json")
        payload["site_id"] = self.config.site.id
        await asyncio.to_thread(self.database.store_incident, payload)
        self.mqtt.publish("alerts", payload, qos=1, lane_number=alert.lane_number)
        if alert.severity in {"HIGH", "CRITICAL"}:
            print("\a", end="", flush=True)
        LOGGER.warning("%s: %s", alert.title, alert.description)

    async def build_heartbeat_payload(self) -> dict[str, Any]:
        counts = await asyncio.to_thread(self.database.sync_counts)
        snapshots: list[LaneHealthSnapshot] = []
        for lane in self.lanes.values():
            await lane.refresh_printer_health()
            snapshots.append(lane.health_snapshot())
        devices = [edge_controller_report(
            self.config.edge.device_key,
            lanes=snapshots,
            mqtt_connected=self.mqtt.connected,
            cloud_online=self.sync_worker.cloud_online,
            environment=self.config.runtime.environment,
            simulated=self.simulation_active,
        )]
        for snapshot in snapshots:
            devices.extend(lane_device_reports(snapshot, self.config.gates.telemetry_max_age_seconds))
        registered = {device.device_key for device in self.edge_config.devices} if self.edge_config else None
        devices, dropped = filter_registered(devices, registered, always=[self.config.edge.device_key])
        unreported = set(dropped) - self._reported_unregistered
        if unreported:
            self._reported_unregistered |= unreported
            LOGGER.warning("Not reporting device keys the cloud has not registered: %s", ", ".join(sorted(unreported)))
        return build_heartbeat(
            edge_version=EDGE_VERSION,
            pending_sync=counts["pending"],
            failed_sync=counts["failed"],
            mqtt_connected=self.mqtt.connected,
            uptime_seconds=time.monotonic() - self.started_at,
            devices=devices,
            simulated=self.simulation_active,
        )

    async def send_heartbeat(self) -> None:
        payload = await self.build_heartbeat_payload()
        self.mqtt.publish("edge/heartbeat", payload, qos=0, retain=True)
        self.mqtt.publish("hardware/status", {"devices": payload["devices"]}, qos=0, retain=True)
        if not self.config.cloud.api_url:
            return
        try:
            await self.cloud.send_heartbeat(payload)
        except CLOUD_ERRORS as error:
            self.heartbeat_failures += 1
            if self.heartbeat_failures == 1 or self.heartbeat_failures % 20 == 0:
                LOGGER.warning("Cloud heartbeat failed (%d consecutive): %s", self.heartbeat_failures, describe_error(error))
            return
        if self.heartbeat_failures:
            LOGGER.info("Cloud heartbeat restored after %d failure(s)", self.heartbeat_failures)
        self.heartbeat_failures = 0

    async def heartbeat_loop(self) -> None:
        while True:
            try:
                await self.send_heartbeat()
            except asyncio.CancelledError:
                raise
            except Exception:
                # A heartbeat problem must never take the daemon (or weighing) down.
                LOGGER.exception("Heartbeat cycle failed")
            await asyncio.sleep(self.config.cloud.heartbeat_interval_seconds)

    async def sync_failure_monitor(self) -> None:
        while True:
            pending = await asyncio.to_thread(self.database.pending_count)
            if pending > 0 and not self.sync_worker.cloud_online:
                if self.cloud_offline_since is None:
                    self.cloud_offline_since = datetime.now(timezone.utc)
                elapsed = (datetime.now(timezone.utc) - self.cloud_offline_since).total_seconds()
                if elapsed >= 300 and not self.sync_failure_alerted:
                    self.sync_failure_alerted = True
                    await self.raise_alert(Alert(
                        type="CLOUD_SYNC_FAILURE",
                        severity="MEDIUM",
                        title="Cloud synchronisation delayed",
                        description=f"Cloud reconciliation has been unavailable for more than five minutes with {pending} queued item(s).",
                        metadata={"pending_count": pending, "offline_seconds": int(elapsed)},
                    ))
            else:
                self.cloud_offline_since = None
                self.sync_failure_alerted = False
            await asyncio.sleep(15)

    async def backup_loop(self) -> None:
        while True:
            await asyncio.sleep(self.config.storage.backup_interval_seconds)
            try:
                destination = await asyncio.to_thread(self.database.backup)
                LOGGER.info("SQLite backup created: %s", destination)
            except (OSError, sqlite3.Error):
                LOGGER.exception("SQLite backup failed")


runtime: Runtime | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global runtime
    try:
        config = load_config()
        enforce_startup_policy(config)
        service = Runtime(config)
        try:
            await service.start()
        except BaseException:
            await service.cloud.close()
            raise
    except ConfigError as error:
        LOGGER.critical("%s", error)
        raise
    runtime = service
    yield
    runtime = None
    await service.stop()


def _cors_origins() -> list[str]:
    return [origin.strip() for origin in os.getenv("WB_CORS_ORIGINS", "").split(",") if origin.strip()]


app = FastAPI(title="Weighbridge Site Edge Daemon", version=EDGE_VERSION, lifespan=lifespan)
if _cors_origins():
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def get_runtime() -> Runtime:
    if runtime is None:
        raise HTTPException(status_code=503, detail="daemon is starting")
    return runtime


async def require_edge_token(x_edge_token: str | None = Header(default=None)) -> None:
    """Every mutating endpoint needs the local operator token (WB_LOCAL_API_TOKEN)."""
    expected = get_runtime().config.runtime.local_api_token
    if expected is None:
        raise HTTPException(status_code=503, detail="local operator API is disabled: WB_LOCAL_API_TOKEN is not set")
    if not x_edge_token or not hmac.compare_digest(x_edge_token.encode(), expected.get_secret_value().encode()):
        raise HTTPException(status_code=401, detail="missing or invalid x-edge-token")


def _require_reason(reason: str) -> str:
    cleaned = reason.strip()
    if len(cleaned) < 10:
        raise HTTPException(status_code=422, detail="reason must contain at least 10 characters")
    return cleaned


@app.get("/health")
async def health() -> dict[str, Any]:
    service = get_runtime()
    lanes = [lane.health() for lane in service.lanes.values()]
    single = lanes[0] if len(lanes) == 1 else None
    return {
        # Top-level fields mirror the single lane for BIDIRECTIONAL_SINGLE sites,
        # so every existing single-lane consumer (scenarios.py's detect_site,
        # the web app's edge/live proxy, monitoring) keeps working unmodified.
        "status": single["status"] if single else ("ok" if all(l["serial_connected"] for l in lanes) else "degraded"),
        "site_id": service.config.site.id,
        "topology": service.config.site.topology,
        "operating_tier": service.edge_config.site.operating_tier if service.edge_config else None,
        "environment": service.config.runtime.environment,
        "simulated": service.simulation_active,
        "edge_version": EDGE_VERSION,
        "state": single["state"] if single else None,
        "serial_connected": single["serial_connected"] if single else all(l["serial_connected"] for l in lanes),
        "mqtt_connected": service.mqtt.connected,
        "cloud_connected": service.sync_worker.cloud_online,
        "pending_sync": await asyncio.to_thread(service.database.pending_count),
        "lanes": lanes,
    }


@app.get("/edge/live")
async def live(lane: str | None = None) -> dict[str, Any]:
    service = get_runtime()
    lane_runtime = service.lane(lane)
    data = lane_runtime.live()
    data["pending_sync"] = await asyncio.to_thread(service.database.pending_count)
    return data


@app.post("/edge/check-in", dependencies=[Depends(require_edge_token)])
async def check_in(request: CheckInRequest) -> dict[str, Any]:
    try:
        return await get_runtime().lane(request.lane).manual_check_in(request)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/edge/command", dependencies=[Depends(require_edge_token)])
async def command(request: HardwareCommandRequest) -> dict[str, Any]:
    service = get_runtime()
    lane_runtime = service.lane(request.lane)
    try:
        packet = build_command(request.action, request.target, request.value)
        await lane_runtime.send_command(packet, source="operator-api")
    except GateInterlockError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (ValueError, ConnectionError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    LOGGER.info("[lane %s] operator command %s (reason %r)", lane_runtime.lane_config.id, packet.decode().strip(), request.reason)
    return {"success": True, "command": packet.decode().strip(), "lane": lane_runtime.lane_config.id}


@app.post("/edge/driver-decision", dependencies=[Depends(require_edge_token)])
async def driver_decision(request: DriverDecisionRequest) -> dict[str, Any]:
    lane_runtime = get_runtime().lane(request.lane)
    try:
        if request.decision == "ACCEPT":
            transaction = await lane_runtime.state_machine.accept_load()
            return {"success": True, "transaction": transaction.model_dump(mode="json")}
        if request.decision == "RELOAD":
            await lane_runtime.state_machine.request_reload()
            return {"success": True}
        raise HTTPException(status_code=422, detail="decision must be ACCEPT or RELOAD")
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/edge/manual-override", dependencies=[Depends(require_edge_token)])
async def manual_override(request: ManualOverrideRequest) -> dict[str, Any]:
    reason = _require_reason(request.reason)
    service = get_runtime()
    lane_runtime = service.lane(request.lane or request.command.lane)
    try:
        packet = build_command(request.command.action, request.command.target, request.command.value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    LOGGER.warning("[lane %s] manual override by %s: %s (reason %r)", lane_runtime.lane_config.id, request.operator_id, packet.decode().strip(), reason)
    try:
        await lane_runtime.send_command(packet, source=f"manual-override:{request.operator_id}")
    except GateInterlockError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ConnectionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    await lane_runtime.raise_alert(Alert(
        type="MANUAL_OVERRIDE",
        severity="MEDIUM",
        title="Manual hardware override",
        description=reason,
        metadata={"operator_id": request.operator_id, "command": packet.decode().strip(), "lane": lane_runtime.lane_config.id},
    ))
    return {"success": True}


@app.post("/edge/lane-reset", dependencies=[Depends(require_edge_token)])
async def lane_reset(request: LaneResetRequest) -> dict[str, Any]:
    """Return a lane from FAULT / MANUAL_MODE to IDLE (gates closed) after operator review."""
    reason = _require_reason(request.reason)
    lane_runtime = get_runtime().lane(request.lane)
    try:
        previous = await lane_runtime.state_machine.operator_reset(reason)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    await lane_runtime.raise_alert(Alert(
        type="LANE_RESET",
        severity="MEDIUM",
        title="Lane reset by operator",
        description=reason,
        booking_id=previous["booking_id"],
        metadata={"operator_id": request.operator_id, "previous_state": previous["state"], "lane": lane_runtime.lane_config.id},
    ))
    return {"success": True, "state": lane_runtime.state_machine.state}


@app.get("/edge/lanes")
async def lanes() -> dict[str, Any]:
    service = get_runtime()
    return {"success": True, "data": [{"id": lane_id, "lane_number": lane.lane_config.lane_number} for lane_id, lane in service.lanes.items()]}


@app.get("/edge/transactions")
async def transactions(limit: int = 20) -> dict[str, Any]:
    rows = await asyncio.to_thread(get_runtime().database.recent_transactions, min(max(limit, 1), 100))
    return {"success": True, "data": rows}


if __name__ == "__main__":
    uvicorn.run("daemon:app", host="0.0.0.0", port=8000, reload=False)

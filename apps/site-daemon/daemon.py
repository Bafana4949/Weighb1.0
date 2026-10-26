#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx
import serial_asyncio
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import cv2
except ImportError:
    cv2 = None

from anpr import AnprEngine, normalise_plate
from config import AppConfig, LaneConfig, load_config
from database import EdgeDatabase
from models import ActiveBooking, Alert, AnprResult, TelemetryFrame, WeighingState
from mqtt_client import MqttService
from protocol import TelemetryParser, build_command
from state_machine import WeighingStateMachine
from sync_worker import SyncWorker

# Redacts secret-shaped substrings that could end up in a formatted log message
# (e.g. an httpx exception echoing a request URL/header). Nothing in this
# codebase currently interpolates site_api_key/tokens directly into a log
# call, but this is a defence-in-depth net rather than trusting every future
# LOGGER.info/warning/error call site to remember that by hand.
_SECRET_PATTERN = re.compile(r"(site[_-]?api[_-]?key|password|token|secret|authorization)=\S+", re.IGNORECASE)


class JsonLogFormatter(logging.Formatter):
    """Structured (one-JSON-object-per-line) log output, so the daemon's logs
    can be shipped to the same aggregation pipeline as the web app's
    (see apps/web/src/lib/logger.ts) instead of being free-text-parsed."""

    def format(self, record: logging.LogRecord) -> str:
        message = _SECRET_PATTERN.sub(lambda m: f"{m.group(1)}=[REDACTED]", record.getMessage())
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

DEFAULT_LANE_ID = "default"


class CheckInRequest(BaseModel):
    image_path: str | None = None
    manual_plate: str | None = None
    lane: str | None = None


class HardwareCommandRequest(BaseModel):
    action: str
    target: str | None = None
    value: str | None = None
    lane: str | None = None


class DriverDecisionRequest(BaseModel):
    decision: str
    lane: str | None = None


class ManualOverrideRequest(BaseModel):
    command: HardwareCommandRequest
    operator_id: str
    reason: str
    lane: str | None = None


class LaneRuntime:
    """One independent weighing lane: its own hardware transport connection,
    telemetry parser, ANPR engine and WeighingStateMachine. A BIDIRECTIONAL_SINGLE
    site runs exactly one of these (id="default"); a DUAL_ENTRY_EXIT site runs one
    per configured lane, all sharing the parent Runtime's SQLite ledger, MQTT
    client and cloud sync worker."""

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
            await self.send_command(command)
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
            except (OSError, ValueError) as error:
                self.serial_connected = False
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
                LOGGER.warning("[lane %s] Hardware transport unavailable: %s", self.lane_config.id, error)
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
                self.mqtt.publish("telemetry", {
                    "weight_kg": frame.weight_kg,
                    "position_sensor_1": frame.position_sensor_1,
                    "position_sensor_2": frame.position_sensor_2,
                    "rfid_tag": frame.rfid_tag,
                    "scale_status": frame.scale_status,
                    "lane": self.lane_config.id,
                }, qos=0, lane_number=self.lane_config.lane_number)
                if frame.position_sensor_1 and not previous_p1 and self.state_machine.booking is None:
                    asyncio.create_task(self.automatic_check_in())
                previous_p1 = frame.position_sensor_1
                await self.state_machine.process(frame)

    async def send_command(self, command: bytes) -> None:
        if not self.writer:
            raise ConnectionError(f"hardware transport is disconnected for lane {self.lane_config.id}")
        self.writer.write(command)
        await self.writer.drain()
        text = command.decode().strip()
        LOGGER.info("[lane %s] UART command: %s", self.lane_config.id, text)
        if text.startswith("@CMD:GATE_OPEN") or text.startswith("@CMD:GATE_CLOSE"):
            target = "ENTRY" if "TGT:ENTRY" in text else "EXIT"
            position = "OPEN" if "GATE_OPEN" in text else "CLOSED"
            self.mqtt.publish("gate/status", {"target": target, "position": position, "source": "commanded", "lane": self.lane_config.id}, qos=1, retain=True, lane_number=self.lane_config.lane_number)

    async def automatic_check_in(self) -> dict[str, Any]:
        if self.check_in_lock.locked() or self.state_machine.booking is not None:
            return {"status": "already-processing"}
        async with self.check_in_lock:
            try:
                source = self.lane_config.camera_source or self.config.anpr.camera_source
                result = await asyncio.to_thread(self.anpr.recognise, source)
            except Exception as error:
                LOGGER.exception("[lane %s] ANPR pipeline failed", self.lane_config.id)
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

    def health(self) -> dict[str, Any]:
        return {
            "lane": self.lane_config.id,
            "lane_number": self.lane_config.lane_number,
            "status": "ok" if self.serial_connected else "degraded",
            "state": self.state_machine.state,
            "serial_connected": self.serial_connected,
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
        self.database = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
        self.loop = asyncio.get_running_loop()
        self.mqtt = MqttService(config, self.loop)
        self.cloud_offline_since: datetime | None = None
        self.sync_failure_alerted = False
        self.tasks: list[asyncio.Task[Any]] = []
        self.sync_worker = SyncWorker(config, self.database, self.mqtt)

        lane_configs = config.lanes or [LaneConfig(
            id=DEFAULT_LANE_ID, lane_number=1, mode=config.transport.mode,
            tcp_host=config.transport.tcp_host, tcp_port=config.transport.tcp_port,
            serial_port=config.serial.port, serial_baud_rate=config.serial.baud_rate,
        )]
        self.lanes: dict[str, LaneRuntime] = {
            lane_config.id: LaneRuntime(lane_config, config, self.database, self.mqtt, self.fetch_active_booking, self.raise_alert)
            for lane_config in lane_configs
        }
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

    async def start(self) -> None:
        Path(self.config.storage.evidence_directory).mkdir(parents=True, exist_ok=True)
        self.mqtt.start()
        await self.bootstrap_chain_head()
        self.tasks = [
            asyncio.create_task(self.sync_worker.run(), name="sync-worker"),
            asyncio.create_task(self.heartbeat_loop(), name="heartbeat"),
            asyncio.create_task(self.sync_failure_monitor(), name="sync-failure-monitor"),
            asyncio.create_task(self.backup_loop(), name="backup-loop"),
        ]
        for lane_id, lane in self.lanes.items():
            self.tasks.append(asyncio.create_task(lane.serial_supervisor(), name=f"serial-supervisor-{lane_id}"))
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
            if lane.writer:
                lane.writer.close()
                await lane.writer.wait_closed()
        self.mqtt.stop()

    async def bootstrap_chain_head(self) -> None:
        endpoint = f"{self.config.cloud.api_url.rstrip('/')}/transactions/chain-head"
        try:
            async with httpx.AsyncClient(timeout=self.config.cloud.request_timeout_seconds) as client:
                response = await client.get(endpoint, params={"site": self.config.site.id}, headers={"x-site-api-key": self.config.cloud.site_api_key})
                response.raise_for_status()
                chain_hash = response.json().get("data", {}).get("integrity_hash")
                if chain_hash:
                    changed = await asyncio.to_thread(self.database.bootstrap_chain_head, chain_hash)
                    if changed:
                        LOGGER.info("Bootstrapped local transaction chain from cloud head %s", chain_hash)
        except (httpx.HTTPError, ValueError, AttributeError) as error:
            LOGGER.warning("Unable to bootstrap cloud chain head; continuing with local ledger: %s", error)

    async def handle_mqtt_command(self, payload: dict[str, Any]) -> None:
        command = build_command(payload["action"], payload.get("target"), payload.get("value"))
        await self.lane(payload.get("lane")).send_command(command)

    async def fetch_active_booking(self, plate_normalized: str) -> ActiveBooking | None:
        endpoint = f"{self.config.cloud.api_url.rstrip('/')}/bookings/active"
        try:
            async with httpx.AsyncClient(timeout=self.config.cloud.request_timeout_seconds) as client:
                response = await client.get(endpoint, params={"plate": plate_normalized, "site": self.config.site.id}, headers={"x-site-api-key": self.config.cloud.site_api_key})
                response.raise_for_status()
                data = response.json().get("data")
                if data:
                    return ActiveBooking.model_validate(data)
        except (httpx.HTTPError, ValueError) as error:
            LOGGER.warning("Cloud booking lookup failed; using local cache: %s", error)
        return await asyncio.to_thread(self.database.find_active_booking, plate_normalized, self.config.site.id)

    async def raise_alert(self, alert: Alert) -> None:
        payload = alert.model_dump(mode="json")
        payload["site_id"] = self.config.site.id
        await asyncio.to_thread(self.database.store_incident, payload)
        self.mqtt.publish("alerts", payload, qos=1, lane_number=alert.lane_number)
        if alert.severity in {"HIGH", "CRITICAL"}:
            print("\a", end="", flush=True)
        LOGGER.warning("%s: %s", alert.title, alert.description)

    async def heartbeat_loop(self) -> None:
        while True:
            for lane in self.lanes.values():
                self.mqtt.publish("hardware/status", {
                    "health": "ONLINE" if lane.serial_connected else "OFFLINE",
                    "serial_connected": lane.serial_connected,
                    "mqtt_connected": self.mqtt.connected,
                    "cloud_connected": self.sync_worker.cloud_online,
                    "last_seen": lane.last_serial_seen.isoformat() if lane.last_serial_seen else None,
                    "state": lane.state_machine.state,
                    "corrupt_frames": lane.parser.corrupt_frame_count,
                    "lane": lane.lane_config.id,
                }, qos=0, retain=True, lane_number=lane.lane_config.lane_number)
            await asyncio.sleep(10)

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
            destination = await asyncio.to_thread(self.database.backup)
            LOGGER.info("SQLite backup created: %s", destination)


runtime: Runtime | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global runtime
    runtime = Runtime(load_config())
    await runtime.start()
    yield
    await runtime.stop()


app = FastAPI(title="Weighbridge Site Edge Daemon", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3010",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3010",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_runtime() -> Runtime:
    if runtime is None:
        raise HTTPException(status_code=503, detail="daemon is starting")
    return runtime


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


@app.post("/edge/check-in")
async def check_in(request: CheckInRequest) -> dict[str, Any]:
    return await get_runtime().lane(request.lane).manual_check_in(request)


@app.post("/edge/command")
async def command(request: HardwareCommandRequest) -> dict[str, Any]:
    service = get_runtime()
    lane_runtime = service.lane(request.lane)
    try:
        packet = build_command(request.action, request.target, request.value)
        await lane_runtime.send_command(packet)
    except (ValueError, ConnectionError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"success": True, "command": packet.decode().strip(), "lane": lane_runtime.lane_config.id}


@app.post("/edge/driver-decision")
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


@app.post("/edge/manual-override")
async def manual_override(request: ManualOverrideRequest) -> dict[str, Any]:
    if len(request.reason.strip()) < 10:
        raise HTTPException(status_code=422, detail="override reason must contain at least 10 characters")
    service = get_runtime()
    lane_runtime = service.lane(request.lane)
    packet = build_command(request.command.action, request.command.target, request.command.value)
    await lane_runtime.send_command(packet)
    await lane_runtime.raise_alert(Alert(
        type="MANUAL_OVERRIDE",
        severity="MEDIUM",
        title="Manual hardware override",
        description=request.reason,
        metadata={"operator_id": request.operator_id, "command": packet.decode().strip()},
    ))
    return {"success": True}


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

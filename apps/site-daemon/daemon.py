#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import httpx
import serial_asyncio
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from anpr import AnprEngine, normalise_plate
from config import AppConfig, load_config
from database import EdgeDatabase
from models import ActiveBooking, Alert, AnprResult, TelemetryFrame, WeighingState
from mqtt_client import MqttService
from protocol import TelemetryParser, build_command
from state_machine import WeighingStateMachine
from sync_worker import SyncWorker

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
LOGGER = logging.getLogger("site-daemon")


class CheckInRequest(BaseModel):
    image_path: str | None = None
    manual_plate: str | None = None


class HardwareCommandRequest(BaseModel):
    action: str
    target: str | None = None
    value: str | None = None


class DriverDecisionRequest(BaseModel):
    decision: str


class ManualOverrideRequest(BaseModel):
    command: HardwareCommandRequest
    operator_id: str
    reason: str


class Runtime:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.database = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
        self.anpr = AnprEngine(config.anpr)
        self.parser = TelemetryParser()
        self.loop = asyncio.get_running_loop()
        self.mqtt = MqttService(config, self.loop)
        self.writer: asyncio.StreamWriter | None = None
        self.latest_frame: TelemetryFrame | None = None
        self.last_serial_seen: datetime | None = None
        self.serial_connected = False
        self.cloud_offline_since: datetime | None = None
        self.sync_failure_alerted = False
        self.check_in_lock = asyncio.Lock()
        self.tasks: list[asyncio.Task[Any]] = []
        self.sync_worker = SyncWorker(config, self.database, self.mqtt)
        self.state_machine = WeighingStateMachine(
            config,
            self.database,
            self.mqtt,
            self.send_command,
            self.capture_snapshot,
            self.raise_alert,
        )
        self.mqtt.command_handler = self.handle_mqtt_command

    async def start(self) -> None:
        Path(self.config.storage.evidence_directory).mkdir(parents=True, exist_ok=True)
        self.mqtt.start()
        await self.bootstrap_chain_head()
        self.tasks = [
            asyncio.create_task(self.serial_supervisor(), name="serial-supervisor"),
            asyncio.create_task(self.sync_worker.run(), name="sync-worker"),
            asyncio.create_task(self.heartbeat_loop(), name="heartbeat"),
            asyncio.create_task(self.sync_failure_monitor(), name="sync-failure-monitor"),
            asyncio.create_task(self.backup_loop(), name="backup-loop"),
        ]
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
        if self.writer:
            self.writer.close()
            await self.writer.wait_closed()
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

    async def serial_supervisor(self) -> None:
        disconnected_since: datetime | None = None
        while True:
            try:
                if self.config.transport.mode.lower() == "tcp":
                    reader, writer = await asyncio.open_connection(self.config.transport.tcp_host, self.config.transport.tcp_port)
                elif self.config.transport.mode.lower() == "serial":
                    reader, writer = await serial_asyncio.open_serial_connection(
                        url=self.config.serial.port,
                        baudrate=self.config.serial.baud_rate,
                    )
                else:
                    raise ValueError(f"unsupported transport mode: {self.config.transport.mode}")
                self.writer = writer
                self.serial_connected = True
                disconnected_since = None
                LOGGER.info("Hardware transport connected")
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
                LOGGER.warning("Hardware transport unavailable: %s", error)
                if elapsed >= self.config.serial.manual_mode_after_seconds and self.state_machine.state != WeighingState.MANUAL_MODE:
                    await self.state_machine.enter_manual_mode("Serial port disconnected for more than 30 seconds")
                    await self.raise_alert(Alert(type="SENSOR_FAULT", severity="HIGH", title="Hardware connection lost", description=str(error)))
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
                }, qos=0)
                if frame.position_sensor_1 and not previous_p1 and self.state_machine.booking is None:
                    asyncio.create_task(self.automatic_check_in())
                previous_p1 = frame.position_sensor_1
                await self.state_machine.process(frame)

    async def send_command(self, command: bytes) -> None:
        if not self.writer:
            raise ConnectionError("hardware transport is disconnected")
        self.writer.write(command)
        await self.writer.drain()
        text = command.decode().strip()
        LOGGER.info("UART command: %s", text)
        if text.startswith("@CMD:GATE_OPEN") or text.startswith("@CMD:GATE_CLOSE"):
            target = "ENTRY" if "TGT:ENTRY" in text else "EXIT"
            position = "OPEN" if "GATE_OPEN" in text else "CLOSED"
            self.mqtt.publish("gate/status", {"target": target, "position": position, "source": "commanded"}, qos=1, retain=True)

    async def handle_mqtt_command(self, payload: dict[str, Any]) -> None:
        command = build_command(payload["action"], payload.get("target"), payload.get("value"))
        await self.send_command(command)

    async def automatic_check_in(self) -> dict[str, Any]:
        if self.check_in_lock.locked() or self.state_machine.booking is not None:
            return {"status": "already-processing"}
        async with self.check_in_lock:
            try:
                result = await asyncio.to_thread(self.anpr.recognise)
            except Exception as error:
                LOGGER.exception("ANPR pipeline failed")
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
            result = await asyncio.to_thread(self.anpr.recognise, request.image_path or self.config.anpr.camera_source)
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

    async def capture_snapshot(self) -> str | None:
        source = self.config.anpr.camera_source
        source_path = Path(str(source))
        destination = Path(self.config.storage.evidence_directory) / f"scale-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.jpg"
        try:
            if isinstance(source, str) and source_path.exists():
                shutil.copy2(source_path, destination)
                return str(destination)
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
            LOGGER.exception("Unable to save evidence snapshot")
            return None

    async def raise_alert(self, alert: Alert) -> None:
        payload = alert.model_dump(mode="json")
        payload["site_id"] = self.config.site.id
        await asyncio.to_thread(self.database.store_incident, payload)
        self.mqtt.publish("alerts", payload, qos=1)
        if alert.severity in {"HIGH", "CRITICAL"}:
            print("\a", end="", flush=True)
        LOGGER.warning("%s: %s", alert.title, alert.description)

    async def heartbeat_loop(self) -> None:
        while True:
            self.mqtt.publish("hardware/status", {
                "health": "ONLINE" if self.serial_connected else "OFFLINE",
                "serial_connected": self.serial_connected,
                "mqtt_connected": self.mqtt.connected,
                "cloud_connected": self.sync_worker.cloud_online,
                "last_seen": self.last_serial_seen.isoformat() if self.last_serial_seen else None,
                "state": self.state_machine.state,
                "corrupt_frames": self.parser.corrupt_frame_count,
            }, qos=0, retain=True)
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
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def get_runtime() -> Runtime:
    if runtime is None:
        raise HTTPException(status_code=503, detail="daemon is starting")
    return runtime


@app.get("/health")
async def health() -> dict[str, Any]:
    service = get_runtime()
    return {
        "status": "ok" if service.serial_connected else "degraded",
        "site_id": service.config.site.id,
        "state": service.state_machine.state,
        "serial_connected": service.serial_connected,
        "mqtt_connected": service.mqtt.connected,
        "cloud_connected": service.sync_worker.cloud_online,
        "pending_sync": await asyncio.to_thread(service.database.pending_count),
    }


@app.get("/edge/live")
async def live() -> dict[str, Any]:
    service = get_runtime()
    frame = service.latest_frame
    return {
        "state": service.state_machine.state,
        "manual_mode_reason": service.state_machine.manual_mode_reason,
        "telemetry": None if frame is None else {
            "weight_kg": frame.weight_kg,
            "position_sensor_1": frame.position_sensor_1,
            "position_sensor_2": frame.position_sensor_2,
            "rfid_tag": frame.rfid_tag,
            "scale_status": frame.scale_status,
            "received_at": frame.received_at,
        },
        "booking": service.state_machine.booking,
        "last_transaction": service.state_machine.last_transaction,
        "pending_sync": await asyncio.to_thread(service.database.pending_count),
        "pending_driver_decision": None if service.state_machine.state != WeighingState.AWAITING_DRIVER_DECISION else {
            "gross_weight_kg": service.state_machine.pending_gross_weight_kg,
            "net_weight_kg": (service.state_machine.pending_gross_weight_kg - service.state_machine.booking.tare_weight_kg) if service.state_machine.pending_gross_weight_kg is not None and service.state_machine.booking else None,
            "captured_at": service.state_machine.pending_captured_at,
        },
    }


@app.post("/edge/check-in")
async def check_in(request: CheckInRequest) -> dict[str, Any]:
    return await get_runtime().manual_check_in(request)


@app.post("/edge/command")
async def command(request: HardwareCommandRequest) -> dict[str, Any]:
    service = get_runtime()
    try:
        packet = build_command(request.action, request.target, request.value)
        await service.send_command(packet)
    except (ValueError, ConnectionError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"success": True, "command": packet.decode().strip()}


@app.post("/edge/driver-decision")
async def driver_decision(request: DriverDecisionRequest) -> dict[str, Any]:
    service = get_runtime()
    try:
        if request.decision == "ACCEPT":
            transaction = await service.state_machine.accept_load()
            return {"success": True, "transaction": transaction.model_dump(mode="json")}
        if request.decision == "RELOAD":
            await service.state_machine.request_reload()
            return {"success": True}
        raise HTTPException(status_code=422, detail="decision must be ACCEPT or RELOAD")
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/edge/manual-override")
async def manual_override(request: ManualOverrideRequest) -> dict[str, Any]:
    if len(request.reason.strip()) < 10:
        raise HTTPException(status_code=422, detail="override reason must contain at least 10 characters")
    service = get_runtime()
    packet = build_command(request.command.action, request.command.target, request.command.value)
    await service.send_command(packet)
    await service.raise_alert(Alert(
        type="MANUAL_OVERRIDE",
        severity="MEDIUM",
        title="Manual hardware override",
        description=request.reason,
        metadata={"operator_id": request.operator_id, "command": packet.decode().strip()},
    ))
    return {"success": True}


@app.get("/edge/transactions")
async def transactions(limit: int = 20) -> dict[str, Any]:
    rows = await asyncio.to_thread(get_runtime().database.recent_transactions, min(max(limit, 1), 100))
    return {"success": True, "data": rows}


if __name__ == "__main__":
    uvicorn.run("daemon:app", host="0.0.0.0", port=8000, reload=False)

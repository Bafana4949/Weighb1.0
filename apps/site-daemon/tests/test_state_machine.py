from datetime import datetime, timedelta, timezone

import pytest

from config import AppConfig
from database import EdgeDatabase
from models import ActiveBooking, Alert, AnprResult, TelemetryFrame, WeighingState
from state_machine import WeighingStateMachine


class FakeMqtt:
    def __init__(self) -> None:
        self.messages = []

    def publish(self, suffix, payload, qos=0, retain=False) -> None:
        self.messages.append((suffix, payload, qos, retain))


def make_config(tmp_path) -> AppConfig:
    return AppConfig.model_validate({
        "site": {"id": "ALPHA", "name": "Test", "timezone": "Africa/Johannesburg", "operating_hours": {"start": "05:00", "end": "22:00"}},
        "weighbridge": {"max_capacity_kg": 80000, "stability_threshold_kg": 20, "stability_duration_seconds": 0.3, "overload_tolerance_percent": 5, "positioning_hold_seconds": 0.2, "reading_interval_ms": 100, "unstable_timeout_seconds": 1, "empty_scale_threshold_kg": 500},
        "anpr": {"confidence_threshold": 0.75, "max_retries": 1, "retry_interval_ms": 1, "camera_source": "x", "rapid_capture_count": 1},
        "transport": {"mode": "tcp", "tcp_host": "localhost", "tcp_port": 7001},
        "serial": {"port": "COM1", "baud_rate": 115200, "timeout_seconds": 1, "reconnect_seconds": 5, "manual_mode_after_seconds": 30},
        "mqtt": {"broker": "localhost", "port": 1883, "keepalive": 60, "memory_buffer_limit": 1000},
        "cloud": {"api_url": "http://localhost", "site_api_key": "x", "sync_interval_seconds": 30, "max_offline_hours": 72, "request_timeout_seconds": 1},
        "storage": {"sqlite_path": str(tmp_path / "edge.db"), "backup_directory": str(tmp_path / "backups"), "backup_interval_seconds": 3600, "evidence_directory": str(tmp_path / "evidence")},
        "notifications": {"sms_enabled": False, "operator_user_ids": [], "admin_user_ids": []},
    })


def make_booking() -> ActiveBooking:
    now = datetime.now(timezone.utc)
    return ActiveBooking(
        id="b1", reference="BK-1", journey_token="JT-1", vehicle_id="v1", driver_id="d1",
        driver_rfid="DRV00421", site_id="ALPHA", plate="AB 123 CD GP", plate_normalized="AB123CDGP",
        tare_weight_kg=18000, legal_max_gvw_kg=60000, commodity="IRON_ORE", target_tonnage_kg=36000,
        window_start=now - timedelta(hours=1), window_end=now + timedelta(hours=2),
    )


def frame(at, weight=0, p1=False, p2=False, rfid="DRV00421", status="STABLE") -> TelemetryFrame:
    return TelemetryFrame(weight, p1, p2, rfid, status, at, "raw")


@pytest.mark.asyncio
async def test_happy_path_state_transitions(tmp_path) -> None:
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    mqtt = FakeMqtt()
    commands = []
    alerts: list[Alert] = []

    async def send(command: bytes) -> None:
        commands.append(command)

    async def snapshot() -> str:
        return "evidence.jpg"

    async def alert(item: Alert) -> None:
        alerts.append(item)

    machine = WeighingStateMachine(config, db, mqtt, send, snapshot, alert)  # type: ignore[arg-type]
    now = datetime.now(timezone.utc)
    await machine.authorise(make_booking(), AnprResult(plate_text="AB 123 CD GP", confidence=0.95, timestamp=now, image_path="entry.jpg", bbox_coordinates=None))
    await machine.process(frame(now, p1=True, rfid="DRV00421"))
    await machine.process(frame(now + timedelta(seconds=0.1), p1=True, p2=True))
    await machine.process(frame(now + timedelta(seconds=0.35), weight=52000, p1=True, p2=True))
    assert machine.state == WeighingState.STABILISING
    for index in range(5):
        await machine.process(frame(now + timedelta(seconds=0.4 + index * 0.1), weight=52000 + (index % 2) * 10, p1=True, p2=True))
    assert machine.state == WeighingState.COMPLETE
    assert machine.last_transaction is not None
    assert machine.last_transaction.net_weight_kg == 34000
    assert not alerts
    assert any(b"GATE_OPEN;TGT:EXIT" in command for command in commands)

@pytest.mark.asyncio
async def test_manual_mode_survives_disconnected_transport(tmp_path) -> None:
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    mqtt = FakeMqtt()

    async def disconnected(_: bytes) -> None:
        raise ConnectionError("serial down")

    async def snapshot() -> None:
        return None

    async def alert(_: Alert) -> None:
        return None

    machine = WeighingStateMachine(config, db, mqtt, disconnected, snapshot, alert)  # type: ignore[arg-type]
    await machine.enter_manual_mode("transport disconnected")
    assert machine.state == WeighingState.MANUAL_MODE
    assert db.incomplete_sessions()[0]["state"] == WeighingState.MANUAL_MODE


@pytest.mark.asyncio
async def test_reset_does_not_leave_false_incomplete_session(tmp_path) -> None:
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    mqtt = FakeMqtt()

    async def send(_: bytes) -> None:
        return None

    async def snapshot() -> None:
        return None

    async def alert(_: Alert) -> None:
        return None

    machine = WeighingStateMachine(config, db, mqtt, send, snapshot, alert)  # type: ignore[arg-type]
    await machine.transition(WeighingState.VEHICLE_APPROACHING, "test")
    assert db.incomplete_sessions()
    await machine.reset()
    assert machine.state == WeighingState.IDLE
    assert db.incomplete_sessions() == []

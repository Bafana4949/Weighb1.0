from datetime import datetime, timezone

import httpx
import pytest

from config import AppConfig
from database import EdgeDatabase
from models import ActiveBooking
from sync_worker import SyncWorker


class FakeMqtt:
    def __init__(self) -> None:
        self.messages: list[tuple[str, dict, int, bool]] = []

    def publish(self, suffix, payload, qos=0, retain=False) -> None:
        self.messages.append((suffix, payload, qos, retain))


def make_config(tmp_path) -> AppConfig:
    return AppConfig.model_validate({
        "site": {"id": "ALPHA", "name": "Test", "timezone": "Africa/Johannesburg", "operating_hours": {"start": "05:00", "end": "22:00"}},
        "weighbridge": {"max_capacity_kg": 80000, "stability_threshold_kg": 20, "stability_duration_seconds": 3, "overload_tolerance_percent": 5, "positioning_hold_seconds": 2, "reading_interval_ms": 100, "unstable_timeout_seconds": 60, "empty_scale_threshold_kg": 500},
        "anpr": {"confidence_threshold": 0.75, "max_retries": 1, "retry_interval_ms": 1, "camera_source": "x", "rapid_capture_count": 1},
        "transport": {"mode": "tcp", "tcp_host": "localhost", "tcp_port": 7001},
        "serial": {"port": "COM1", "baud_rate": 115200, "timeout_seconds": 1, "reconnect_seconds": 5, "manual_mode_after_seconds": 30},
        "mqtt": {"broker": "localhost", "port": 1883, "keepalive": 60, "memory_buffer_limit": 1000},
        "cloud": {"api_url": "http://cloud.invalid/api", "site_api_key": "x", "sync_interval_seconds": 30, "max_offline_hours": 72, "request_timeout_seconds": 1},
        "storage": {"sqlite_path": str(tmp_path / "edge.db"), "backup_directory": str(tmp_path / "backups"), "backup_interval_seconds": 3600, "evidence_directory": str(tmp_path / "evidence")},
        "notifications": {"sms_enabled": False, "operator_user_ids": [], "admin_user_ids": []},
    })


def make_booking() -> ActiveBooking:
    now = datetime.now(timezone.utc)
    return ActiveBooking(
        id="b1", reference="BK-1", journey_token="JT-1", vehicle_id="v1", driver_id="d1",
        driver_rfid="DRV00421", site_id="ALPHA", plate="AB 123 CD GP", plate_normalized="AB123CDGP",
        tare_weight_kg=18000, legal_max_gvw_kg=60000, commodity="IRON_ORE", target_tonnage_kg=36000,
        window_start=now, window_end=now,
    )


def queue_one_transaction(db: EdgeDatabase) -> str:
    transaction = db.create_transaction(
        site_code="ALPHA", booking=make_booking(), gross_weight_kg=52000,
        captured_at=datetime.now(timezone.utc), entry_at=None, exit_at=datetime.now(timezone.utc),
        overload=False, overload_variance_kg=0, anpr_confidence=0.9, entry_photo_url=None, scale_photo_url=None,
    )
    return transaction.edge_transaction_id


@pytest.mark.asyncio
async def test_genuine_duplicate_409_is_marked_synced(tmp_path) -> None:
    """A 409 that carries a real confirmation_hash means the cloud already has this record."""
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    edge_id = queue_one_transaction(db)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"success": False, "data": {"confirmation_hash": "cloud-already-has-this"}, "error": "Duplicate transaction"})

    worker = SyncWorker(config, db, FakeMqtt())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await worker.sync_once(client)

    assert db.pending_count() == 0
    rows = db.recent_transactions()
    assert rows[0]["edge_transaction_id"] == edge_id
    assert rows[0]["sync_status"] == "synced"
    assert rows[0]["cloud_confirmation_hash"] == "cloud-already-has-this"


@pytest.mark.asyncio
async def test_non_duplicate_409_is_not_silently_discarded(tmp_path) -> None:
    """Regression test: a 409 WITHOUT a confirmation_hash (e.g. HASH_CHAIN_MISMATCH) must stay
    queued for retry and raise an incident, never be fabricated into a fake "synced" result —
    otherwise a real transaction that the cloud rejected would be silently lost forever."""
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    edge_id = queue_one_transaction(db)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"success": False, "data": None, "error": "Transaction hash chain is out of sequence"})

    mqtt = FakeMqtt()
    worker = SyncWorker(config, db, mqtt)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await worker.sync_once(client)

    # Two pending items are expected: the original rejected transaction (kept for retry, not
    # discarded) plus the new CLOUD_SYNC_FAILURE incident this fix raises for operator review.
    assert db.pending_count() == 2, "the rejected transaction must remain queued, not be discarded"
    rows = db.recent_transactions()
    assert rows[0]["edge_transaction_id"] == edge_id
    assert rows[0]["sync_status"] == "pending"
    assert rows[0]["cloud_confirmation_hash"] is None
    alerts = [message for message in mqtt.messages if message[0] == "alerts"]
    assert alerts, "operators must be alerted when a sync item is rejected without confirmation"
    assert alerts[0][1]["severity"] == "CRITICAL"

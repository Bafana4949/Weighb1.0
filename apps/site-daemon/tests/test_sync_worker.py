import json
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


@pytest.mark.asyncio
async def test_duplicate_error_without_confirmation_hash_is_marked_synced(tmp_path) -> None:
    """The cloud's 409 "Duplicate transaction" means it already holds the record, even when
    its confirmation hash is null; keeping it queued would re-upload forever."""
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    queue_one_transaction(db)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"success": False, "data": {"id": "cloud-1", "confirmation_hash": None}, "error": "Duplicate transaction"})

    worker = SyncWorker(config, db, FakeMqtt())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await worker.sync_once(client)
    assert db.pending_count() == 0
    assert db.recent_transactions()[0]["sync_status"] == "synced"


@pytest.mark.asyncio
async def test_retry_after_reconnect_uses_same_idempotency_key_and_never_duplicates(tmp_path) -> None:
    """First attempt dies mid-flight (row left 'syncing', as after a crash). After restart the
    row is re-queued, re-sent with the same edge-transaction-id key, and the cloud's duplicate
    answer settles it: exactly one record ever exists upstream."""
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    edge_id = queue_one_transaction(db)
    item = db.list_due_sync_items()[0]
    db.mark_syncing(item["id"])
    assert db.list_due_sync_items() == [], "in-flight rows are not picked up twice"

    cloud: dict[str, dict] = {edge_id: {"confirmation_hash": "cloud-hash"}}  # the first upload did land
    seen_keys: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/transactions/reconcile"):
            seen_keys.append(request.headers["idempotency-key"])
            body = json.loads(request.content)
            if body["edge_transaction_id"] in cloud:
                return httpx.Response(409, json={"success": False, "data": cloud[body["edge_transaction_id"]], "error": "Duplicate transaction"})
            cloud[body["edge_transaction_id"]] = {"confirmation_hash": "new"}
            return httpx.Response(201, json={"success": True, "data": {"confirmation_hash": "new"}})
        return httpx.Response(404, json={})

    assert db.reset_inflight_sync() == 1
    worker = SyncWorker(config, db, FakeMqtt())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await worker.sync_once(client)
        await worker.sync_once(client)
    assert seen_keys == [edge_id]
    assert len(cloud) == 1
    assert db.pending_count() == 0
    assert db.recent_transactions()[0]["cloud_confirmation_hash"] == "cloud-hash"


@pytest.mark.asyncio
async def test_unreachable_cloud_stops_the_batch_and_backs_off(tmp_path) -> None:
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    queue_one_transaction(db)
    queue_one_transaction(db)
    posts: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            posts.append(request.url.path)
        raise httpx.ConnectError("connection refused", request=request)

    worker = SyncWorker(config, db, FakeMqtt())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await worker.sync_once(client)
    assert len(posts) == 1, "an unreachable cloud must not be hit once per queued item"
    assert worker.cloud_online is False
    assert db.pending_count() == 2
    # The failed item is scheduled for later, so an immediate second cycle doesn't resend it.
    assert len(db.list_due_sync_items()) == 1


def test_backoff_has_jitter_and_a_cap(tmp_path) -> None:
    config = make_config(tmp_path)
    db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    queue_one_transaction(db)
    item_id = db.list_due_sync_items()[0]["id"]
    delays = set()
    for _ in range(5):
        before = datetime.now(timezone.utc)
        db.mark_sync_failed(item_id, 30, "boom", base_seconds=5, max_seconds=300)
        with db._connect() as connection:
            next_retry = datetime.fromisoformat(connection.execute("SELECT next_retry_at FROM sync_queue WHERE id=?", (item_id,)).fetchone()[0])
        delay = (next_retry - before).total_seconds()
        assert 149 <= delay <= 301
        delays.add(round(delay, 3))
    assert len(delays) > 1, "retries must be jittered"
    first = datetime.now(timezone.utc)
    db.mark_sync_failed(item_id, 0, "boom", base_seconds=5, max_seconds=300)
    with db._connect() as connection:
        next_retry = datetime.fromisoformat(connection.execute("SELECT next_retry_at FROM sync_queue WHERE id=?", (item_id,)).fetchone()[0])
    assert 2.4 <= (next_retry - first).total_seconds() <= 5.1

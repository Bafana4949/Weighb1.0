from datetime import datetime, timedelta, timezone

from database import EdgeDatabase
from models import ActiveBooking


def booking() -> ActiveBooking:
    now = datetime.now(timezone.utc)
    return ActiveBooking(
        id="booking-1", reference="BK-1", journey_token="JT-1", vehicle_id="vehicle-1",
        driver_id="driver-1", driver_rfid="DRV00421", site_id="MINE-ALPHA-01",
        plate="AB 123 CD GP", plate_normalized="AB123CDGP", tare_weight_kg=18000,
        legal_max_gvw_kg=56000, commodity="IRON_ORE", target_tonnage_kg=36000,
        window_start=now - timedelta(hours=1), window_end=now + timedelta(hours=4),
    )


def test_cache_and_lookup(tmp_path) -> None:
    db = EdgeDatabase(str(tmp_path / "edge.db"), str(tmp_path / "backups"))
    item = booking()
    db.cache_booking(item)
    found = db.find_active_booking("AB123CDGP", "MINE-ALPHA-01")
    assert found is not None
    assert found.driver_rfid == "DRV00421"


def test_transaction_hash_chain_and_queue(tmp_path) -> None:
    db = EdgeDatabase(str(tmp_path / "edge.db"), str(tmp_path / "backups"))
    item = booking()
    first = db.create_transaction(
        site_code="ALPHA", booking=item, gross_weight_kg=52000,
        captured_at=datetime.now(timezone.utc), entry_at=None, exit_at=datetime.now(timezone.utc), overload=False,
        overload_variance_kg=0, anpr_confidence=0.94,
        entry_photo_url=None, scale_photo_url=None,
    )
    second = db.create_transaction(
        site_code="ALPHA", booking=item, gross_weight_kg=52100,
        captured_at=datetime.now(timezone.utc), entry_at=None, exit_at=datetime.now(timezone.utc), overload=False,
        overload_variance_kg=0, anpr_confidence=0.95,
        entry_photo_url=None, scale_photo_url=None,
    )
    assert first.integrity_hash != second.integrity_hash
    assert second.previous_hash == first.integrity_hash
    assert db.pending_count() == 2
    due = db.list_due_sync_items()
    assert due[0]["payload"]["edge_transaction_id"] == first.edge_transaction_id
    db.mark_synced(due[0]["id"], first.edge_transaction_id, "cloud-hash")
    assert db.pending_count() == 1


def test_chain_verification_detects_tampering_and_accepts_cloud_anchors(tmp_path) -> None:
    db = EdgeDatabase(str(tmp_path / "edge.db"), str(tmp_path / "backups"))
    item = booking()

    def record(gross: int):
        return db.create_transaction(
            site_code="ALPHA", booking=item, gross_weight_kg=gross,
            captured_at=datetime.now(timezone.utc), entry_at=None, exit_at=datetime.now(timezone.utc), overload=False,
            overload_variance_kg=0, anpr_confidence=0.94, entry_photo_url=None, scale_photo_url=None,
        )

    first = record(52000)
    db.mark_synced(db.list_due_sync_items()[0]["id"], first.edge_transaction_id, "c")
    # All synced: the ledger may adopt a newer cloud head (e.g. another lane's transaction).
    assert db.bootstrap_chain_head("a" * 64) is True
    second = record(52100)
    assert second.previous_hash == "a" * 64
    assert db.verify_chain() == []

    with db._connect() as connection:
        connection.execute("UPDATE transactions SET net_weight_kg = net_weight_kg + 1000 WHERE edge_transaction_id=?", (first.edge_transaction_id,))
    problems = db.verify_chain()
    assert len(problems) == 1 and first.edge_transaction_id in problems[0]

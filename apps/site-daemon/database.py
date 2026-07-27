from __future__ import annotations

import hashlib
import json
import logging
import shutil
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from models import ActiveBooking, EdgeTransaction

LOGGER = logging.getLogger(__name__)
GENESIS_HASH = "0" * 64

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_bookings (
    id TEXT PRIMARY KEY,
    plate_normalized TEXT NOT NULL,
    site_id TEXT NOT NULL,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    cached_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cached_bookings_lookup
    ON cached_bookings(plate_normalized, site_id, window_start, window_end);

CREATE TABLE IF NOT EXISTS transactions (
    edge_transaction_id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    trailer_id TEXT,
    driver_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    gross_weight_kg INTEGER NOT NULL CHECK(gross_weight_kg >= 0),
    tare_weight_kg INTEGER NOT NULL CHECK(tare_weight_kg >= 0),
    net_weight_kg INTEGER NOT NULL,
    commodity TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    entry_at TEXT,
    exit_at TEXT,
    turnaround_seconds INTEGER,
    waybill_number TEXT NOT NULL UNIQUE,
    previous_hash TEXT NOT NULL,
    integrity_hash TEXT NOT NULL UNIQUE,
    overload INTEGER NOT NULL DEFAULT 0,
    overload_variance_kg INTEGER NOT NULL DEFAULT 0,
    underweight_empty_flag INTEGER NOT NULL DEFAULT 0,
    overweight_loaded_flag INTEGER NOT NULL DEFAULT 0,
    anpr_confidence REAL,
    entry_photo_url TEXT,
    scale_photo_url TEXT,
    driver_decision TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    cloud_confirmation_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_sync ON transactions(sync_status, captured_at);
CREATE INDEX IF NOT EXISTS idx_transactions_vehicle ON transactions(vehicle_id, captured_at);

CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_due ON sync_queue(status, next_retry_at);

CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incomplete_sessions (
    session_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    booking_json TEXT,
    context_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


class EdgeDatabase:
    def __init__(self, path: str, backup_directory: str) -> None:
        self.path = Path(path).resolve()
        self.backup_directory = Path(backup_directory).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.backup_directory.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.RLock()
        self._initialise_with_recovery()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        return connection

    def _initialise_with_recovery(self) -> None:
        try:
            with self._connect() as connection:
                result = connection.execute("PRAGMA integrity_check").fetchone()
                if result and result[0] != "ok":
                    raise sqlite3.DatabaseError(f"integrity check failed: {result[0]}")
                connection.executescript(SCHEMA)
                self._apply_forward_migrations(connection)
                connection.execute(
                    "INSERT OR IGNORE INTO metadata(key, value, updated_at) VALUES('last_hash', ?, ?)",
                    (GENESIS_HASH, iso()),
                )
                connection.execute(
                    "INSERT OR IGNORE INTO metadata(key, value, updated_at) VALUES('waybill_sequence', '0', ?)",
                    (iso(),),
                )
        except sqlite3.DatabaseError as error:
            LOGGER.error("SQLite corruption detected: %s", error)
            corrupt = self.path.with_suffix(f".corrupt-{int(utc_now().timestamp())}.db")
            if self.path.exists():
                shutil.move(self.path, corrupt)
            backups = sorted(self.backup_directory.glob("edge-*.db"), reverse=True)
            if backups:
                shutil.copy2(backups[0], self.path)
                LOGGER.warning("Restored SQLite from %s", backups[0])
            with self._connect() as connection:
                connection.executescript(SCHEMA)
                self._apply_forward_migrations(connection)

    @staticmethod
    def _apply_forward_migrations(connection: sqlite3.Connection) -> None:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(transactions)").fetchall()}
        if "exit_at" not in columns:
            connection.execute("ALTER TABLE transactions ADD COLUMN exit_at TEXT")
        if "turnaround_seconds" not in columns:
            connection.execute("ALTER TABLE transactions ADD COLUMN turnaround_seconds INTEGER")
        if "underweight_empty_flag" not in columns:
            connection.execute("ALTER TABLE transactions ADD COLUMN underweight_empty_flag INTEGER NOT NULL DEFAULT 0")
        if "overweight_loaded_flag" not in columns:
            connection.execute("ALTER TABLE transactions ADD COLUMN overweight_loaded_flag INTEGER NOT NULL DEFAULT 0")
        if "driver_decision" not in columns:
            connection.execute("ALTER TABLE transactions ADD COLUMN driver_decision TEXT")

    def bootstrap_chain_head(self, chain_hash: str) -> bool:
        if len(chain_hash) != 64 or any(char not in "0123456789abcdef" for char in chain_hash.lower()):
            raise ValueError("chain head must be a 64-character SHA-256 hex value")
        with self._write_lock, self._connect() as connection:
            row = connection.execute("SELECT value FROM metadata WHERE key='last_hash'").fetchone()
            current = row[0] if row else GENESIS_HASH
            transaction_count = connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
            if current != GENESIS_HASH or transaction_count != 0:
                return False
            connection.execute("UPDATE metadata SET value=?, updated_at=? WHERE key='last_hash'", (chain_hash.lower(), iso()))
            return True

    def cache_booking(self, booking: ActiveBooking) -> None:
        payload = booking.model_dump(mode="json")
        with self._write_lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """INSERT INTO cached_bookings(id, plate_normalized, site_id, window_start, window_end, payload_json, cached_at)
                   VALUES(?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     plate_normalized=excluded.plate_normalized,
                     site_id=excluded.site_id,
                     window_start=excluded.window_start,
                     window_end=excluded.window_end,
                     payload_json=excluded.payload_json,
                     cached_at=excluded.cached_at""",
                (booking.id, booking.plate_normalized, booking.site_id, booking.window_start.isoformat(), booking.window_end.isoformat(), canonical_json(payload), iso()),
            )
            connection.commit()

    def find_active_booking(self, plate_normalized: str, site_id: str, grace_minutes: int = 120) -> ActiveBooking | None:
        now = utc_now()
        lower = (now - timedelta(minutes=grace_minutes)).isoformat()
        upper = (now + timedelta(minutes=grace_minutes)).isoformat()
        with self._connect() as connection:
            row = connection.execute(
                """SELECT payload_json FROM cached_bookings
                   WHERE plate_normalized=? AND site_id=?
                     AND window_start <= ? AND window_end >= ?
                   ORDER BY cached_at DESC LIMIT 1""",
                (plate_normalized, site_id, upper, lower),
            ).fetchone()
        return ActiveBooking.model_validate_json(row[0]) if row else None

    def _next_waybill_number(self, connection: sqlite3.Connection, site_code: str) -> str:
        row = connection.execute("SELECT value FROM metadata WHERE key='waybill_sequence'").fetchone()
        sequence = int(row[0]) + 1
        connection.execute("UPDATE metadata SET value=?, updated_at=? WHERE key='waybill_sequence'", (str(sequence), iso()))
        date = utc_now().strftime("%Y%m%d")
        return f"WB-{site_code}-{date}-{sequence:06d}"

    def create_transaction(
        self,
        *,
        site_code: str,
        booking: ActiveBooking,
        gross_weight_kg: int,
        captured_at: datetime,
        entry_at: datetime | None,
        exit_at: datetime | None,
        overload: bool,
        overload_variance_kg: int,
        anpr_confidence: float | None,
        entry_photo_url: str | None,
        scale_photo_url: str | None,
        underweight_empty: bool = False,
        overweight_loaded: bool = False,
        driver_decision: str | None = None,
    ) -> EdgeTransaction:
        with self._write_lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            previous_hash_row = connection.execute("SELECT value FROM metadata WHERE key='last_hash'").fetchone()
            previous_hash = previous_hash_row[0] if previous_hash_row else GENESIS_HASH
            edge_id = str(uuid4())
            waybill_number = self._next_waybill_number(connection, site_code)
            net_weight = gross_weight_kg - booking.tare_weight_kg
            captured_at_canonical = captured_at.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            exit_at_canonical = exit_at.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z") if exit_at else None
            turnaround_seconds = max(0, int((exit_at - entry_at).total_seconds())) if exit_at and entry_at else None
            hash_payload = {
                "edge_transaction_id": edge_id,
                "booking_id": booking.id,
                "vehicle_id": booking.vehicle_id,
                "driver_id": booking.driver_id,
                "site_id": booking.site_id,
                "gross_weight_kg": gross_weight_kg,
                "tare_weight_kg": booking.tare_weight_kg,
                "net_weight_kg": net_weight,
                "commodity": booking.commodity,
                "captured_at": captured_at_canonical,
                "exit_at": exit_at_canonical,
                "turnaround_seconds": turnaround_seconds,
                "waybill_number": waybill_number,
                "previous_hash": previous_hash,
                "overload": overload,
                "overload_variance_kg": overload_variance_kg,
                "underweight_empty": underweight_empty,
                "overweight_loaded": overweight_loaded,
            }
            integrity_hash = hashlib.sha256(canonical_json(hash_payload).encode()).hexdigest()
            transaction = EdgeTransaction(
                **hash_payload,
                trailer_id=booking.trailer_id,
                entry_at=entry_at,
                integrity_hash=integrity_hash,
                anpr_confidence=anpr_confidence,
                entry_photo_url=entry_photo_url,
                scale_photo_url=scale_photo_url,
                driver_decision=driver_decision,
            )
            payload_json = canonical_json(transaction.model_dump(mode="json"))
            now = iso()
            connection.execute(
                """INSERT INTO transactions(
                    edge_transaction_id, booking_id, vehicle_id, trailer_id, driver_id, site_id,
                    gross_weight_kg, tare_weight_kg, net_weight_kg, commodity, captured_at, entry_at,
                    exit_at, turnaround_seconds, waybill_number, previous_hash, integrity_hash, overload, overload_variance_kg,
                    underweight_empty_flag, overweight_loaded_flag,
                    anpr_confidence, entry_photo_url, scale_photo_url, driver_decision, sync_status, created_at, updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    transaction.edge_transaction_id, transaction.booking_id, transaction.vehicle_id,
                    transaction.trailer_id, transaction.driver_id, transaction.site_id,
                    transaction.gross_weight_kg, transaction.tare_weight_kg, transaction.net_weight_kg,
                    transaction.commodity, transaction.captured_at.isoformat(),
                    transaction.entry_at.isoformat() if transaction.entry_at else None,
                    transaction.exit_at.isoformat() if transaction.exit_at else None, transaction.turnaround_seconds,
                    transaction.waybill_number, transaction.previous_hash, transaction.integrity_hash,
                    int(transaction.overload), transaction.overload_variance_kg,
                    int(transaction.underweight_empty), int(transaction.overweight_loaded),
                    transaction.anpr_confidence, transaction.entry_photo_url, transaction.scale_photo_url,
                    transaction.driver_decision, "pending", now, now,
                ),
            )
            connection.execute(
                """INSERT INTO sync_queue(operation, aggregate_id, idempotency_key, payload_json, status,
                   retry_count, next_retry_at, created_at, updated_at)
                   VALUES('transaction_reconcile', ?, ?, ?, 'pending', 0, ?, ?, ?)""",
                (edge_id, integrity_hash, payload_json, now, now, now),
            )
            connection.execute("UPDATE metadata SET value=?, updated_at=? WHERE key='last_hash'", (integrity_hash, now))
            connection.commit()
            return transaction

    def list_due_sync_items(self, limit: int = 25) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT * FROM sync_queue
                   WHERE status IN ('pending','failed') AND next_retry_at <= ?
                   ORDER BY id ASC LIMIT ?""",
                (iso(), limit),
            ).fetchall()
        return [dict(row) | {"payload": json.loads(row["payload_json"])} for row in rows]

    def mark_syncing(self, item_id: int) -> None:
        with self._write_lock, self._connect() as connection:
            connection.execute("UPDATE sync_queue SET status='syncing', updated_at=? WHERE id=?", (iso(), item_id))

    def mark_synced(self, item_id: int, aggregate_id: str, confirmation_hash: str | None) -> None:
        now = iso()
        with self._write_lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("UPDATE sync_queue SET status='synced', updated_at=?, last_error=NULL WHERE id=?", (now, item_id))
            connection.execute(
                "UPDATE transactions SET sync_status='synced', cloud_confirmation_hash=?, updated_at=? WHERE edge_transaction_id=?",
                (confirmation_hash, now, aggregate_id),
            )
            connection.commit()

    def mark_sync_failed(self, item_id: int, retry_count: int, error: str) -> None:
        delay = min(60, 5 * (2 ** max(0, retry_count)))
        next_retry = utc_now() + timedelta(seconds=delay)
        with self._write_lock, self._connect() as connection:
            connection.execute(
                "UPDATE sync_queue SET status='failed', retry_count=?, next_retry_at=?, last_error=?, updated_at=? WHERE id=?",
                (retry_count + 1, next_retry.isoformat(), error[:1000], iso(), item_id),
            )

    def pending_count(self) -> int:
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) FROM sync_queue WHERE status != 'synced'").fetchone()
            return int(row[0])

    def recent_transactions(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM transactions ORDER BY captured_at DESC LIMIT ?", (limit,)).fetchall()
        return [dict(row) for row in rows]

    def store_incident(self, payload: dict[str, Any]) -> str:
        incident_id = str(uuid4())
        now = iso()
        with self._write_lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT INTO incidents(id,type,severity,title,description,payload_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (incident_id, payload["type"], payload["severity"], payload["title"], payload["description"], canonical_json(payload), now),
            )
            connection.execute(
                """INSERT OR IGNORE INTO sync_queue(operation,aggregate_id,idempotency_key,payload_json,status,retry_count,next_retry_at,created_at,updated_at)
                   VALUES('incident_upload',?,?,?,'pending',0,?,?,?)""",
                (incident_id, f"incident:{incident_id}", canonical_json(payload | {"edge_incident_id": incident_id}), now, now, now),
            )
            connection.commit()
        return incident_id

    def save_session(self, session_id: str, state: str, booking: ActiveBooking | None, context: dict[str, Any]) -> None:
        with self._write_lock, self._connect() as connection:
            connection.execute(
                """INSERT INTO incomplete_sessions(session_id,state,booking_json,context_json,updated_at)
                   VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET
                   state=excluded.state,booking_json=excluded.booking_json,context_json=excluded.context_json,updated_at=excluded.updated_at""",
                (session_id, state, booking.model_dump_json() if booking else None, canonical_json(context), iso()),
            )

    def clear_session(self, session_id: str) -> None:
        with self._write_lock, self._connect() as connection:
            connection.execute("DELETE FROM incomplete_sessions WHERE session_id=?", (session_id,))

    def incomplete_sessions(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM incomplete_sessions ORDER BY updated_at").fetchall()
        return [dict(row) for row in rows]

    def backup(self) -> Path:
        destination = self.backup_directory / f"edge-{utc_now().strftime('%Y%m%d-%H%M%S')}.db"
        with self._write_lock, self._connect() as source, sqlite3.connect(destination) as target:
            source.backup(target)
        backups = sorted(self.backup_directory.glob("edge-*.db"), reverse=True)
        for old in backups[48:]:
            old.unlink(missing_ok=True)
        return destination

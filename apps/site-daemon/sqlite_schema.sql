-- SQLite edge mirror schema. The daemon applies this automatically at startup.
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
    anpr_confidence REAL,
    entry_photo_url TEXT,
    scale_photo_url TEXT,
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

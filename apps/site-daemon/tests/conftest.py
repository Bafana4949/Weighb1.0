from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from config import AppConfig
from models import ActiveBooking

SITE_KEY = "wbe_testsitekey0123456789"
ORG_ID = "6f1c2b9e-0000-4000-8000-000000000001"
SITE_UUID = "6f1c2b9e-0000-4000-8000-000000000002"


def config_dict(tmp_path, **overrides: Any) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "site": {"id": "ALPHA", "name": "Test", "organisation_id": ORG_ID, "cloud_id": SITE_UUID},
        "anpr": {"camera_source": "x", "max_retries": 1, "retry_interval_ms": 1, "rapid_capture_count": 1},
        "transport": {"mode": "tcp", "tcp_host": "127.0.0.1", "tcp_port": 7001},
        "mqtt": {"broker": "broker.test", "username": "edge", "password": "secret-pass"},
        "cloud": {"api_url": "http://cloud.test/api", "site_api_key": SITE_KEY, "request_timeout_seconds": 1},
        "storage": {"sqlite_path": str(tmp_path / "edge.db"), "backup_directory": str(tmp_path / "backups"), "evidence_directory": str(tmp_path / "evidence")},
        "runtime": {"environment": "production", "allow_simulation": False, "local_api_token": "local-token"},
    }
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(raw.get(key), dict):
            raw[key] = {**raw[key], **value}
        else:
            raw[key] = value
    return raw


@pytest.fixture
def make_app_config(tmp_path):
    def build(**overrides: Any) -> AppConfig:
        return AppConfig.model_validate(config_dict(tmp_path, **overrides))
    return build


def edge_config_body(*, site_code: str = "ALPHA", devices: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """A GET /edge/config response exactly as the cloud contract defines it."""
    return {
        "success": True,
        "data": {
            "site": {"id": SITE_UUID, "code": site_code, "name": "Test", "organisationId": ORG_ID, "timezone": "Africa/Johannesburg", "operatingTier": "SEMI_AUTOMATIC"},
            "lanes": [{"id": "lane-uuid-1", "laneNumber": 1, "name": "Main", "direction": "BIDIRECTIONAL"}],
            "devices": devices if devices is not None else [
                {"id": "d1", "deviceKey": "SCALE_PRIMARY", "type": "SCALE", "name": "Scale", "laneNumber": 1, "connectionType": "SERIAL", "configuration": None, "isActive": True, "isSimulated": False, "maintenanceMode": False},
                {"id": "d2", "deviceKey": "GATE_ENTRY", "type": "ENTRY_GATE", "name": "Entry", "laneNumber": 1, "connectionType": None, "configuration": {"autoCloseDelaySeconds": 12}, "isActive": True, "isSimulated": False, "maintenanceMode": False},
                {"id": "d3", "deviceKey": "GATE_EXIT", "type": "EXIT_GATE", "name": "Exit", "laneNumber": 1, "connectionType": None, "configuration": None, "isActive": True, "isSimulated": False, "maintenanceMode": False},
            ],
            "mqtt": {"topicPrefix": f"tenant/{ORG_ID}/site/{SITE_UUID}"},
        },
    }


def make_booking(site_id: str = "ALPHA") -> ActiveBooking:
    now = datetime.now(timezone.utc)
    return ActiveBooking(
        id="b1", reference="BK-1", journey_token="JT-1", vehicle_id="v1", driver_id="d1",
        driver_rfid="DRV00421", site_id=site_id, plate="AB 123 CD GP", plate_normalized="AB123CDGP",
        tare_weight_kg=18000, legal_max_gvw_kg=60000, commodity="IRON_ORE", target_tonnage_kg=36000,
        window_start=now - timedelta(hours=1), window_end=now + timedelta(hours=2),
    )

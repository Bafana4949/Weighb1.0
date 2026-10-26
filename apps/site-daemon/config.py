from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field


class SiteConfig(BaseModel):
    id: str
    name: str
    timezone: str = "Africa/Johannesburg"
    operating_hours: dict[str, str]
    # Mirrors the web app's Site.topology (BIDIRECTIONAL_SINGLE | DUAL_ENTRY_EXIT).
    # Not live-synced from the cloud — like the rest of this file, kept in step
    # with the web-side Site record by whoever edits the YAML. When this is
    # DUAL_ENTRY_EXIT, `lanes` below must list two LaneConfig entries; the
    # daemon then runs one independent WeighingStateMachine per lane, each
    # with its own hardware transport connection.
    topology: str = "BIDIRECTIONAL_SINGLE"


class LaneConfig(BaseModel):
    # Stable string used in HTTP query params / MQTT payloads to address this
    # lane (e.g. "north", "south"). Independent of the cloud database.
    id: str
    # Matches the web app's Lane.laneNumber for the same physical deck, so
    # cloud-side reconciliation can attribute a transaction to the right Lane
    # row. Not a foreign key here — the daemon never talks to Postgres directly.
    lane_number: int
    mode: str = "tcp"
    tcp_host: str = "127.0.0.1"
    tcp_port: int = 7001
    serial_port: str | None = None
    serial_baud_rate: int = 115200
    # Optional per-lane camera override; falls back to anpr.camera_source when unset.
    camera_source: str | int | None = None


class WeighbridgeConfig(BaseModel):
    max_capacity_kg: int = 80_000
    stability_threshold_kg: int = 20
    stability_duration_seconds: float = 3
    overload_tolerance_percent: float = 5
    positioning_hold_seconds: float = 2
    reading_interval_ms: int = 100
    unstable_timeout_seconds: float = 60
    empty_scale_threshold_kg: int = 500
    empty_vehicle_max_kg: int = 18_500
    loaded_vehicle_max_kg: int = 70_000


class AnprConfig(BaseModel):
    confidence_threshold: float = 0.75
    max_retries: int = 3
    retry_interval_ms: int = 500
    camera_source: str | int
    rapid_capture_count: int = 5


class TransportConfig(BaseModel):
    mode: str = "tcp"
    tcp_host: str = "127.0.0.1"
    tcp_port: int = 7001


class SerialConfig(BaseModel):
    port: str
    baud_rate: int = 115200
    timeout_seconds: float = 1
    reconnect_seconds: float = 5
    manual_mode_after_seconds: float = 30


class MqttConfig(BaseModel):
    broker: str = "localhost"
    port: int = 1883
    keepalive: int = 60
    username: str | None = None
    password: str | None = None
    memory_buffer_limit: int = 1000


class CloudConfig(BaseModel):
    api_url: str
    site_api_key: str
    sync_interval_seconds: int = 30
    max_offline_hours: int = 72
    request_timeout_seconds: float = 8


class StorageConfig(BaseModel):
    sqlite_path: str = "edge.db"
    backup_directory: str = "backups"
    backup_interval_seconds: int = 3600
    evidence_directory: str = "evidence"


class NotificationConfig(BaseModel):
    sms_enabled: bool = False
    operator_user_ids: list[str] = Field(default_factory=list)
    admin_user_ids: list[str] = Field(default_factory=list)


class AppConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    site: SiteConfig
    weighbridge: WeighbridgeConfig
    anpr: AnprConfig
    transport: TransportConfig
    serial: SerialConfig
    mqtt: MqttConfig
    cloud: CloudConfig
    storage: StorageConfig
    notifications: NotificationConfig
    # Only populated for topology: DUAL_ENTRY_EXIT. Empty (the default) means
    # the daemon runs a single lane built from `transport` above, exactly as
    # it always has for BIDIRECTIONAL_SINGLE sites.
    lanes: list[LaneConfig] = Field(default_factory=list)


def load_config(path: str | None = None) -> AppConfig:
    config_path = Path(path or os.getenv("WB_CONFIG_PATH", Path(__file__).with_name("config.yaml")))
    raw: dict[str, Any] = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    raw["cloud"]["site_api_key"] = os.getenv("SITE_DAEMON_API_KEY", raw["cloud"]["site_api_key"])
    raw["cloud"]["api_url"] = os.getenv("WB_CLOUD_API_URL", raw["cloud"]["api_url"])
    raw["storage"]["sqlite_path"] = os.getenv("WB_EDGE_DB_PATH", raw["storage"]["sqlite_path"])
    return AppConfig.model_validate(raw)

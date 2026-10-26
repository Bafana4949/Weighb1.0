from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal
from urllib.parse import urlsplit

import yaml
from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

if TYPE_CHECKING:
    from models import CloudEdgeConfig

EDGE_VERSION = "1.1.0"
# The pre-per-site-key shared default. Refused outright so an old compose file or
# config can't silently authenticate as "some site".
RETIRED_SHARED_KEYS = frozenset({"dev-site-key-change-me"})


class ConfigError(RuntimeError):
    """The daemon must refuse to start (missing secrets, unsafe simulation, bad wiring)."""


class SiteConfig(BaseModel):
    # Site code (the cloud's Site.code). Used for waybill numbers and the
    # chain-head / bookings lookups.
    id: str
    name: str
    # Cloud identifiers for the MQTT prefix tenant/{organisation_id}/site/{cloud_id}.
    # GET /edge/config supplies these when the cloud is reachable; the YAML
    # values are the offline fallback.
    cloud_id: str | None = None
    organisation_id: str | None = None
    timezone: str = "Africa/Johannesburg"
    operating_hours: dict[str, str] = Field(default_factory=lambda: {"start": "00:00", "end": "23:59"})
    # Mirrors the web app's Site.topology (BIDIRECTIONAL_SINGLE | DUAL_ENTRY_EXIT).
    # Not live-synced from the cloud — like the rest of this file, kept in step
    # with the web-side Site record by whoever edits the YAML. When this is
    # DUAL_ENTRY_EXIT, `lanes` below must list two LaneConfig entries; the
    # daemon then runs one independent WeighingStateMachine per lane, each
    # with its own hardware transport connection.
    topology: str = "BIDIRECTIONAL_SINGLE"


class LaneDeviceKeys(BaseModel):
    """Cloud HardwareDevice.deviceKey for each physical device on a lane. A key set to
    null is not reported in heartbeats. Dual-lane sites must give each lane its own keys."""

    model_config = ConfigDict(extra="forbid")
    controller: str | None = "IO_CONTROLLER_MAIN"
    scale: str | None = "SCALE_PRIMARY"
    entry_gate: str | None = "GATE_ENTRY"
    exit_gate: str | None = "GATE_EXIT"
    position_sensor: str | None = "POSITION_SENSOR_MAIN"
    traffic_light: str | None = "TRAFFIC_LIGHT_MAIN"
    anpr_camera: str | None = "ANPR_CAMERA_MAIN"
    rfid_reader: str | None = "RFID_READER_MAIN"
    printer: str | None = None

    def assigned(self) -> dict[str, str]:
        return {role: key for role, key in self.model_dump().items() if key}


class LaneConfig(BaseModel):
    # Stable string used in HTTP query params / MQTT payloads to address this
    # lane (e.g. "north", "south"). Independent of the cloud database.
    id: str
    # Matches the web app's Lane.laneNumber for the same physical deck, so
    # cloud-side reconciliation can attribute a transaction to the right Lane
    # row, and used in the lane MQTT topics.
    lane_number: int = Field(ge=1)
    mode: str = "tcp"
    tcp_host: str | None = None
    tcp_port: int = 7001
    serial_port: str | None = None
    serial_baud_rate: int = 115200
    # True when this lane's transport is the hardware-simulator, not a real PIC18.
    simulated: bool = False
    # Optional per-lane camera override; falls back to anpr.camera_source when unset.
    camera_source: str | int | None = None
    # host:port of a network ticket printer; only probed for heartbeat health.
    printer_address: str | None = None
    device_keys: LaneDeviceKeys = Field(default_factory=LaneDeviceKeys)


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
    enabled: bool = True
    confidence_threshold: float = 0.75
    max_retries: int = 3
    retry_interval_ms: int = 500
    camera_source: str | int | None = None
    rapid_capture_count: int = 5


class TransportConfig(BaseModel):
    mode: str = "tcp"
    tcp_host: str | None = None
    tcp_port: int = 7001
    simulated: bool = False


class SerialConfig(BaseModel):
    port: str | None = None
    baud_rate: int = 115200
    timeout_seconds: float = 1
    reconnect_seconds: float = 5
    manual_mode_after_seconds: float = 30


class MqttTlsConfig(BaseModel):
    enabled: bool = False
    ca_file: str | None = None
    cert_file: str | None = None
    key_file: str | None = None


class MqttConfig(BaseModel):
    # mqtt://host:1883 or mqtts://host:8883. Overrides broker/port when set.
    url: str | None = None
    broker: str | None = None
    port: int = 1883
    keepalive: int = 60
    username: str | None = None
    password: SecretStr | None = None
    # Development only; refused in production.
    allow_anonymous: bool = False
    client_id: str | None = None
    tls: MqttTlsConfig = Field(default_factory=MqttTlsConfig)
    memory_buffer_limit: int = 1000

    @model_validator(mode="after")
    def _apply_url(self) -> "MqttConfig":
        if not self.url:
            return self
        parts = urlsplit(self.url)
        if parts.scheme not in {"mqtt", "mqtts", "tcp", "ssl"} or not parts.hostname:
            raise ValueError(f"unsupported MQTT url {self.url!r}; expected mqtt://host:port or mqtts://host:port")
        secure = parts.scheme in {"mqtts", "ssl"}
        self.broker = parts.hostname
        self.port = parts.port or (8883 if secure else 1883)
        if secure:
            self.tls.enabled = True
        if parts.username and not self.username:
            self.username = parts.username
        if parts.password and not self.password:
            self.password = SecretStr(parts.password)
        return self


class CloudConfig(BaseModel):
    api_url: str | None = None
    site_api_key: SecretStr | None = None
    sync_interval_seconds: int = 30
    heartbeat_interval_seconds: int = 30
    config_refresh_seconds: int = 300
    max_offline_hours: int = 72
    request_timeout_seconds: float = 8
    retry_base_seconds: float = 5
    retry_max_seconds: float = 300


class GateConfig(BaseModel):
    # Overridden per gate by the cloud device's configuration.autoCloseDelaySeconds.
    auto_close_seconds: float = 8
    # Auto-close waits while a vehicle is on the beams; alert if that lasts this long.
    max_hold_open_seconds: float = 300
    # An open is refused when the newest telemetry frame is older than this.
    telemetry_max_age_seconds: float = 2
    # Inbound MQTT gate commands must carry a ts within this many seconds of now.
    command_max_age_seconds: float = 30


class EdgeConfig(BaseModel):
    # deviceKey the daemon reports its own health under.
    device_key: str = "EDGE_CONTROLLER"


class RuntimeSettings(BaseModel):
    """Process-level switches. Populated only from the environment (never from YAML) so a
    dev config file copied onto a production box can't relax the safety checks."""

    environment: Literal["development", "production"] = "production"
    allow_simulation: bool = False
    local_api_token: SecretStr | None = None

    @property
    def production(self) -> bool:
        return self.environment == "production"


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
    weighbridge: WeighbridgeConfig = Field(default_factory=WeighbridgeConfig)
    anpr: AnprConfig = Field(default_factory=AnprConfig)
    transport: TransportConfig = Field(default_factory=TransportConfig)
    serial: SerialConfig = Field(default_factory=SerialConfig)
    mqtt: MqttConfig = Field(default_factory=MqttConfig)
    cloud: CloudConfig = Field(default_factory=CloudConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)
    notifications: NotificationConfig = Field(default_factory=NotificationConfig)
    gates: GateConfig = Field(default_factory=GateConfig)
    edge: EdgeConfig = Field(default_factory=EdgeConfig)
    runtime: RuntimeSettings = Field(default_factory=RuntimeSettings)
    # Device keys for the implicit single lane (used when `lanes` is empty).
    device_keys: LaneDeviceKeys = Field(default_factory=LaneDeviceKeys)
    # Only populated for topology: DUAL_ENTRY_EXIT. Empty (the default) means
    # the daemon runs a single lane built from `transport` above, exactly as
    # it always has for BIDIRECTIONAL_SINGLE sites.
    lanes: list[LaneConfig] = Field(default_factory=list)


DEFAULT_LANE_ID = "default"


def lane_configs(config: AppConfig) -> list[LaneConfig]:
    if config.lanes:
        return list(config.lanes)
    return [LaneConfig(
        id=DEFAULT_LANE_ID, lane_number=1, mode=config.transport.mode,
        tcp_host=config.transport.tcp_host, tcp_port=config.transport.tcp_port,
        serial_port=config.serial.port, serial_baud_rate=config.serial.baud_rate,
        simulated=config.transport.simulated, camera_source=None,
        device_keys=config.device_keys,
    )]


def _env(name: str) -> str | None:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


def _env_flag(name: str) -> bool:
    return (_env(name) or "").lower() in {"1", "true", "yes", "on"}


def load_config(path: str | None = None) -> AppConfig:
    config_path = Path(path or _env("WB_CONFIG_PATH") or Path(__file__).with_name("config.yaml"))
    if not config_path.is_file():
        raise ConfigError(f"config file not found: {config_path}. Start from config.example.yaml and point WB_CONFIG_PATH at it.")
    raw: dict[str, Any] = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    if "runtime" in raw:
        raise ConfigError("`runtime` cannot be set in the config file; use WB_ENV, WB_ALLOW_SIMULATION and WB_LOCAL_API_TOKEN")

    def section(name: str) -> dict[str, Any]:
        value = raw.get(name)
        if value is None:
            value = raw[name] = {}
        return value

    overrides = {
        ("cloud", "site_api_key"): _env("WB_SITE_API_KEY"),
        ("cloud", "api_url"): _env("WB_CLOUD_API_URL"),
        ("mqtt", "url"): _env("WB_MQTT_URL"),
        ("mqtt", "username"): _env("WB_MQTT_USERNAME"),
        ("mqtt", "password"): _env("WB_MQTT_PASSWORD"),
        ("storage", "sqlite_path"): _env("WB_EDGE_DB_PATH"),
    }
    for (name, key), value in overrides.items():
        if value is not None:
            section(name)[key] = value

    tls_overrides = {"ca_file": _env("WB_MQTT_TLS_CA"), "cert_file": _env("WB_MQTT_TLS_CERT"), "key_file": _env("WB_MQTT_TLS_KEY")}
    if any(tls_overrides.values()):
        mqtt_section = section("mqtt")
        tls = mqtt_section.get("tls") or {}
        tls.update({key: value for key, value in tls_overrides.items() if value})
        tls["enabled"] = True
        mqtt_section["tls"] = tls

    environment = (_env("WB_ENV") or "production").lower()
    if environment not in {"development", "production"}:
        raise ConfigError(f"WB_ENV must be 'development' or 'production', got {environment!r}")
    raw["runtime"] = {
        "environment": environment,
        "allow_simulation": _env_flag("WB_ALLOW_SIMULATION"),
        "local_api_token": _env("WB_LOCAL_API_TOKEN"),
    }
    try:
        return AppConfig.model_validate(raw)
    except ValueError as error:
        raise ConfigError(f"invalid config {config_path}: {error}") from error


def simulation_sources(config: AppConfig, edge_config: "CloudEdgeConfig | None" = None) -> list[str]:
    sources = [f"lane {lane.id} transport is marked simulated" for lane in lane_configs(config) if lane.simulated]
    if edge_config is not None:
        sources.extend(
            f"cloud device {device.device_key} is simulated"
            for device in edge_config.devices
            if device.is_simulated and device.is_active
        )
    return sources


def startup_problems(config: AppConfig, edge_config: "CloudEdgeConfig | None" = None) -> list[str]:
    problems: list[str] = []
    runtime = config.runtime
    key = config.cloud.site_api_key.get_secret_value() if config.cloud.site_api_key else None
    mqtt = config.mqtt

    if key in RETIRED_SHARED_KEYS:
        problems.append("the shared default site key is retired; issue a per-site key (wbe_...) from the cloud UI and set WB_SITE_API_KEY")
    if runtime.production:
        if not key:
            problems.append("WB_SITE_API_KEY is required in production")
        if not config.cloud.api_url:
            problems.append("WB_CLOUD_API_URL (or cloud.api_url) is required in production")
        if not mqtt.broker:
            problems.append("WB_MQTT_URL (or mqtt.broker) is required in production")
        if not (mqtt.username and mqtt.password):
            problems.append("MQTT credentials (WB_MQTT_USERNAME / WB_MQTT_PASSWORD) are required in production")
        if mqtt.allow_anonymous:
            problems.append("mqtt.allow_anonymous is not permitted in production")
        if not runtime.local_api_token:
            problems.append("WB_LOCAL_API_TOKEN is required in production")
    elif mqtt.broker and not mqtt.username and not mqtt.allow_anonymous:
        problems.append("MQTT has no credentials; set WB_MQTT_USERNAME / WB_MQTT_PASSWORD or mqtt.allow_anonymous: true (development only)")

    sources = simulation_sources(config, edge_config)
    if sources and runtime.production and not runtime.allow_simulation:
        problems.append("refusing to drive simulated hardware in production (" + "; ".join(sources) + "); set WB_ALLOW_SIMULATION=true only if this is intentional")

    seen_keys: dict[str, str] = {config.edge.device_key: "edge controller"}
    for lane in lane_configs(config):
        mode = lane.mode.lower()
        if mode == "tcp" and not lane.tcp_host:
            problems.append(f"lane {lane.id}: tcp mode requires tcp_host (transport.tcp_host for a single-lane site)")
        elif mode == "serial" and not lane.serial_port:
            problems.append(f"lane {lane.id}: serial mode requires serial_port (serial.port for a single-lane site)")
        elif mode not in {"tcp", "serial"}:
            problems.append(f"lane {lane.id}: unsupported transport mode {lane.mode!r}")
        for role, device_key in lane.device_keys.assigned().items():
            owner = seen_keys.setdefault(device_key, f"lane {lane.id} {role}")
            if owner != f"lane {lane.id} {role}":
                problems.append(f"device key {device_key} is assigned to both {owner} and lane {lane.id} {role}")
    return problems


def enforce_startup_policy(config: AppConfig, edge_config: "CloudEdgeConfig | None" = None) -> None:
    problems = startup_problems(config, edge_config)
    if problems:
        raise ConfigError("refusing to start: " + " | ".join(problems))

import httpx
import pytest

from cloud_client import CloudClient
from config import AppConfig, ConfigError, load_config, startup_problems
from conftest import ORG_ID, SITE_KEY, SITE_UUID, edge_config_body
from models import CloudEdgeConfig

SIMULATED_DEVICE = {
    "id": "sim", "deviceKey": "SCALE_PRIMARY", "type": "SCALE", "name": "Sim scale", "laneNumber": 1,
    "connectionType": "TCP", "configuration": None, "isActive": True, "isSimulated": True, "maintenanceMode": False,
}


def edge_config(devices=None) -> CloudEdgeConfig:
    return CloudEdgeConfig.model_validate(edge_config_body(devices=devices)["data"])


def test_runtime_defaults_carry_no_site_identity_or_secrets() -> None:
    config = AppConfig.model_validate({"site": {"id": "X", "name": "X"}})
    assert config.cloud.site_api_key is None
    assert config.cloud.api_url is None
    assert config.mqtt.broker is None and config.mqtt.username is None
    assert config.transport.tcp_host is None and config.serial.port is None
    assert config.runtime.environment == "production"


def test_production_refuses_simulated_transport_unless_explicitly_allowed(make_app_config) -> None:
    problems = startup_problems(make_app_config(transport={"simulated": True}))
    assert any("simulated hardware in production" in problem for problem in problems)
    allowed = make_app_config(transport={"simulated": True}, runtime={"environment": "production", "allow_simulation": True, "local_api_token": "t"})
    assert startup_problems(allowed) == []
    development = make_app_config(transport={"simulated": True}, runtime={"environment": "development"})
    assert startup_problems(development) == []


def test_production_refuses_simulated_cloud_device(make_app_config) -> None:
    config = make_app_config()
    assert startup_problems(config, edge_config()) == []
    problems = startup_problems(config, edge_config([SIMULATED_DEVICE]))
    assert any("cloud device SCALE_PRIMARY is simulated" in problem for problem in problems)
    inactive = dict(SIMULATED_DEVICE, isActive=False)
    assert startup_problems(config, edge_config([inactive])) == []


def test_production_requires_site_key_and_mqtt_credentials(make_app_config) -> None:
    problems = " | ".join(startup_problems(make_app_config(
        cloud={"site_api_key": None}, mqtt={"broker": "b", "username": None, "password": None},
        runtime={"environment": "production", "local_api_token": None},
    )))
    assert "WB_SITE_API_KEY is required" in problems
    assert "MQTT credentials" in problems
    assert "WB_LOCAL_API_TOKEN is required" in problems
    assert "allow_anonymous is not permitted" in " ".join(startup_problems(make_app_config(mqtt={"allow_anonymous": True})))


def test_retired_shared_key_is_refused_everywhere(make_app_config) -> None:
    for environment in ("development", "production"):
        config = make_app_config(cloud={"site_api_key": "dev-site-key-change-me"}, runtime={"environment": environment, "local_api_token": "t"})
        assert any("retired" in problem for problem in startup_problems(config))


def test_anonymous_mqtt_only_when_explicitly_configured_for_dev(make_app_config) -> None:
    dev = {"environment": "development"}
    assert startup_problems(make_app_config(mqtt={"username": None, "password": None}, runtime=dev))
    assert startup_problems(make_app_config(mqtt={"username": None, "password": None, "allow_anonymous": True}, runtime=dev)) == []


def test_duplicate_device_keys_across_lanes_are_refused(make_app_config) -> None:
    lanes = [
        {"id": "north", "lane_number": 1, "tcp_host": "a"},
        {"id": "south", "lane_number": 2, "tcp_host": "b"},
    ]
    problems = startup_problems(make_app_config(lanes=lanes))
    assert any("SCALE_PRIMARY is assigned to both" in problem for problem in problems)


def test_env_overrides_and_secret_handling(tmp_path, monkeypatch) -> None:
    path = tmp_path / "edge.yaml"
    path.write_text("site: {id: ALPHA, name: Test}\ntransport: {tcp_host: 10.0.0.5}\n", encoding="utf-8")
    env = {
        "WB_CONFIG_PATH": str(path),
        "WB_ENV": "development",
        "WB_SITE_API_KEY": SITE_KEY,
        "WB_CLOUD_API_URL": "https://cloud.example/api",
        "WB_MQTT_URL": "mqtts://broker.example:8883",
        "WB_MQTT_USERNAME": "edge-alpha",
        "WB_MQTT_PASSWORD": "mqtt-secret",
        "WB_MQTT_TLS_CA": "/etc/ssl/ca.pem",
        "WB_EDGE_DB_PATH": str(tmp_path / "x.db"),
        "WB_LOCAL_API_TOKEN": "local-secret",
        "WB_ALLOW_SIMULATION": "true",
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    config = load_config()
    assert config.runtime.environment == "development" and config.runtime.allow_simulation is True
    assert config.cloud.site_api_key.get_secret_value() == SITE_KEY
    assert config.cloud.api_url == "https://cloud.example/api"
    assert (config.mqtt.broker, config.mqtt.port, config.mqtt.tls.enabled, config.mqtt.tls.ca_file) == ("broker.example", 8883, True, "/etc/ssl/ca.pem")
    assert config.mqtt.username == "edge-alpha" and config.mqtt.password.get_secret_value() == "mqtt-secret"
    assert config.storage.sqlite_path == str(tmp_path / "x.db")
    dumped = repr(config) + config.model_dump_json()
    for secret in (SITE_KEY, "mqtt-secret", "local-secret"):
        assert secret not in dumped


def test_runtime_switches_cannot_come_from_yaml(tmp_path, monkeypatch) -> None:
    path = tmp_path / "edge.yaml"
    path.write_text("site: {id: ALPHA, name: Test}\nruntime: {environment: development}\n", encoding="utf-8")
    monkeypatch.setenv("WB_CONFIG_PATH", str(path))
    with pytest.raises(ConfigError, match="runtime"):
        load_config()
    monkeypatch.setenv("WB_CONFIG_PATH", str(tmp_path / "missing.yaml"))
    with pytest.raises(ConfigError, match="not found"):
        load_config()


def cloud_returning(body, status=200) -> httpx.MockTransport:
    return httpx.MockTransport(lambda request: httpx.Response(status, json=body))


async def make_runtime(config, transport):
    from daemon import Runtime

    runtime = Runtime(config)
    runtime.cloud = CloudClient(config, httpx.AsyncClient(transport=transport))
    return runtime


async def test_startup_refuses_simulated_cloud_device_in_production(make_app_config) -> None:
    runtime = await make_runtime(make_app_config(), cloud_returning(edge_config_body(devices=[SIMULATED_DEVICE])))
    with pytest.raises(ConfigError, match="simulated"):
        await runtime.refresh_edge_config(startup=True)
    assert runtime.edge_config is None


async def test_allowed_simulation_is_stamped_everywhere(make_app_config) -> None:
    config = make_app_config(runtime={"environment": "production", "allow_simulation": True, "local_api_token": "t"})
    runtime = await make_runtime(config, cloud_returning(edge_config_body(devices=[SIMULATED_DEVICE])))
    await runtime.refresh_edge_config(startup=True)
    assert runtime.simulation_active and runtime.mqtt.simulated
    assert runtime.mqtt.stamp("state", {"state": "IDLE"}, 1)["simulated"] is True
    heartbeat = await runtime.build_heartbeat_payload()
    assert heartbeat["simulated"] is True


async def test_startup_applies_cloud_identity_and_gate_settings(make_app_config) -> None:
    runtime = await make_runtime(make_app_config(site={"organisation_id": None, "cloud_id": None}), cloud_returning(edge_config_body()))
    await runtime.refresh_edge_config(startup=True)
    assert runtime.mqtt.topics is not None and runtime.mqtt.topics.prefix == f"tenant/{ORG_ID}/site/{SITE_UUID}"
    lane = runtime.lane(None)
    assert lane.gate.auto_close_seconds == {"ENTRY": 12.0, "EXIT": 8.0}
    heartbeat = await runtime.build_heartbeat_payload()
    # Only devices the cloud registered (plus the edge itself) are reported.
    assert {device["deviceKey"] for device in heartbeat["devices"]} == {"EDGE_CONTROLLER", "SCALE_PRIMARY", "GATE_ENTRY", "GATE_EXIT"}
    assert "simulated" not in heartbeat


async def test_startup_refuses_a_key_issued_for_another_site(make_app_config) -> None:
    runtime = await make_runtime(make_app_config(), cloud_returning(edge_config_body(site_code="OTHER")))
    with pytest.raises(ConfigError, match="belongs to site OTHER"):
        await runtime.refresh_edge_config(startup=True)


async def test_offline_start_uses_cached_cloud_config_then_yaml(make_app_config) -> None:
    config = make_app_config(site={"organisation_id": None, "cloud_id": None})
    online = await make_runtime(config, cloud_returning(edge_config_body()))
    await online.refresh_edge_config(startup=True)

    offline = await make_runtime(config, cloud_returning({"success": False}, status=503))
    await offline.refresh_edge_config(startup=True)
    assert offline.edge_config is not None and offline.edge_config.site.code == "ALPHA"
    assert offline.mqtt.topics.prefix == f"tenant/{ORG_ID}/site/{SITE_UUID}"

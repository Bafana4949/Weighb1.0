import json
from datetime import datetime, timezone

import httpx

from cloud_client import CloudClient
from config import LaneDeviceKeys
from conftest import ORG_ID, SITE_KEY, SITE_UUID, edge_config_body, make_booking
from database import EdgeDatabase
from heartbeat import LaneHealthSnapshot, build_heartbeat, edge_controller_report, filter_registered, lane_device_reports
from models import CloudEdgeConfig
from sync_worker import SyncWorker


class FakeMqtt:
    def __init__(self) -> None:
        self.messages = []

    def publish(self, suffix, payload, qos=0, retain=False, lane_number=None) -> None:
        self.messages.append((suffix, payload))


def recording_transport(requests: list[httpx.Request]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if path.endswith("/edge/config"):
            return httpx.Response(200, json=edge_config_body())
        if path.endswith("/edge/heartbeat"):
            return httpx.Response(200, json={"success": True, "data": {"receivedAt": "2026-10-26T10:00:00.000Z"}})
        if path.endswith("/transactions/chain-head"):
            return httpx.Response(200, json={"success": True, "data": {"integrity_hash": None}})
        if path.endswith("/bookings/active"):
            return httpx.Response(200, json={"success": True, "data": make_booking().model_dump(mode="json")})
        if path.endswith("/transactions/reconcile"):
            return httpx.Response(201, json={"success": True, "data": {"confirmation_hash": "c" * 64}})
        if path.endswith("/incidents"):
            return httpx.Response(201, json={"success": True, "data": {"id": "i1"}})
        return httpx.Response(404, json={"success": False})
    return httpx.MockTransport(handler)


async def test_every_cloud_call_carries_the_per_site_key(make_app_config, tmp_path) -> None:
    config = make_app_config()
    requests: list[httpx.Request] = []
    async with httpx.AsyncClient(transport=recording_transport(requests)) as http:
        cloud = CloudClient(config, http)
        edge_config = await cloud.fetch_edge_config()
        await cloud.send_heartbeat({"edgeVersion": "x", "pendingSync": 0, "failedSync": 0, "mqttConnected": False, "uptimeSeconds": 1, "devices": []})
        await cloud.fetch_chain_head()
        booking = await cloud.fetch_active_booking("AB123CDGP")

        db = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
        transaction = db.create_transaction(
            site_code="ALPHA", booking=make_booking(), gross_weight_kg=52000,
            captured_at=datetime.now(timezone.utc), entry_at=None, exit_at=datetime.now(timezone.utc),
            overload=False, overload_variance_kg=0, anpr_confidence=0.9, entry_photo_url=None, scale_photo_url=None,
        )
        db.store_incident({"type": "TEST", "severity": "LOW", "title": "t", "description": "d"})
        await SyncWorker(config, db, FakeMqtt()).sync_once(http)

    assert edge_config.site.organisation_id == ORG_ID
    assert booking is not None and booking.plate_normalized == "AB123CDGP"
    paths = {request.url.path for request in requests}
    assert {"/api/edge/config", "/api/edge/heartbeat", "/api/transactions/chain-head", "/api/bookings/active", "/api/transactions/reconcile", "/api/incidents"} <= paths
    for request in requests:
        assert request.headers.get("x-site-api-key") == SITE_KEY, request.url
    reconcile = next(request for request in requests if request.url.path.endswith("/transactions/reconcile"))
    assert reconcile.headers["idempotency-key"] == transaction.edge_transaction_id
    lookup = next(request for request in requests if request.url.path.endswith("/bookings/active"))
    assert lookup.url.params["site"] == "ALPHA" and lookup.url.params["plate"] == "AB123CDGP"


def test_edge_config_contract_parses() -> None:
    parsed = CloudEdgeConfig.model_validate(edge_config_body()["data"])
    assert parsed.site.operating_tier == "SEMI_AUTOMATIC"
    assert parsed.mqtt.topic_prefix == f"tenant/{ORG_ID}/site/{SITE_UUID}"
    assert parsed.lanes[0].lane_number == 1
    gate = parsed.device("GATE_ENTRY")
    assert gate is not None and gate.configuration == {"autoCloseDelaySeconds": 12} and gate.is_simulated is False


def snapshot(**overrides) -> LaneHealthSnapshot:
    values = dict(
        lane_id="default", lane_number=1, device_keys=LaneDeviceKeys(), connected=True, telemetry_age_seconds=0.1,
        state="IDLE", scale_status="STABLE", weight_kg=0, position_sensor_1=False, position_sensor_2=False,
        rfid_tag=None, corrupt_frames=0, gates={"ENTRY": "CLOSED", "EXIT": "OPEN"}, lights={"ENTRY": "RED", "EXIT": "GREEN"},
        anpr_available=False, anpr_message="ANPR packages (opencv/numpy/easyocr) not installed",
    )
    values.update(overrides)
    return LaneHealthSnapshot(**values)


def by_key(devices):
    return {device["deviceKey"]: device for device in devices}


def test_heartbeat_payload_shape_and_device_mapping() -> None:
    lane = snapshot()
    devices = [edge_controller_report("EDGE_CONTROLLER", lanes=[lane], mqtt_connected=True, cloud_online=True, environment="production", simulated=False)]
    devices += lane_device_reports(lane)
    payload = build_heartbeat(edge_version="1.1.0", pending_sync=3, failed_sync=1, mqtt_connected=True, uptime_seconds=12.7, devices=devices, simulated=False)

    assert set(payload) == {"edgeVersion", "pendingSync", "failedSync", "mqttConnected", "uptimeSeconds", "devices"}
    assert payload["pendingSync"] == 3 and payload["failedSync"] == 1 and payload["uptimeSeconds"] == 12
    json.dumps(payload)  # must be serialisable as-is
    reports = by_key(payload["devices"])
    assert set(reports) == {
        "EDGE_CONTROLLER", "CTRL_MAIN", "SCALE_PRIMARY", "GATE_ENTRY", "GATE_EXIT",
        "BEAM_P1", "BEAM_P2", "LIGHT_DECK", "ANPR_ENTRY", "RFID_ENTRY",
    }
    for report in payload["devices"]:
        assert set(report) <= {"deviceKey", "health", "message", "readings"}
        assert report["health"] in {"ONLINE", "DEGRADED", "OFFLINE", "FAULT"}
    assert reports["EDGE_CONTROLLER"]["health"] == "ONLINE"
    assert reports["SCALE_PRIMARY"]["health"] == "ONLINE"
    assert reports["GATE_EXIT"]["readings"] == {"position": "OPEN"}
    assert reports["ANPR_ENTRY"]["health"] == "OFFLINE"
    assert "not installed" in reports["ANPR_ENTRY"]["message"]


def test_heartbeat_device_health_follows_controller_link_and_faults() -> None:
    down = by_key(lane_device_reports(snapshot(connected=False, telemetry_age_seconds=None)))
    assert {down[key]["health"] for key in ("CTRL_MAIN", "SCALE_PRIMARY", "GATE_ENTRY", "BEAM_P1")} == {"OFFLINE"}
    stale = by_key(lane_device_reports(snapshot(telemetry_age_seconds=9)))
    assert stale["CTRL_MAIN"]["health"] == "DEGRADED"
    fault = by_key(lane_device_reports(snapshot(scale_status="FAULT", state="FAULT")))
    assert fault["SCALE_PRIMARY"]["health"] == "FAULT"
    assert fault["GATE_ENTRY"]["health"] == "DEGRADED"
    edge = edge_controller_report("EDGE_CONTROLLER", lanes=[snapshot(connected=False)], mqtt_connected=False, cloud_online=True, environment="production", simulated=True)
    assert edge["health"] == "DEGRADED" and "MQTT disconnected" in edge["message"]
    assert edge["readings"]["simulated"] is True


def test_heartbeat_respects_custom_keys_and_null_devices() -> None:
    keys = LaneDeviceKeys(scale="SCALE_LANE_2", anpr_camera=None, rfid_reader=None, controller=None, printer="PRINTER_MAIN")
    reports = by_key(lane_device_reports(snapshot(lane_number=2, device_keys=keys, printer_reachable=False)))
    assert "SCALE_LANE_2" in reports and "SCALE_PRIMARY" not in reports
    assert "ANPR_ENTRY" not in reports and "CTRL_MAIN" not in reports
    assert reports["PRINTER_MAIN"]["health"] == "OFFLINE"


def test_simulated_heartbeat_is_stamped_and_unregistered_keys_filtered() -> None:
    devices = lane_device_reports(snapshot()) + [{"deviceKey": "EDGE_CONTROLLER", "health": "ONLINE"}]
    kept, dropped = filter_registered(devices, {"SCALE_PRIMARY", "GATE_ENTRY"}, always=["EDGE_CONTROLLER"])
    assert {device["deviceKey"] for device in kept} == {"SCALE_PRIMARY", "GATE_ENTRY", "EDGE_CONTROLLER"}
    assert "RFID_ENTRY" in dropped
    assert filter_registered(devices, None) == (devices, [])
    payload = build_heartbeat(edge_version="1", pending_sync=0, failed_sync=0, mqtt_connected=False, uptime_seconds=0, devices=kept, simulated=True)
    assert payload["simulated"] is True

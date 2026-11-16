"""Payload for POST /edge/heartbeat (also mirrored to {prefix}/edge/heartbeat).

Each device entry uses the cloud HardwareDevice.deviceKey from the lane's
`device_keys` mapping, so the cloud can update exactly that device's health."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

from config import LaneDeviceKeys
from models import WeighingState

HEALTH_VALUES = ("ONLINE", "DEGRADED", "OFFLINE", "FAULT")


@dataclass(slots=True)
class LaneHealthSnapshot:
    lane_id: str
    lane_number: int
    device_keys: LaneDeviceKeys
    connected: bool
    telemetry_age_seconds: float | None
    state: str
    scale_status: str | None = None
    weight_kg: int | None = None
    position_sensor_1: bool | None = None
    position_sensor_2: bool | None = None
    rfid_tag: str | None = None
    corrupt_frames: int = 0
    gates: dict[str, str] = field(default_factory=dict)
    lights: dict[str, str] = field(default_factory=dict)
    anpr_available: bool = False
    anpr_message: str | None = None
    anpr_last_error: str | None = None
    printer_reachable: bool | None = None


def device_report(device_key: str, health: str, message: str | None = None, readings: dict[str, Any] | None = None) -> dict[str, Any]:
    assert health in HEALTH_VALUES, health
    report: dict[str, Any] = {"deviceKey": device_key, "health": health}
    if message:
        report["message"] = message[:300]  # cloud schema limit
    if readings is not None:
        report["readings"] = readings
    return report


def lane_device_reports(lane: LaneHealthSnapshot, telemetry_stale_seconds: float = 2.0) -> list[dict[str, Any]]:
    keys = lane.device_keys
    fresh = lane.telemetry_age_seconds is not None and lane.telemetry_age_seconds <= telemetry_stale_seconds
    if not lane.connected:
        link_health, link_message = "OFFLINE", "I/O controller link is down"
    elif not fresh:
        link_health, link_message = "DEGRADED", "I/O controller connected but telemetry is stale"
    else:
        link_health, link_message = "ONLINE", None
    link_ok = link_health == "ONLINE"
    in_error = lane.state in {WeighingState.FAULT, WeighingState.MANUAL_MODE}
    reports: list[dict[str, Any]] = []

    if keys.controller:
        reports.append(device_report(keys.controller, link_health, link_message, {
            "lane": lane.lane_id,
            "laneNumber": lane.lane_number,
            "state": lane.state,
            "corruptFrames": lane.corrupt_frames,
            "telemetryAgeSeconds": None if lane.telemetry_age_seconds is None else round(lane.telemetry_age_seconds, 2),
        }))

    def behind_controller(device_key: str | None, ok_health: str = "ONLINE", message: str | None = None, readings: dict[str, Any] | None = None) -> None:
        if not device_key:
            return
        if link_ok:
            reports.append(device_report(device_key, ok_health, message, readings))
        else:
            reports.append(device_report(device_key, link_health, link_message))

    scale_fault = lane.scale_status == "FAULT" or lane.state == WeighingState.FAULT
    behind_controller(
        keys.scale,
        "FAULT" if scale_fault else "ONLINE",
        "scale fault reported" if scale_fault else None,
        {"weightKg": lane.weight_kg, "scaleStatus": lane.scale_status},
    )
    for role, target in (("entry_gate", "ENTRY"), ("exit_gate", "EXIT")):
        behind_controller(
            getattr(keys, role),
            "DEGRADED" if in_error else "ONLINE",
            f"lane in {lane.state}; gate held closed" if in_error else None,
            {"position": lane.gates.get(target, "CLOSED")},
        )
    behind_controller(keys.position_sensor, readings={"p1": lane.position_sensor_1})
    behind_controller(keys.position_sensor_p2, readings={"p2": lane.position_sensor_2})
    behind_controller(keys.traffic_light, readings={"entry": lane.lights.get("ENTRY"), "exit": lane.lights.get("EXIT")})
    behind_controller(keys.rfid_reader, readings={"tagPresent": lane.rfid_tag is not None})

    if keys.anpr_camera:
        if not lane.anpr_available:
            reports.append(device_report(keys.anpr_camera, "OFFLINE", lane.anpr_message or "ANPR disabled"))
        elif lane.anpr_last_error:
            reports.append(device_report(keys.anpr_camera, "DEGRADED", lane.anpr_last_error[:200]))
        else:
            reports.append(device_report(keys.anpr_camera, "ONLINE"))

    if keys.printer and lane.printer_reachable is not None:
        reports.append(device_report(keys.printer, "ONLINE" if lane.printer_reachable else "OFFLINE",
                                     None if lane.printer_reachable else "printer not reachable"))
    return reports


def edge_controller_report(
    device_key: str,
    *,
    lanes: Iterable[LaneHealthSnapshot],
    mqtt_connected: bool,
    cloud_online: bool,
    environment: str,
    simulated: bool,
) -> dict[str, Any]:
    lanes = list(lanes)
    problems = [f"lane {lane.lane_id} controller link down" for lane in lanes if not lane.connected]
    if not mqtt_connected:
        problems.append("MQTT disconnected")
    if not cloud_online:
        problems.append("cloud sync offline")
    return device_report(
        device_key,
        "DEGRADED" if problems else "ONLINE",
        "; ".join(problems) or None,
        {
            "environment": environment,
            "simulated": simulated,
            "mqttConnected": mqtt_connected,
            "cloudOnline": cloud_online,
            "lanes": [{"lane": lane.lane_id, "laneNumber": lane.lane_number, "state": lane.state, "connected": lane.connected} for lane in lanes],
        },
    )


def filter_registered(devices: list[dict[str, Any]], registered_keys: set[str] | None, always: Iterable[str] = ()) -> tuple[list[dict[str, Any]], list[str]]:
    """Drop devices the cloud doesn't know (when the cloud's device list is known)."""
    if registered_keys is None:
        return devices, []
    allowed = registered_keys | set(always)
    kept = [device for device in devices if device["deviceKey"] in allowed]
    dropped = [device["deviceKey"] for device in devices if device["deviceKey"] not in allowed]
    return kept, dropped


def build_heartbeat(
    *,
    edge_version: str,
    pending_sync: int,
    failed_sync: int,
    mqtt_connected: bool,
    uptime_seconds: float,
    devices: list[dict[str, Any]],
    simulated: bool,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "edgeVersion": edge_version,
        "pendingSync": int(pending_sync),
        "failedSync": int(failed_sync),
        "mqttConnected": bool(mqtt_connected),
        "uptimeSeconds": int(uptime_seconds),
        "devices": devices,
    }
    if simulated:
        payload["simulated"] = True
    return payload

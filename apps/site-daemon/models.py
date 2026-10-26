from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WeighingState(StrEnum):
    IDLE = "IDLE"
    VEHICLE_APPROACHING = "VEHICLE_APPROACHING"
    POSITIONING = "POSITIONING"
    STABILISING = "STABILISING"
    CAPTURED = "CAPTURED"
    PROCESSING = "PROCESSING"
    AWAITING_DRIVER_DECISION = "AWAITING_DRIVER_DECISION"
    COMPLETE = "COMPLETE"
    FAULT = "FAULT"
    MANUAL_MODE = "MANUAL_MODE"


@dataclass(slots=True, frozen=True)
class TelemetryFrame:
    weight_kg: int
    position_sensor_1: bool
    position_sensor_2: bool
    rfid_tag: str | None
    scale_status: str
    received_at: datetime
    raw: str


class ActiveBooking(BaseModel):
    id: str
    reference: str
    journey_token: str
    vehicle_id: str
    trailer_id: str | None = None
    driver_id: str
    driver_rfid: str
    site_id: str
    plate: str
    plate_normalized: str
    tare_weight_kg: int
    legal_max_gvw_kg: int
    commodity: str
    target_tonnage_kg: int
    window_start: datetime
    window_end: datetime


class AnprResult(BaseModel):
    plate_text: str | None
    confidence: float
    timestamp: datetime
    image_path: str | None
    bbox_coordinates: tuple[int, int, int, int] | None
    attempts: int = 1
    candidates: list[str] = Field(default_factory=list)


class EdgeTransaction(BaseModel):
    edge_transaction_id: str
    booking_id: str
    vehicle_id: str
    trailer_id: str | None = None
    driver_id: str
    site_id: str
    gross_weight_kg: int
    tare_weight_kg: int
    net_weight_kg: int
    commodity: str
    captured_at: datetime
    entry_at: datetime | None = None
    exit_at: datetime | None = None
    turnaround_seconds: int | None = None
    waybill_number: str
    previous_hash: str
    integrity_hash: str
    overload: bool
    overload_variance_kg: int
    underweight_empty: bool = False
    overweight_loaded: bool = False
    anpr_confidence: float | None = None
    entry_photo_url: str | None = None
    scale_photo_url: str | None = None
    driver_decision: str | None = None
    sync_status: str = "pending"
    lane_number: int | None = None


class Alert(BaseModel):
    type: str
    severity: str
    title: str
    description: str
    booking_id: str | None = None
    vehicle_id: str | None = None
    driver_id: str | None = None
    evidence_urls: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp_utc: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    lane_number: int | None = None


class _CloudModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class CloudSite(_CloudModel):
    id: str
    code: str
    name: str
    organisation_id: str = Field(alias="organisationId")
    timezone: str | None = None
    # MANUAL | SEMI_AUTOMATIC | FULLY_AUTOMATIC; kept as str so a new tier doesn't
    # make the whole config unreadable.
    operating_tier: str = Field(alias="operatingTier")


class CloudLane(_CloudModel):
    id: str
    lane_number: int = Field(alias="laneNumber")
    name: str | None = None
    direction: str | None = None


class CloudDevice(_CloudModel):
    id: str
    device_key: str = Field(alias="deviceKey")
    type: str
    name: str | None = None
    lane_number: int | None = Field(default=None, alias="laneNumber")
    connection_type: str | None = Field(default=None, alias="connectionType")
    configuration: dict[str, Any] | None = None
    is_active: bool = Field(default=True, alias="isActive")
    is_simulated: bool = Field(default=False, alias="isSimulated")
    maintenance_mode: bool = Field(default=False, alias="maintenanceMode")


class CloudMqtt(_CloudModel):
    topic_prefix: str = Field(alias="topicPrefix")


class CloudEdgeConfig(_CloudModel):
    """`data` of GET /edge/config."""

    site: CloudSite
    lanes: list[CloudLane] = Field(default_factory=list)
    devices: list[CloudDevice] = Field(default_factory=list)
    mqtt: CloudMqtt

    def device(self, device_key: str | None) -> CloudDevice | None:
        if not device_key:
            return None
        return next((device for device in self.devices if device.device_key == device_key), None)

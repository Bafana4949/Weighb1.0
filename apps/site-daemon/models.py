from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


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

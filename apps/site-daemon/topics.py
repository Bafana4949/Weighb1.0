"""MQTT topic hierarchy shared with the cloud:

    tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/{scale/weight|gate/status|gate/command|...}
    tenant/{organisationId}/site/{siteId}/{edge/heartbeat|hardware/status|sync/status|alerts}
"""
from __future__ import annotations

import re
import threading
import time
from typing import Callable

LANE_SUFFIXES = frozenset({
    "scale/weight",
    "gate/status",
    "gate/command",
    "rfid/event",
    "sensors/state",
    "state",
    "alerts",
    "transaction",
})
SITE_SUFFIXES = frozenset({"edge/heartbeat", "hardware/status", "sync/status", "alerts"})

# Cloud ids are UUIDs; anything with a separator or MQTT wildcard would corrupt the hierarchy.
_SEGMENT = re.compile(r"^[A-Za-z0-9_.:-]+$")
_PREFIX = re.compile(r"^tenant/(?P<org>[^/+#]+)/site/(?P<site>[^/+#]+)$")


def build_prefix(organisation_id: str | None, site_id: str | None) -> str:
    for label, value in (("organisation id", organisation_id), ("site id", site_id)):
        if not value or not _SEGMENT.fullmatch(value):
            raise ValueError(f"invalid {label} for MQTT topic prefix: {value!r}")
    return f"tenant/{organisation_id}/site/{site_id}"


def validate_prefix(prefix: str) -> str:
    match = _PREFIX.fullmatch(prefix or "")
    if not match or not _SEGMENT.fullmatch(match["org"]) or not _SEGMENT.fullmatch(match["site"]):
        raise ValueError(f"invalid MQTT topic prefix {prefix!r}; expected tenant/{{organisationId}}/site/{{siteId}}")
    return prefix


class TopicBuilder:
    def __init__(self, prefix: str) -> None:
        self.prefix = validate_prefix(prefix)

    def lane(self, lane_number: int, suffix: str) -> str:
        if suffix not in LANE_SUFFIXES:
            raise ValueError(f"unknown lane topic {suffix!r}")
        if isinstance(lane_number, bool) or not isinstance(lane_number, int) or lane_number < 1:
            raise ValueError(f"invalid lane number {lane_number!r}")
        return f"{self.prefix}/lane/{lane_number}/{suffix}"

    def site(self, suffix: str) -> str:
        if suffix not in SITE_SUFFIXES:
            raise ValueError(f"unknown site topic {suffix!r}")
        return f"{self.prefix}/{suffix}"

    def topic(self, suffix: str, lane_number: int | None = None) -> str:
        return self.site(suffix) if lane_number is None else self.lane(lane_number, suffix)

    def gate_command_filter(self) -> str:
        return f"{self.prefix}/lane/+/gate/command"

    def parse_gate_command_lane(self, topic: str) -> int | None:
        head, tail = f"{self.prefix}/lane/", "/gate/command"
        if not (topic.startswith(head) and topic.endswith(tail)):
            return None
        middle = topic[len(head):-len(tail)]
        return int(middle) if middle.isdigit() else None


class SequenceCounter:
    """Monotonically increasing `seq` per topic.

    Each value is at least the current wall-clock time in milliseconds, so the
    sequence keeps increasing across daemon restarts and consumers can simply drop
    anything with seq <= the last one they accepted for that topic."""

    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._last: dict[str, int] = {}
        self._lock = threading.Lock()

    def next(self, key: str) -> int:
        with self._lock:
            value = max(self._last.get(key, 0) + 1, int(self._clock() * 1000))
            self._last[key] = value
            return value

import asyncio
import json

import pytest

from conftest import ORG_ID, SITE_UUID
from mqtt_client import MqttService
from topics import SequenceCounter, TopicBuilder, build_prefix

PREFIX = f"tenant/{ORG_ID}/site/{SITE_UUID}"


def test_prefix_and_lane_and_site_topics() -> None:
    assert build_prefix(ORG_ID, SITE_UUID) == PREFIX
    topics = TopicBuilder(PREFIX)
    assert topics.lane(1, "scale/weight") == f"{PREFIX}/lane/1/scale/weight"
    assert topics.lane(2, "gate/status") == f"{PREFIX}/lane/2/gate/status"
    assert topics.lane(1, "gate/command") == f"{PREFIX}/lane/1/gate/command"
    assert topics.lane(1, "rfid/event") == f"{PREFIX}/lane/1/rfid/event"
    assert topics.lane(1, "sensors/state") == f"{PREFIX}/lane/1/sensors/state"
    assert topics.lane(1, "state") == f"{PREFIX}/lane/1/state"
    assert topics.lane(1, "alerts") == f"{PREFIX}/lane/1/alerts"
    assert topics.site("edge/heartbeat") == f"{PREFIX}/edge/heartbeat"
    assert topics.site("hardware/status") == f"{PREFIX}/hardware/status"
    assert topics.site("sync/status") == f"{PREFIX}/sync/status"
    assert topics.gate_command_filter() == f"{PREFIX}/lane/+/gate/command"


@pytest.mark.parametrize("org, site", [("", SITE_UUID), (ORG_ID, None), ("a/b", SITE_UUID), (ORG_ID, "+"), (ORG_ID, "#")])
def test_prefix_rejects_unsafe_ids(org, site) -> None:
    with pytest.raises(ValueError):
        build_prefix(org, site)


def test_builder_rejects_unknown_topics_and_bad_lanes() -> None:
    topics = TopicBuilder(PREFIX)
    with pytest.raises(ValueError):
        topics.lane(1, "telemetry")
    with pytest.raises(ValueError):
        topics.lane(0, "state")
    with pytest.raises(ValueError):
        topics.site("scale/weight")
    with pytest.raises(ValueError):
        TopicBuilder("weighbridge/ALPHA")


def test_gate_command_topic_parsing() -> None:
    topics = TopicBuilder(PREFIX)
    assert topics.parse_gate_command_lane(f"{PREFIX}/lane/2/gate/command") == 2
    assert topics.parse_gate_command_lane(f"{PREFIX}/lane/x/gate/command") is None
    assert topics.parse_gate_command_lane(f"tenant/other/site/{SITE_UUID}/lane/1/gate/command") is None


def test_sequence_is_monotonic_per_topic_and_across_restarts() -> None:
    now = [1_000.0]
    counter = SequenceCounter(clock=lambda: now[0])
    first = [counter.next("lane/1/scale/weight") for _ in range(5)]
    assert first == sorted(set(first))
    other = counter.next("sync/status")
    assert other == 1_000_000  # independent per-topic series
    now[0] += 1  # a restarted daemon one second later
    restarted = SequenceCounter(clock=lambda: now[0])
    assert restarted.next("lane/1/scale/weight") > first[-1]


async def test_published_payloads_are_stamped_and_buffered_until_prefix_known(make_app_config) -> None:
    service = MqttService(make_app_config(), asyncio.get_running_loop())
    service.publish("scale/weight", {"weight_kg": 1200}, lane_number=1)
    service.publish("scale/weight", {"weight_kg": 1220}, lane_number=1)
    service.simulated = True
    service.publish("sync/status", {"pending_count": 0}, qos=1, retain=True)
    assert len(service.buffer) == 3  # not connected and no prefix yet
    (s1, lane1, e1, _, _), (_, _, e2, _, _), (s3, lane3, e3, qos3, retain3) = service.buffer
    first, second, third = json.loads(e1), json.loads(e2), json.loads(e3)
    assert (s1, lane1) == ("scale/weight", 1)
    assert first["weight_kg"] == 1200 and first["lane_number"] == 1
    assert first["ts"].endswith("Z") and second["seq"] > first["seq"]
    assert "simulated" not in first
    assert (s3, lane3, qos3, retain3) == ("sync/status", None, 1, True)
    assert third["simulated"] is True and "lane_number" not in third

    sent: list[tuple[str, dict]] = []

    class Result:
        rc = 0

    service.client.publish = lambda topic, payload, qos=0, retain=False: (sent.append((topic, json.loads(payload))), Result())[1]  # type: ignore[method-assign]
    service.client.subscribe = lambda *args, **kwargs: None  # type: ignore[method-assign]
    service.connected = True
    service.set_topic_prefix(PREFIX)
    assert [topic for topic, _ in sent] == [
        f"{PREFIX}/lane/1/scale/weight",
        f"{PREFIX}/lane/1/scale/weight",
        f"{PREFIX}/sync/status",
    ]
    assert not service.buffer


async def test_unknown_topic_is_dropped_not_raised(make_app_config) -> None:
    service = MqttService(make_app_config(), asyncio.get_running_loop())
    service.publish("telemetry", {"weight_kg": 1}, lane_number=1)
    service.publish("state", {"state": "IDLE"})  # lane-only topic without a lane
    assert not service.buffer

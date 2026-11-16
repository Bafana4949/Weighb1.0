import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from config import GateConfig
from gate_safety import (
    GateCommandRejected, GateCommandValidator, GateController, GateInterlockError, gate_open_refusal,
)
from models import TelemetryFrame, WeighingState
from protocol import build_command

NOW = datetime(2026, 10, 26, 10, 0, 0, tzinfo=timezone.utc)


def command(seq: int = 1, ts: datetime | str = NOW, **overrides):
    stamp = ts.isoformat().replace("+00:00", "Z") if isinstance(ts, datetime) else ts
    body = {"action": "GATE_OPEN", "target": "ENTRY", "ts": stamp, "seq": seq, "requested_by": "operator-1"}
    body.update(overrides)
    return body


def frame(p1=False, p2=False, status="STABLE", at=None) -> TelemetryFrame:
    return TelemetryFrame(0, p1, p2, None, status, at or datetime.now(timezone.utc), "raw")


def test_valid_gate_command_is_accepted() -> None:
    validator = GateCommandValidator([1, 2])
    accepted = validator.validate(2, command(seq=7, target="EXIT", action="GATE_CLOSE"), now=NOW)
    assert (accepted.action, accepted.target, accepted.seq) == ("GATE_CLOSE", "EXIT", 7)


@pytest.mark.parametrize("ts", [NOW - timedelta(seconds=31), NOW + timedelta(seconds=31), NOW - timedelta(hours=2)])
def test_stale_or_future_ts_is_rejected(ts) -> None:
    with pytest.raises(GateCommandRejected, match="stale"):
        GateCommandValidator([1]).validate(1, command(ts=ts), now=NOW)


def test_ts_within_window_is_accepted() -> None:
    GateCommandValidator([1]).validate(1, command(ts=NOW - timedelta(seconds=29)), now=NOW)


def test_replayed_seq_is_rejected() -> None:
    validator = GateCommandValidator([1, 2])
    validator.validate(1, command(seq=42), now=NOW)
    with pytest.raises(GateCommandRejected, match="replayed"):
        validator.validate(1, command(seq=42), now=NOW + timedelta(seconds=1))
    # Same seq on another lane is a different topic and is fine.
    validator.validate(2, command(seq=42), now=NOW)


@pytest.mark.parametrize("lane", [None, 3, 0])
def test_unknown_lane_is_rejected(lane) -> None:
    with pytest.raises(GateCommandRejected, match="unknown lane"):
        GateCommandValidator([1, 2]).validate(lane, command(), now=NOW)


@pytest.mark.parametrize("payload", [
    command(action="LIGHT"),
    command(target="SIDE"),
    command(seq="5"),
    command(seq=True),
    command(seq=-1),
    {k: v for k, v in command().items() if k != "ts"},
    {k: v for k, v in command().items() if k != "seq"},
    command(ts="yesterday"),
    command(ts="2026-10-26T10:00:00"),  # no offset
    command(lane_number=2),  # disagrees with the topic
    ["GATE_OPEN"],
])
def test_schema_violations_are_rejected(payload) -> None:
    with pytest.raises(GateCommandRejected):
        GateCommandValidator([1, 2]).validate(1, payload, now=NOW)


def test_rejected_command_does_not_burn_its_seq() -> None:
    validator = GateCommandValidator([1])
    with pytest.raises(GateCommandRejected):
        validator.validate(1, command(seq=9, ts=NOW - timedelta(minutes=5)), now=NOW)
    validator.validate(1, command(seq=9), now=NOW)


def refusal(target="ENTRY", state=WeighingState.POSITIONING, current=None, connected=True, now=None):
    now = now or datetime.now(timezone.utc)
    return gate_open_refusal(target, state=state, frame=current if current is not None else frame(at=now), connected=connected, now=now, telemetry_max_age_seconds=2)


def test_interlock_allows_normal_flow_patterns() -> None:
    assert refusal("ENTRY", current=frame(p1=True)) is None          # truck at the entry beam
    assert refusal("ENTRY", current=frame(p1=True, p2=True)) is None  # reload: truck backs out
    assert refusal("EXIT", current=frame(p1=True, p2=True)) is None   # accepted load, fully on deck
    assert refusal("EXIT", current=frame()) is None                   # empty lane


@pytest.mark.parametrize("state", [WeighingState.FAULT, WeighingState.MANUAL_MODE])
def test_interlock_refuses_open_in_error_states(state) -> None:
    assert "lane is in" in refusal(state=state)


def test_interlock_refuses_on_obstruction_stale_telemetry_disconnect_and_scale_fault() -> None:
    assert "obstruction" in refusal("ENTRY", current=frame(p2=True))
    assert "straddling" in refusal("EXIT", current=frame(p1=True))
    assert "straddling" in refusal("EXIT", current=frame(p2=True))
    old = datetime.now(timezone.utc) - timedelta(seconds=5)
    assert "stale" in refusal(current=frame(at=old))
    assert "disconnected" in refusal(connected=False)
    assert "FAULT" in refusal(current=frame(status="FAULT"))
    assert "no telemetry" in gate_open_refusal("ENTRY", state=WeighingState.IDLE, frame=None, connected=True, now=datetime.now(timezone.utc), telemetry_max_age_seconds=2)


def make_controller(state, current, sent, auto_close=0.05, max_hold=60.0):
    async def transmit(packet: bytes) -> None:
        sent.append(packet)

    return GateController(
        lane_id="default",
        settings=GateConfig(auto_close_seconds=auto_close, max_hold_open_seconds=max_hold),
        transmit=transmit,
        state=lambda: state[0],
        frame=lambda: current[0],
        connected=lambda: True,
        poll_seconds=0.01,
    )


async def test_refused_open_never_reaches_the_relay() -> None:
    sent: list[bytes] = []
    controller = make_controller([WeighingState.FAULT], [frame()], sent)
    with pytest.raises(GateInterlockError):
        await controller.send(build_command("GATE_OPEN", "EXIT"), source="mqtt:test")
    assert sent == []
    assert controller.positions["EXIT"] == "CLOSED"
    # Closing is always allowed: it is the fail-safe direction.
    await controller.send(build_command("GATE_CLOSE", "EXIT"), source="mqtt:test")
    assert sent == [build_command("GATE_CLOSE", "EXIT")]


async def test_auto_close_fires_and_waits_for_beams_to_clear() -> None:
    sent: list[bytes] = []
    current = [frame()]
    controller = make_controller([WeighingState.COMPLETE], current, sent)
    await controller.send(build_command("GATE_OPEN", "EXIT"), source="state_machine")
    current[0] = frame(p1=True, p2=True)  # truck still on the deck
    await asyncio.sleep(0.15)
    assert sent == [build_command("GATE_OPEN", "EXIT")], "must not close onto a vehicle"
    current[0] = frame()
    await asyncio.sleep(0.1)
    assert sent[-1] == build_command("GATE_CLOSE", "EXIT")
    assert controller.positions["EXIT"] == "CLOSED"


async def test_explicit_close_cancels_auto_close() -> None:
    sent: list[bytes] = []
    controller = make_controller([WeighingState.POSITIONING], [frame(p1=True)], sent, auto_close=0.05)
    await controller.send(build_command("GATE_OPEN", "ENTRY"), source="state_machine")
    await controller.send(build_command("GATE_CLOSE", "ENTRY"), source="state_machine")
    await asyncio.sleep(0.1)
    assert sent.count(build_command("GATE_CLOSE", "ENTRY")) == 1

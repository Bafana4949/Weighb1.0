import httpx
import pytest
from pydantic import SecretStr

import daemon
from conftest import SITE_KEY

TOKEN = "local-token"
MUTATING = [
    ("/edge/command", {"action": "GATE_OPEN", "target": "ENTRY"}),
    ("/edge/manual-override", {"command": {"action": "GATE_OPEN", "target": "EXIT"}, "operator_id": "op-1", "reason": "truck stuck after review"}),
    ("/edge/check-in", {"manual_plate": "AB123CDGP"}),
    ("/edge/driver-decision", {"decision": "ACCEPT"}),
    ("/edge/lane-reset", {"operator_id": "op-1", "reason": "fault cleared on site"}),
]


@pytest.fixture
async def edge(make_app_config):
    service = daemon.Runtime(make_app_config())
    daemon.runtime = service
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=daemon.app), base_url="http://edge") as client:
            yield client, service
    finally:
        daemon.runtime = None


@pytest.mark.parametrize("path, body", MUTATING)
async def test_mutating_endpoints_require_the_local_token(edge, path, body) -> None:
    client, _ = edge
    assert (await client.post(path, json=body)).status_code == 401
    assert (await client.post(path, json=body, headers={"x-edge-token": "wrong"})).status_code == 401


async def test_mutating_endpoints_fail_closed_without_a_configured_token(edge) -> None:
    client, service = edge
    service.config.runtime.local_api_token = None
    response = await client.post("/edge/command", json={"action": "GATE_CLOSE", "target": "ENTRY"}, headers={"x-edge-token": TOKEN})
    assert response.status_code == 503


async def test_gate_open_through_api_is_still_interlocked(edge) -> None:
    client, service = edge
    headers = {"x-edge-token": TOKEN}
    # No hardware connected in tests: the interlock refuses instead of "opening" blind.
    response = await client.post("/edge/command", json={"action": "GATE_OPEN", "target": "ENTRY"}, headers=headers)
    assert response.status_code == 409 and "disconnected" in response.json()["detail"]
    short = await client.post("/edge/manual-override", json={"command": {"action": "GATE_OPEN", "target": "EXIT"}, "operator_id": "op", "reason": "short"}, headers=headers)
    assert short.status_code == 422
    reset = await client.post("/edge/lane-reset", json={"operator_id": "op-1", "reason": "nothing is faulted"}, headers=headers)
    assert reset.status_code == 409
    assert service.lane(None).gate.positions == {"ENTRY": "CLOSED", "EXIT": "CLOSED"}


async def test_health_is_open_and_leaks_no_secrets(edge) -> None:
    client, service = edge
    service.config.runtime.local_api_token = SecretStr(TOKEN)
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.text
    for secret in (SITE_KEY, TOKEN, "secret-pass"):
        assert secret not in body
    assert response.json()["site_id"] == "ALPHA"

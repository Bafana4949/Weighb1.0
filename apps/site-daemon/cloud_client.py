from __future__ import annotations

import json
from typing import Any

import httpx

from config import AppConfig
from models import ActiveBooking, CloudEdgeConfig

SITE_KEY_HEADER = "x-site-api-key"


class CloudUnavailable(RuntimeError):
    """No cloud API is configured (offline/dev); callers treat it like a failed request."""


# Everything a cloud call can raise that should degrade to "cloud unavailable"
# rather than propagate into weighing.
CLOUD_ERRORS: tuple[type[BaseException], ...] = (
    httpx.HTTPError, CloudUnavailable, ValueError, KeyError, TypeError, AttributeError, json.JSONDecodeError,
)


def describe_error(error: BaseException) -> str:
    # httpx connection errors often stringify to an empty message.
    text = str(error)
    return f"{type(error).__name__}: {text}" if text else type(error).__name__


def cloud_headers(config: AppConfig) -> dict[str, str]:
    """Per-site key header. The cloud stores only its SHA-256 and resolves it to exactly one site."""
    key = config.cloud.site_api_key
    return {SITE_KEY_HEADER: key.get_secret_value()} if key else {}


def cloud_url(config: AppConfig, path: str) -> str:
    if not config.cloud.api_url:
        raise CloudUnavailable("cloud.api_url is not configured")
    return f"{config.cloud.api_url.rstrip('/')}/{path.lstrip('/')}"


class CloudClient:
    def __init__(self, config: AppConfig, client: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self._client = client

    @property
    def http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(self.config.cloud.request_timeout_seconds))
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = await self.http.get(cloud_url(self.config, path), params=params, headers=cloud_headers(self.config))
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise ValueError(f"unexpected response body from {path}")
        return body

    async def post_json(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        response = await self.http.post(cloud_url(self.config, path), json=body, headers=cloud_headers(self.config))
        response.raise_for_status()
        parsed = response.json()
        return parsed if isinstance(parsed, dict) else {}

    async def fetch_edge_config(self) -> CloudEdgeConfig:
        body = await self.get_json("edge/config")
        if not body.get("success") or not isinstance(body.get("data"), dict):
            raise ValueError(f"GET /edge/config failed: {body.get('error') or 'no data'}")
        return CloudEdgeConfig.model_validate(body["data"])

    async def send_heartbeat(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = await self.post_json("edge/heartbeat", payload)
        return body.get("data") or {}

    async def fetch_chain_head(self) -> str | None:
        body = await self.get_json("transactions/chain-head", {"site": self.config.site.id})
        return (body.get("data") or {}).get("integrity_hash")

    async def fetch_active_booking(self, plate_normalized: str) -> ActiveBooking | None:
        body = await self.get_json("bookings/active", {"site": self.config.site.id, "plate": plate_normalized})
        data = body.get("data")
        return ActiveBooking.model_validate(data) if data else None

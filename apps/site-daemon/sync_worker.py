from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import httpx

from cloud_client import CloudUnavailable, cloud_headers, cloud_url, describe_error
from config import AppConfig
from database import EdgeDatabase

if TYPE_CHECKING:
    from mqtt_client import MqttService

LOGGER = logging.getLogger(__name__)

# Error codes / messages the cloud uses when it already holds the record.
_DUPLICATE_MARKERS = frozenset({"duplicate", "duplicate transaction", "duplicate incident", "duplicate_transaction", "duplicate_incident"})


def is_duplicate_response(status_code: int, body: dict[str, Any]) -> bool:
    """A 4xx that means "the cloud already has this record" (as opposed to a conflict
    such as HASH_CHAIN_MISMATCH, which must stay queued)."""
    if not 400 <= status_code < 500:
        return False
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    if data.get("confirmation_hash") or data.get("duplicate") is True:
        return True
    markers = {str(body.get(key) or "").strip().lower() for key in ("code", "error")}
    return bool(markers & _DUPLICATE_MARKERS)


class SyncWorker:
    def __init__(self, config: AppConfig, database: EdgeDatabase, mqtt: "MqttService") -> None:
        self.config = config
        self.database = database
        self.mqtt = mqtt
        self._stop = asyncio.Event()
        self._lock = asyncio.Lock()
        self.last_sync_at: str | None = None
        self.cloud_online = False
        self.auth_rejected = False
        self._chain_conflict_alerted: set[str] = set()

    async def run(self) -> None:
        timeout = httpx.Timeout(self.config.cloud.request_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            while not self._stop.is_set():
                try:
                    await self.sync_once(client)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    LOGGER.exception("Sync cycle failed; will retry")
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.config.cloud.sync_interval_seconds)
                except asyncio.TimeoutError:
                    pass

    def stop(self) -> None:
        self._stop.set()

    async def sync_once(self, client: httpx.AsyncClient) -> None:
        # One cycle at a time, so an item can never be in flight twice.
        async with self._lock:
            if not self.config.cloud.api_url:
                self.cloud_online = False
                await self._publish_status()
                return
            await self._maybe_bootstrap_chain_head(client)
            items = await asyncio.to_thread(self.database.list_due_sync_items)
            if not items:
                self.cloud_online = await self._healthcheck(client)
                await self._publish_status()
                return
            for item in items:
                if not await self._sync_item(client, item):
                    # Cloud unreachable: stop here instead of timing out on every queued
                    # item; the rest keep their place and go out on the next cycle.
                    break
            await self._publish_status()

    def _idempotency_key(self, item: dict[str, Any]) -> str:
        if item["operation"] == "transaction_reconcile":
            return item["aggregate_id"]  # the edge transaction id
        return item["idempotency_key"]

    async def _mark_failed(self, item: dict[str, Any], error: str) -> None:
        await asyncio.to_thread(
            self.database.mark_sync_failed, item["id"], item["retry_count"], error,
            self.config.cloud.retry_base_seconds, self.config.cloud.retry_max_seconds,
        )

    async def _sync_item(self, client: httpx.AsyncClient, item: dict[str, Any]) -> bool:
        """Upload one queue item. Returns False when the cloud is unreachable."""
        await asyncio.to_thread(self.database.mark_syncing, item["id"])
        try:
            if item["operation"] == "transaction_reconcile":
                endpoint = cloud_url(self.config, "transactions/reconcile")
            elif item["operation"] == "incident_upload":
                endpoint = cloud_url(self.config, "incidents")
            else:
                raise ValueError(f"unsupported sync operation: {item['operation']}")
            response = await client.post(
                endpoint,
                json=item["payload"],
                headers={**cloud_headers(self.config), "idempotency-key": self._idempotency_key(item)},
            )
        except (httpx.TransportError, CloudUnavailable) as error:
            self.cloud_online = False
            await self._mark_failed(item, describe_error(error))
            LOGGER.warning("Cloud unreachable while syncing queue item %s: %s", item["id"], describe_error(error))
            return False
        except (httpx.HTTPError, ValueError) as error:
            await self._mark_failed(item, str(error))
            LOGGER.warning("Cloud sync failed for queue item %s: %s", item["id"], error)
            return True

        try:
            body = response.json()
        except (json.JSONDecodeError, ValueError):
            body = {}
        if not isinstance(body, dict):
            body = {}
        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        self.cloud_online = response.status_code < 500
        self.auth_rejected = response.status_code in {401, 403}

        if response.is_success:
            await asyncio.to_thread(self.database.mark_synced, item["id"], item["aggregate_id"], data.get("confirmation_hash"))
            self.last_sync_at = datetime.now(timezone.utc).isoformat()
            return True

        if is_duplicate_response(response.status_code, body):
            # The cloud already holds this record (e.g. the first upload landed but the
            # response was lost). Marking it synced is what prevents a re-upload loop.
            LOGGER.info("Queue item %s already present in the cloud; marking synced", item["id"])
            await asyncio.to_thread(self.database.mark_synced, item["id"], item["aggregate_id"], data.get("confirmation_hash"))
            self.last_sync_at = datetime.now(timezone.utc).isoformat()
            return True

        error_message = body.get("error") or f"HTTP {response.status_code} for {item['operation']}"
        await self._mark_failed(item, f"HTTP {response.status_code}: {error_message}")
        if self.auth_rejected:
            LOGGER.error("Cloud rejected the site API key (HTTP %s); check WB_SITE_API_KEY", response.status_code)
        elif response.status_code == 409:
            # 409 without a duplicate confirmation is NOT a duplicate — e.g. HASH_CHAIN_MISMATCH,
            # SITE_MISMATCH, or BOOKING_IDENTITY_MISMATCH. Fabricating a confirmation hash here
            # would silently discard a real transaction that never made it into the cloud ledger.
            # Keep it in the queue for retry and raise a high-severity incident so an operator
            # can reconcile the divergence (e.g. re-bootstrap the local hash chain).
            await self._alert_conflict(item, error_message)
        else:
            LOGGER.warning("Cloud sync failed for queue item %s: HTTP %s %s", item["id"], response.status_code, error_message)
        return True

    async def _alert_conflict(self, item: dict[str, Any], error_message: str) -> None:
        if item["idempotency_key"] in self._chain_conflict_alerted:
            return
        self._chain_conflict_alerted.add(item["idempotency_key"])
        await asyncio.to_thread(
            self.database.store_incident,
            {
                "type": "CLOUD_SYNC_FAILURE",
                "severity": "CRITICAL",
                "title": "Cloud rejected sync item without confirming a duplicate",
                "description": (
                    f"{item['operation']} for aggregate {item['aggregate_id']} was rejected "
                    f"with HTTP 409 ({error_message}). The record has NOT been confirmed in "
                    "the cloud ledger and will keep retrying; operator review is required."
                ),
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "evidence_urls": [],
                "site_id": self.config.site.id,
                "metadata": {"aggregate_id": item["aggregate_id"], "operation": item["operation"], "cloud_error": error_message},
            },
        )
        self.mqtt.publish("alerts", {
            "type": "CLOUD_SYNC_FAILURE", "severity": "CRITICAL",
            "title": "Cloud rejected sync item without confirming a duplicate",
            "description": error_message,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }, qos=1)

    async def _maybe_bootstrap_chain_head(self, client: httpx.AsyncClient) -> None:
        # database.bootstrap_chain_head() is a no-op once any local transaction exists, so it is
        # cheap and safe to retry every cycle. This closes the startup race where the site daemon
        # comes up before the cloud is reachable: without a retry, a single failed bootstrap
        # attempt would permanently strand the local ledger at genesis, diverging from the cloud's
        # real chain head for the site.
        try:
            response = await client.get(
                cloud_url(self.config, "transactions/chain-head"),
                params={"site": self.config.site.id},
                headers=cloud_headers(self.config),
            )
            response.raise_for_status()
            chain_hash = response.json().get("data", {}).get("integrity_hash")
            if chain_hash:
                changed = await asyncio.to_thread(self.database.bootstrap_chain_head, chain_hash)
                if changed:
                    LOGGER.info("Bootstrapped local transaction chain from cloud head %s", chain_hash)
        except (httpx.HTTPError, CloudUnavailable, ValueError, AttributeError):
            pass

    async def _healthcheck(self, client: httpx.AsyncClient) -> bool:
        try:
            response = await client.get(cloud_url(self.config, "health"))
            return response.status_code < 500
        except (httpx.HTTPError, CloudUnavailable):
            return False

    async def _publish_status(self) -> None:
        counts = await asyncio.to_thread(self.database.sync_counts)
        self.mqtt.publish(
            "sync/status",
            {
                "cloud_online": self.cloud_online,
                "pending_count": counts["pending"],
                "failed_count": counts["failed"],
                "last_sync_time": self.last_sync_at,
            },
            qos=1,
            retain=True,
        )

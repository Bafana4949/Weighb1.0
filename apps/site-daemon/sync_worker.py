from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from config import AppConfig
from database import EdgeDatabase
from mqtt_client import MqttService

LOGGER = logging.getLogger(__name__)


class SyncWorker:
    def __init__(self, config: AppConfig, database: EdgeDatabase, mqtt: MqttService) -> None:
        self.config = config
        self.database = database
        self.mqtt = mqtt
        self._stop = asyncio.Event()
        self.last_sync_at: str | None = None
        self.cloud_online = False
        self._chain_conflict_alerted: set[str] = set()

    async def run(self) -> None:
        timeout = httpx.Timeout(self.config.cloud.request_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            while not self._stop.is_set():
                await self.sync_once(client)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.config.cloud.sync_interval_seconds)
                except asyncio.TimeoutError:
                    pass

    def stop(self) -> None:
        self._stop.set()

    async def sync_once(self, client: httpx.AsyncClient) -> None:
        await self._maybe_bootstrap_chain_head(client)
        items = await asyncio.to_thread(self.database.list_due_sync_items)
        if not items:
            self.cloud_online = await self._healthcheck(client)
            self._publish_status()
            return

        for item in items:
            await asyncio.to_thread(self.database.mark_syncing, item["id"])
            try:
                if item["operation"] == "transaction_reconcile":
                    endpoint = f"{self.config.cloud.api_url.rstrip('/')}/transactions/reconcile"
                elif item["operation"] == "incident_upload":
                    endpoint = f"{self.config.cloud.api_url.rstrip('/')}/incidents"
                else:
                    raise ValueError(f"unsupported sync operation: {item['operation']}")
                response = await client.post(
                    endpoint,
                    json=item["payload"],
                    headers={
                        "x-site-api-key": self.config.cloud.site_api_key,
                        "idempotency-key": item["idempotency_key"],
                    },
                )
                if response.status_code == 409:
                    body = response.json()
                    confirmation = (body.get("data") or {}).get("confirmation_hash")
                    if confirmation:
                        # A genuine duplicate: the cloud already holds this record and told us its hash.
                        await asyncio.to_thread(self.database.mark_synced, item["id"], item["aggregate_id"], confirmation)
                    else:
                        # 409 without a confirmation_hash is NOT a duplicate — e.g. HASH_CHAIN_MISMATCH,
                        # SITE_MISMATCH, or BOOKING_IDENTITY_MISMATCH. Fabricating a confirmation hash here
                        # would silently discard a real transaction that never made it into the cloud ledger.
                        # Keep it in the queue for retry and raise a high-severity incident so an operator
                        # can reconcile the divergence (e.g. re-bootstrap the local hash chain).
                        error_message = body.get("error") or f"HTTP 409 without confirmation_hash for {item['operation']}"
                        await asyncio.to_thread(self.database.mark_sync_failed, item["id"], item["retry_count"], error_message)
                        if item["idempotency_key"] not in self._chain_conflict_alerted:
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
                else:
                    response.raise_for_status()
                    body = response.json()
                    data = body.get("data") or {}
                    confirmation = data.get("confirmation_hash")
                    await asyncio.to_thread(self.database.mark_synced, item["id"], item["aggregate_id"], confirmation)
                self.cloud_online = True
                self.last_sync_at = datetime.now(timezone.utc).isoformat()
            except (httpx.HTTPError, ValueError, json.JSONDecodeError) as error:
                self.cloud_online = False
                await asyncio.to_thread(self.database.mark_sync_failed, item["id"], item["retry_count"], str(error))
                LOGGER.warning("Cloud sync failed for queue item %s: %s", item["id"], error)
        self._publish_status()

    async def _maybe_bootstrap_chain_head(self, client: httpx.AsyncClient) -> None:
        # database.bootstrap_chain_head() is a no-op once any local transaction exists, so it is
        # cheap and safe to retry every cycle. This closes the startup race where the site daemon
        # comes up before the cloud is reachable: without a retry, a single failed bootstrap
        # attempt would permanently strand the local ledger at genesis, diverging from the cloud's
        # real chain head for the site.
        endpoint = f"{self.config.cloud.api_url.rstrip('/')}/transactions/chain-head"
        try:
            response = await client.get(endpoint, params={"site": self.config.site.id}, headers={"x-site-api-key": self.config.cloud.site_api_key})
            response.raise_for_status()
            chain_hash = response.json().get("data", {}).get("integrity_hash")
            if chain_hash:
                changed = await asyncio.to_thread(self.database.bootstrap_chain_head, chain_hash)
                if changed:
                    LOGGER.info("Bootstrapped local transaction chain from cloud head %s", chain_hash)
        except (httpx.HTTPError, ValueError, AttributeError):
            pass

    async def _healthcheck(self, client: httpx.AsyncClient) -> bool:
        try:
            response = await client.get(f"{self.config.cloud.api_url.rstrip('/')}/health")
            return response.status_code < 500
        except httpx.HTTPError:
            return False

    def _publish_status(self) -> None:
        self.mqtt.publish(
            f"sync/{self.config.site.id}/status",
            {
                "cloud_online": self.cloud_online,
                "pending_count": self.database.pending_count(),
                "last_sync_time": self.last_sync_at,
            },
            qos=1,
            retain=True,
        )

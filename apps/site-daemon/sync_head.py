#!/usr/bin/env python3
"""Operator utility: adopt the cloud's transaction chain head into the local ledger.

Uses the same config and per-site key as the daemon (WB_CONFIG_PATH, WB_SITE_API_KEY,
WB_CLOUD_API_URL, WB_EDGE_DB_PATH). Like the daemon's own bootstrap, it only moves the
local head while nothing is waiting to sync."""
from __future__ import annotations

import asyncio

from cloud_client import CLOUD_ERRORS, CloudClient
from config import load_config
from database import EdgeDatabase


async def main() -> int:
    config = load_config()
    client = CloudClient(config)
    try:
        head = await client.fetch_chain_head()
    except CLOUD_ERRORS as error:
        print("ERROR: could not read the cloud chain head:", error)
        return 1
    finally:
        await client.close()
    if not head:
        print("Cloud returned no chain head; local ledger left unchanged")
        return 0
    database = EdgeDatabase(config.storage.sqlite_path, config.storage.backup_directory)
    changed = database.bootstrap_chain_head(head)
    print("Local chain head set to" if changed else "Local ledger has unsynced items; head left unchanged at", database.get_metadata("last_hash"))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

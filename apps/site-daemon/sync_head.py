import httpx
import sqlite3

try:
    r = httpx.get(
        "http://host.docker.internal:3010/api/transactions/chain-head?site=WOESTALLEEN",
        headers={"x-site-api-key": "3f1fddae9eaa2ce74b118a22b041a70732f1700c6c86430126e380e6189db50d"},
        timeout=10,
    )
    data = r.json()
    print("CLOUD CHAIN HEAD RESPONSE:", data)
    head = data.get("data", {}).get("integrity_hash")
    if head:
        conn = sqlite3.connect("/data/edge.db")
        conn.execute("UPDATE metadata SET value=? WHERE key='last_hash'", (head,))
        conn.commit()
        print("EDGE METADATA UPDATED TO:", conn.execute("SELECT * FROM metadata").fetchall())
    else:
        print("NO HEAD RETURNED, KEPT GENESIS")
except Exception as e:
    print("ERROR:", e)

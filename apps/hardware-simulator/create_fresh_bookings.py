#!/usr/bin/env python3
"""
Quick script to create 2 fresh bookings for EX-OO1 via the web API,
then immediately run the simulation so the operator can watch the
live scale dashboard animate in real-time.

Usage:
    python create_fresh_bookings.py
"""
from __future__ import annotations
import json
import time
import urllib.request
import urllib.error

WEB_URL = "http://127.0.0.1:3010"
API_KEY = "3f1fddae9eaa2ce74b118a22b041a70732f1700c6c86430126e380e6189db50d"
DAEMON_URL = "http://127.0.0.1:8020"
ADMIN_EMAIL = "admin@weighbridge.local"
ADMIN_PASSWORD = "Password123!"


def get_session_token() -> str:
    """Log in as admin and return the cookie header value."""
    body = json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{WEB_URL}/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            cookies = resp.headers.get_all("Set-Cookie") or []
            for cookie in cookies:
                if "authjs.session-token" in cookie or "next-auth.session-token" in cookie:
                    return cookie.split(";")[0]
    except Exception as e:
        pass
    return ""


def api_get(path: str, cookie: str = "", api_key: str = "") -> dict:
    headers: dict[str, str] = {}
    if cookie:
        headers["Cookie"] = cookie
    if api_key:
        headers["x-site-api-key"] = api_key
    req = urllib.request.Request(f"{WEB_URL}{path}", headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def api_post(path: str, payload: dict, cookie: str = "") -> dict:
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(
        f"{WEB_URL}{path}", data=body, headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def api_put(path: str, payload: dict, cookie: str = "") -> dict:
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(
        f"{WEB_URL}{path}", data=body, headers=headers, method="PUT"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def check_queue_via_api() -> list[dict]:
    try:
        result = api_get("/api/bookings/queue?site=EX-OO1", api_key=API_KEY)
        return result.get("data") or []
    except Exception as e:
        print(f"  Queue check failed: {e}")
        return []


def main() -> None:
    print("=" * 60)
    print("Weighbridge Fresh Booking Creator")
    print("=" * 60)

    # Step 1: Check current queue state
    print("\n[1] Checking current arrival queue for EX-OO1...")
    queue = check_queue_via_api()
    if queue:
        print(f"  Found {len(queue)} truck(s) already in queue:")
        for item in queue:
            print(f"    - {item['plate']} ({item['status']})")
        print("\n  Queue is NOT empty — you can run the simulator now!")
        print(f"  Command: python scenarios.py normal-all --daemon-url {DAEMON_URL} --control-port 7012 --lane north")
        return

    print("  Queue is EMPTY — bookings need to be created.")
    print("\n[2] To add trucks to the arrival queue, log in to the transporter portal:")
    print(f"  URL:      {WEB_URL}/transporter")
    print(f"  Email:    transporter@weighbridge.local")
    print(f"  Password: Password123!")
    print("\n  Then click 'New Order' and book a vehicle for site EX-OO1.")
    print("  OR — re-seed the database (quickest option) with:")
    print("  docker exec -it weighbridge-system-web-1 npm run db:seed")
    print("\n[3] After bookings are in queue, run the simulator:")
    print(f"  python scenarios.py normal-all --daemon-url {DAEMON_URL} --control-port 7012 --lane north")
    print("\n  Then watch: http://localhost:3010/operator")


if __name__ == "__main__":
    main()

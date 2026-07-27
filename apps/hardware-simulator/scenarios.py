#!/usr/bin/env python3
"""Automated input scenarios for the hardware simulator.

Start simulator.py and site daemon first, then run one scenario, for example:
    python scenarios.py normal                        # auto-picks a truck from the live queue
    python scenarios.py normal --plate "CD 456 EF MP"  # or force a specific one
"""
from __future__ import annotations

import argparse
import json
import random
import socket
import time
import urllib.error
import urllib.request
from collections.abc import Callable

HOST = "127.0.0.1"
CONTROL_PORT = 7002
DAEMON_URL = "http://127.0.0.1:8010"
WEB_URL = "http://127.0.0.1:3010"
API_KEY = "3f1fddae9eaa2ce74b118a22b041a70732f1700c6c86430126e380e6189db50d"
SITE_CODE = "WOESTALLEEN"


def update(**values: object) -> None:
    with socket.create_connection((HOST, CONTROL_PORT), timeout=3) as sock:
        stream = sock.makefile("rwb")
        stream.write((json.dumps(values) + "\n").encode())
        stream.flush()
        response = json.loads(stream.readline())
        if not response.get("ok"):
            raise RuntimeError(response.get("error", "unknown simulator control error"))


def check_in(plate: str, daemon_url: str) -> dict[str, object]:
    """Tell the daemon which vehicle is at the gate, bypassing the static ANPR
    test image so the correct booking (and driver RFID) gets locked in before
    any telemetry arrives. Without this the daemon always OCRs the same fixed
    sample plate image regardless of which RFID the simulator later reports."""
    body = json.dumps({"manual_plate": plate}).encode()
    request = urllib.request.Request(
        f"{daemon_url.rstrip('/')}/edge/check-in", data=body,
        headers={"content-type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read())
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach site daemon at {daemon_url}: {error}") from error


def next_queued_plate(web_url: str, api_key: str, site: str) -> str:
    """Ask the cloud which vehicles currently have an approved booking in the
    arrival window, and pick one — so 'normal' can be run with no arguments
    and still simulate a real, different truck each time instead of the
    operator having to look up and type a plate."""
    request = urllib.request.Request(
        f"{web_url.rstrip('/')}/api/bookings/queue?site={site}",
        headers={"x-site-api-key": api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read())
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach cloud API at {web_url}: {error}") from error
    queue = body.get("data") or []
    if not queue:
        raise RuntimeError(
            "No approved bookings in the current arrival window — nothing to simulate. "
            "Create a booking as the transporter user first, or pass --plate explicitly."
        )
    return random.choice(queue)["plate"]


def ramp(start: int, stop: int, seconds: float, jitter: int = 0) -> None:
    steps = max(1, int(seconds / 0.1))
    for index in range(steps + 1):
        base = start + ((stop - start) * index // steps)
        update(weight_kg=max(0, base + random.randint(-jitter, jitter)), scale_status="UNSTABLE" if jitter else "STABLE")
        time.sleep(0.1)


def reset() -> None:
    update(weight_kg=0, p1=False, p2=False, rfid="00000000", scale_status="STABLE")
    time.sleep(1)


def scenario_normal_weighment(
    plate: str | None = None,
    daemon_url: str = DAEMON_URL,
    web_url: str = WEB_URL,
    api_key: str = API_KEY,
    site: str = SITE_CODE,
) -> None:
    reset()
    if plate is None:
        plate = next_queued_plate(web_url, api_key, site)
        print(f"Auto-selected next truck from the arrival queue: {plate}")
    result = check_in(plate, daemon_url)
    if not result.get("authorised"):
        raise RuntimeError(f"Check-in for {plate!r} was not authorised: {result.get('reason')}")
    booking = result["booking"]
    print(f"Checked in {booking['plate']} · {booking['reference']} · driver RFID {booking['driver_rfid']}")
    # Load to ~98% of this booking's target tonnage rather than a fixed
    # weight — a hardcoded gross weight legitimately overloads (and gets
    # correctly held by the server) any booking with a smaller target than
    # whatever truck the constant was tuned for.
    gross_target = round(booking["tare_weight_kg"] + booking["target_tonnage_kg"] * 0.98)
    update(rfid=booking["driver_rfid"])
    time.sleep(1)
    update(p1=True)
    time.sleep(0.8)
    update(p2=True)
    ramp(0, gross_target, 3, jitter=120)
    update(weight_kg=gross_target, scale_status="STABLE")
    time.sleep(5)
    update(p1=False, p2=False)
    ramp(gross_target, 0, 2)
    reset()


def scenario_unauthorised_vehicle() -> None:
    reset()
    update(rfid="UNKNOWN99", p1=True)
    time.sleep(2)
    update(p2=True, weight_kg=41_000)
    time.sleep(4)
    reset()


def scenario_overload() -> None:
    reset()
    update(rfid="DRV00421", p1=True, p2=True)
    ramp(0, 61_500, 3, jitter=100)
    update(weight_kg=61_500, scale_status="STABLE")
    time.sleep(5)
    reset()


def scenario_unstable_scale() -> None:
    reset()
    update(rfid="DRV00421", p1=True, p2=True)
    end = time.monotonic() + 65
    while time.monotonic() < end:
        update(weight_kg=52_000 + random.randint(-450, 450), scale_status="UNSTABLE")
        time.sleep(0.1)
    reset()


def scenario_driver_mismatch() -> None:
    reset()
    update(rfid="DRV00999", p1=True, p2=True)
    ramp(0, 50_000, 2, jitter=60)
    update(weight_kg=50_000, scale_status="STABLE")
    time.sleep(5)
    reset()


def scenario_offline_sync() -> None:
    print("Stop the cloud web service before continuing. Five local weighments will be simulated.")
    for index in range(5):
        reset()
        update(rfid="DRV00421", p1=True, p2=True)
        target = 48_000 + index * 600
        ramp(0, target, 1.5, jitter=50)
        update(weight_kg=target, scale_status="STABLE")
        time.sleep(4)
        reset()
    print("Restart the cloud web service. The daemon sync worker should reconcile queued records automatically.")


SCENARIOS: dict[str, Callable[[], None]] = {
    "normal": scenario_normal_weighment,
    "unauthorised": scenario_unauthorised_vehicle,
    "overload": scenario_overload,
    "unstable": scenario_unstable_scale,
    "driver-mismatch": scenario_driver_mismatch,
    "offline-sync": scenario_offline_sync,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("scenario", choices=SCENARIOS)
    parser.add_argument("--plate", default=None, help="Vehicle plate to check in and weigh. Only affects 'normal'. If omitted, a random truck is auto-picked from the current arrival queue.")
    parser.add_argument("--daemon-url", default=DAEMON_URL, help=f"Site daemon base URL (default {DAEMON_URL}).")
    parser.add_argument("--web-url", default=WEB_URL, help=f"Cloud web app base URL, used to read the live arrival queue (default {WEB_URL}).")
    parser.add_argument("--api-key", default=API_KEY, help="Site daemon API key (must match SITE_DAEMON_API_KEY on the web container).")
    parser.add_argument("--site", default=SITE_CODE, help=f"Site code (default {SITE_CODE}).")
    args = parser.parse_args()
    if args.scenario == "normal":
        scenario_normal_weighment(args.plate, args.daemon_url, args.web_url, args.api_key, args.site)
    else:
        SCENARIOS[args.scenario]()


if __name__ == "__main__":
    main()

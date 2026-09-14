#!/usr/bin/env python3
"""Automated input scenarios for the hardware simulator.

Start simulator.py and site daemon first, then run one scenario, for example:
    python scenarios.py normal                        # auto-picks a truck from the live queue
    python scenarios.py normal --plate "CD 456 EF MP"  # or force a specific one

The 'normal' scenario is fully hands-off: it auto-detects the site, auto-picks
a truck from the live booking queue, renders/reuses a plate photo and lets the
daemon's real ANPR (OpenCV + EasyOCR) pipeline read it, ramps the weight up
and down automatically, and confirms the driver load-check decision itself.
No manual GUI or curl step is required.
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

try:
    from plate_image import render_plate_image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

HOST = "127.0.0.1"
CONTROL_PORT = 7002
DAEMON_URL = "http://127.0.0.1:8010"
WEB_URL = "http://127.0.0.1:3010"
API_KEY = "3f1fddae9eaa2ce74b118a22b041a70732f1700c6c86430126e380e6189db50d"

# Which hardware-simulator instance update()/ramp()/reset() talk to, and which
# daemon lane check-in/accept target. Set once from CLI args in main() so a
# dual-lane site's two decks can be driven independently in separate runs
# (e.g. --control-port 7012 --lane north vs --control-port 7014 --lane south).
_control_host = HOST
_control_port = CONTROL_PORT
_lane: str | None = None


def update(**values: object) -> None:
    with socket.create_connection((_control_host, _control_port), timeout=3) as sock:
        stream = sock.makefile("rwb")
        stream.write((json.dumps(values) + "\n").encode())
        stream.flush()
        response = json.loads(stream.readline())
        if not response.get("ok"):
            raise RuntimeError(response.get("error", "unknown simulator control error"))


def _post_check_in(payload: dict[str, object], daemon_url: str, timeout: float) -> dict[str, object]:
    if _lane is not None:
        payload = {**payload, "lane": _lane}
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        f"{daemon_url.rstrip('/')}/edge/check-in", data=body,
        headers={"content-type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach site daemon at {daemon_url}: {error}") from error


def check_in_via_anpr(plate: str, daemon_url: str) -> dict[str, object]:
    """Capture the vehicle's registration the way real hardware would: render
    (or reuse) a plate photo and hand the daemon only its file path, so its
    actual OpenCV + EasyOCR pipeline reads the plate itself instead of being
    told the answer. Real OCR is slower than the bypass below, so this uses a
    generous timeout to cover the daemon's built-in ANPR retry loop."""
    image_path = render_plate_image(plate)
    return _post_check_in({"image_path": image_path}, daemon_url, timeout=30)


def check_in(plate: str, daemon_url: str) -> dict[str, object]:
    """Fallback used only if real ANPR (check_in_via_anpr) fails to read the
    rendered plate with sufficient confidence: tell the daemon which vehicle
    is at the gate directly, so an automated run never stalls on OCR flakiness
    even though registration capture was not literally re-verified by OCR."""
    payload: dict[str, object] = {"manual_plate": plate}
    if HAS_PIL:
        payload["image_path"] = render_plate_image(plate)
    return _post_check_in(payload, daemon_url, timeout=5)


def accept_load(daemon_url: str, lane: str | None = None) -> None:
    """Confirm the driver load-check kiosk step (AWAITING_DRIVER_DECISION):
    without this call the daemon holds the exit gate closed and never writes
    a transaction, even though the weight was captured and within limits."""
    body: dict[str, object] = {"decision": "ACCEPT"}
    resolved_lane = lane if lane is not None else _lane
    if resolved_lane is not None:
        body["lane"] = resolved_lane
    request = urllib.request.Request(
        f"{daemon_url.rstrip('/')}/edge/driver-decision", data=json.dumps(body).encode(),
        headers={"content-type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            json.loads(response.read())
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach site daemon at {daemon_url}: {error}") from error


def detect_site(daemon_url: str) -> str:
    """Ask the daemon which site it's actually configured for, rather than
    trusting a constant here that can silently drift out of sync — that
    mismatch is exactly what caused the wrong truck to get checked in when
    the queue was queried for one site but the daemon itself served another."""
    request = urllib.request.Request(f"{daemon_url.rstrip('/')}/health")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read())
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach site daemon at {daemon_url}: {error}") from error
    site_id = body.get("site_id")
    if not site_id:
        raise RuntimeError(f"Site daemon at {daemon_url} did not report a site_id in /health")
    return site_id


def get_queued_bookings(web_url: str, api_key: str, site: str) -> list[dict[str, object]]:
    request = urllib.request.Request(
        f"{web_url.rstrip('/')}/api/bookings/queue?site={site}",
        headers={"x-site-api-key": api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read())
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach cloud API at {web_url}: {error}") from error
    return body.get("data") or []


def get_queued_plates(web_url: str, api_key: str, site: str) -> list[str]:
    bookings = get_queued_bookings(web_url, api_key, site)
    return [str(item["plate"]) for item in bookings]


def next_queued_plate(web_url: str, api_key: str, site: str) -> str:
    """Ask the cloud which vehicles currently have an approved booking in the
    arrival window, and pick the next scheduled one (FIFO)."""
    bookings = get_queued_bookings(web_url, api_key, site)
    if not bookings:
        raise RuntimeError(
            "No approved bookings in the current arrival window — nothing to simulate. "
            "Assign a truck from an Order as Mine Admin or create a booking as Transporter first."
        )
    first = bookings[0]
    plate = str(first["plate"])
    order_info = first.get("orderNumber") or first.get("reference")
    print(f"Auto-selected next truck from the arrival queue: {plate} ({order_info})")
    return plate


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
    site: str | None = None,
) -> None:
    reset()
    if site is None:
        site = detect_site(daemon_url)
        print(f"Auto-detected daemon site: {site}")
    if plate is None:
        plate = next_queued_plate(web_url, api_key, site)
    else:
        print(f"Using explicitly specified truck plate: {plate}")
    if HAS_PIL:
        print("Capturing registration automatically via ANPR (rendering plate photo, running OCR)...")
        result = check_in_via_anpr(plate, daemon_url)
    else:
        print("Pillow (PIL) not installed, bypassing ANPR photo rendering and using direct plate report...")
        result = {}

    if not result.get("authorised"):
        if HAS_PIL:
            print(f"Automatic ANPR check-in for {plate!r} was not authorised ({result.get('reason')}); "
                  f"retrying with a direct plate report so the automated run still completes.")
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
    if gross_target > booking.get("legal_max_gvw_kg", 999999):
        # Prevent the normal scenario from triggering a legal GVW overload
        # if the booking's target tonnage was overly optimistic for this truck.
        gross_target = booking["legal_max_gvw_kg"] - 100
        
    print(f"DEBUG: gross_target={gross_target}")
    
    print("DEBUG: updating RFID...")
    update(rfid=booking["driver_rfid"])
    print("DEBUG: sleep 1...")
    time.sleep(1)
    print("DEBUG: updating p1...")
    update(p1=True)
    time.sleep(0.8)
    print("DEBUG: updating p2...")
    update(p2=True)
    
    print(f"DEBUG: ramping weight to {gross_target}...")
    ramp(0, gross_target, 3, jitter=120)
    
    print("DEBUG: weight stable, sleeping 5...")
    update(weight_kg=gross_target, scale_status="STABLE")
    time.sleep(5)
    
    print("DEBUG: accept_load()...")
    # (the driver load-check kiosk) rather than completing automatically — the
    # exit gate stays closed and no transaction is written until this fires.
    accept_load(daemon_url)
    update(p1=False, p2=False)
    ramp(gross_target, 0, 2)
    reset()


def scenario_normal_all(
    daemon_url: str = DAEMON_URL,
    web_url: str = WEB_URL,
    api_key: str = API_KEY,
    site: str | None = None,
) -> None:
    reset()
    if site is None:
        site = detect_site(daemon_url)
        print(f"Auto-detected daemon site: {site}")
    plates = get_queued_plates(web_url, api_key, site)
    if not plates:
        print("No trucks in the arrival queue.")
        return
    print(f"Found {len(plates)} trucks in the arrival queue. Weighing all of them...")
    for index, plate in enumerate(plates, 1):
        print(f"\n--- Weighing {plate} ({index}/{len(plates)}) ---")
        scenario_normal_weighment(plate=plate, daemon_url=daemon_url, web_url=web_url, api_key=api_key, site=site)
        if index < len(plates):
            time.sleep(3)


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
    "normal-all": scenario_normal_all,
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
    parser.add_argument("--site", default=None, help="Site code. If omitted, auto-detected from the daemon's own /health endpoint so it always matches whatever daemon --daemon-url points at.")
    parser.add_argument("--control-host", default=HOST, help=f"Hardware-simulator control-socket host (default {HOST}). Use to target one lane's simulator on a DUAL_ENTRY_EXIT site.")
    parser.add_argument("--control-port", type=int, default=CONTROL_PORT, help=f"Hardware-simulator control-socket port (default {CONTROL_PORT}). e.g. 7012 for lane A, 7014 for lane B in the dual-lane demo compose profile.")
    parser.add_argument("--lane", default=None, help="Daemon lane id to check in / accept on (e.g. 'north', 'south'). Required for a DUAL_ENTRY_EXIT daemon; omit for a single-lane BIDIRECTIONAL_SINGLE site.")
    args = parser.parse_args()
    global _control_host, _control_port, _lane
    _control_host = args.control_host
    _control_port = args.control_port
    _lane = args.lane
    if args.scenario == "normal":
        scenario_normal_weighment(args.plate, args.daemon_url, args.web_url, args.api_key, args.site)
    elif args.scenario == "normal-all":
        scenario_normal_all(args.daemon_url, args.web_url, args.api_key, args.site)
    else:
        SCENARIOS[args.scenario]()


if __name__ == "__main__":
    main()

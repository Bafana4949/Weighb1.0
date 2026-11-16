# Edge controller deployment

The edge controller is `apps/site-daemon` (version 1.1.0) running on a PC at the site. It drives the lane hardware through the I/O controller, keeps an offline ledger, and synchronises with the cloud. It is required at Fully Automatic, recommended at Semi-Automatic and optional at Manual (`docs/TIERS.md`).

Status: tested end to end against the hardware simulator and a running cloud. **Not physically validated** with real gates, beams, RFID readers, ANPR cameras or a PIC18 board.

## 1. Before you start

| Item | Detail |
|---|---|
| Edge PC | Linux industrial PC or mini PC with Docker (recommended), or Python 3.11 |
| Lane I/O controller | PIC18F45K22 running `apps/firmware-pic18`, on a serial port (default `/dev/ttyUSB0`, 115200) or behind a serial-to-TCP gateway |
| Network | Outbound HTTPS to the cloud (`/api/...`) and MQTT (8883 with TLS) |
| Cloud records | The site exists, has lanes, and its devices are configured in **Hardware → Configuration** |
| Edge key | Issued from the cloud (section 4) |
| MQTT account | Username and password for this site on the production broker (`mosquitto/README.md`) |

## 2. Docker image

```bash
# Core image (no ANPR, no torch)
docker build -t weighbridge-edge:1.1.0 apps/site-daemon

# Image with on-edge plate recognition (torch CPU + EasyOCR + OpenCV)
docker build --build-arg INSTALL_ANPR=true -t weighbridge-edge:1.1.0-anpr apps/site-daemon
```

What the `Dockerfile` does:

- Base `python:3.11-slim`; installs `requirements-core.txt`.
- `INSTALL_ANPR=true` downloads the torch and torchvision CPU wheels with `curl`, checks each against a pinned SHA-256 (up to 8 attempts), then installs `requirements-anpr.txt` (easyocr, opencv-python-headless, numpy). Without it the camera is reported OFFLINE ("ANPR packages ... not installed") and vehicles are checked in by plate through the local API.
- Runs as a non-root system user `edge`, **uid 10001**. `/data` is owned by that user; application files are owned by root.
- Image defaults: `WB_ENV=production`, `WB_CONFIG_PATH=/etc/weighbridge/edge.yaml`, `WB_EDGE_DB_PATH=/data/edge.db`, `EASYOCR_MODULE_PATH=/data/easyocr`.
- `EXPOSE 8000` and a `HEALTHCHECK` every 30 s that requests `http://127.0.0.1:8000/health` (timeout 5 s, start period 30 s, 3 retries). If you change `WB_HTTP_PORT`, the built-in health check no longer matches.
- EasyOCR downloads its model files on first use into `/data/easyocr` unless they are already there, so the first ANPR capture needs internet access or a pre-populated volume.

Run it:

```bash
docker run -d --name weighbridge-edge --restart unless-stopped \
  --env-file /etc/weighbridge/edge.env \
  -v /etc/weighbridge/edge.yaml:/etc/weighbridge/edge.yaml:ro \
  -v weighbridge-edge-data:/data \
  --device /dev/ttyUSB0 \
  --group-add "$(getent group dialout | cut -d: -f3)" \
  -p 127.0.0.1:8000:8000 \
  weighbridge-edge:1.1.0
```

- `--device` passes the serial port in; `--group-add` gives uid 10001 the host's `dialout` group so it can open it. Leave both out when the lane uses TCP mode.
- If you bind-mount a host directory instead of the named volume, make it writable by uid 10001 (`chown 10001 /srv/weighbridge-edge`).
- Keep the edge environment file readable by root only (`chmod 600 /etc/weighbridge/edge.env`).

Running without Docker:

```bash
cd apps/site-daemon
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements-core.txt            # add requirements-anpr.txt for ANPR
WB_CONFIG_PATH=/etc/weighbridge/edge.yaml python daemon.py
```

## 3. Environment variables

Read in `apps/site-daemon/config.py` and `daemon.py`. Secrets are only accepted from the environment.

| Variable | Default | Purpose |
|---|---|---|
| `WB_ENV` | `production` | `production` or `development`. Development relaxes the credential checks. Any other value refuses to start |
| `WB_SITE_API_KEY` | none | Per-site key (`wbe_...`) issued in the cloud. Sent as `x-site-api-key` |
| `WB_CLOUD_API_URL` | none | Cloud API base including `/api`, e.g. `https://weighbridge.example.co.za/api` |
| `WB_MQTT_URL` | none | `mqtt://host:1883` or `mqtts://host:8883`. `mqtts` enables TLS. Credentials in the URL are used if the username/password variables are not set |
| `WB_MQTT_USERNAME` | none | MQTT username (the site's UUID with the production ACL) |
| `WB_MQTT_PASSWORD` | none | MQTT password |
| `WB_MQTT_TLS_CA` | none | CA file for the broker certificate. Setting any of the three TLS variables enables TLS |
| `WB_MQTT_TLS_CERT` | none | Client certificate (mutual TLS, optional) |
| `WB_MQTT_TLS_KEY` | none | Client key (mutual TLS, optional) |
| `WB_LOCAL_API_TOKEN` | none | Token required in `x-edge-token` by every mutating local endpoint. Without it those endpoints return 503 |
| `WB_CONFIG_PATH` | `config.yaml` next to `daemon.py` (`/etc/weighbridge/edge.yaml` in the image) | Site YAML file |
| `WB_EDGE_DB_PATH` | `storage.sqlite_path` (`/data/edge.db` in the image) | SQLite ledger path |
| `WB_ALLOW_SIMULATION` | false | `true`/`1`/`yes`/`on` allows simulated hardware in production. Never set on a live site |
| `WB_HTTP_HOST` | `0.0.0.0` | Local API bind address. On a bare-metal edge set `127.0.0.1` |
| `WB_HTTP_PORT` | `8000` | Local API port |
| `WB_CORS_ORIGINS` | empty | Comma-separated browser origins allowed to call the local API. Empty disables CORS |
| `LOG_LEVEL` | `INFO` | Python log level. Logs are JSON lines; secret-shaped values and `wbe_` keys are redacted |

Example `/etc/weighbridge/edge.env`:

```bash
WB_ENV=production
WB_SITE_API_KEY=wbe_REPLACE_WITH_ISSUED_KEY
WB_CLOUD_API_URL=https://weighbridge.example.co.za/api
WB_MQTT_URL=mqtts://mqtt.example.co.za:8883
WB_MQTT_USERNAME=00000000-0000-0000-0000-000000000000
WB_MQTT_PASSWORD=REPLACE_WITH_BROKER_PASSWORD
WB_MQTT_TLS_CA=/etc/weighbridge/ca.crt
WB_LOCAL_API_TOKEN=REPLACE_WITH_LONG_RANDOM_TOKEN
```

## 4. Per-site key

1. Sign in as the platform super admin.
2. **Hardware → Configuration**, choose the company and site.
3. In the **Edge controller** card press **Issue key** (or **Rotate key**).
4. Copy the key now. It is shown once; the cloud keeps only its SHA-256 hash and a short prefix.
5. Put it in `WB_SITE_API_KEY` on the edge and restart the daemon.

The key works for that one site only. The cloud refuses it if the site is inactive or the company is suspended or archived. Rotating or revoking takes effect immediately. The old shared default `dev-site-key-change-me` is always refused.

## 5. Configuration file

Start from `apps/site-daemon/config.example.yaml`, save it as `/etc/weighbridge/edge.yaml` and fill in the placeholders. The file describes the physical wiring and stays authoritative when the cloud is unreachable. Unknown keys are rejected, and a `runtime:` section is refused (those switches come only from the environment).

Key sections:

| Section | What to set |
|---|---|
| `site` | `id` = the cloud **site code**. `cloud_id` (site UUID) and `organisation_id` are the offline fallback for the MQTT prefix. `topology`: `BIDIRECTIONAL_SINGLE` or `DUAL_ENTRY_EXIT` |
| `transport` / `serial` | Single lane: `mode: serial` with `serial.port` and `serial.baud_rate` (115200), or `mode: tcp` with `tcp_host`/`tcp_port`. `simulated: true` only for the simulator |
| `lanes` | `DUAL_ENTRY_EXIT` only: one entry per lane with `id`, `lane_number` (must match the cloud lane number), transport, and its own `device_keys` |
| `device_keys` | Cloud device key for each role. Set a role to `null` if the site does not have it |
| `weighbridge` | Capacity, stability (20 kg over 3 s), positioning hold (2 s), unstable timeout (60 s), empty-scale threshold (500 kg), empty and loaded vehicle limits |
| `anpr` | `enabled`, `confidence_threshold`, retries, `camera_source` (image path, device index, or a URL OpenCV can open) |
| `gates` | `auto_close_seconds` (8), `max_hold_open_seconds` (300), `telemetry_max_age_seconds` (2), `command_max_age_seconds` (30) |
| `cloud` | Intervals: sync 30 s, heartbeat 30 s, config refresh 300 s; request timeout 8 s; retry base 5 s, max 300 s |
| `storage` | SQLite path, backup directory, backup interval (3600 s), evidence directory |

`cloud.max_offline_hours`, `site.operating_hours` and the `notifications` section are accepted but not used by the daemon today.

### Device keys must match the cloud

Heartbeats report health per device key. The defaults match the built-in templates:

| Role | Default key | Note |
|---|---|---|
| `controller` | `CTRL_MAIN` | |
| `scale` | `SCALE_PRIMARY` | |
| `entry_gate` / `exit_gate` | `GATE_ENTRY` / `GATE_EXIT` | |
| `position_sensor` / `position_sensor_p2` | `BEAM_P1` / `BEAM_P2` | |
| `traffic_light` | `LIGHT_DECK` | |
| `anpr_camera` | `ANPR_ENTRY` | |
| `rfid_reader` | `RFID_ENTRY` | Matches both built-in templates. Sites created earlier with `RFID_DECK` need `rfid_reader: "RFID_DECK"` |
| `printer` | `null` | Set it, plus the lane's `printer_address: host:port`, to have a network printer probed |
| edge itself (`edge.device_key`) | `EDGE_CONTROLLER` | |

Keys the cloud has not registered are left out of heartbeats (logged once). Cloud devices with no matching role (for example `BEAM_GATE_SAFETY`, `KIOSK_DRIVER`, `UPS_MAIN` in the Fully Automatic template) stay **Unknown** on the health page. On a dual-lane site every lane needs distinct keys; a key assigned twice refuses start-up.

### What the edge takes from the cloud

At start-up and every 300 s the edge calls `GET /api/edge/config`: site identity and tier, lanes, devices (including `isSimulated`), and the MQTT topic prefix `tenant/{organisationId}/site/{siteId}`. The last good copy is cached in SQLite and used if the cloud is unreachable at start-up. The edge does not apply per-device settings such as gate timings or ANPR thresholds from the cloud; it uses its YAML values (`docs/HARDWARE_CONFIGURATION.md`, section 7).

## 6. Start-up refusals

The daemon exits with "refusing to start: ..." listing every problem. From `startup_problems()` in `config.py` and `apply_edge_config()` in `daemon.py`:

| Condition | When |
|---|---|
| Retired shared key `dev-site-key-change-me` | Always |
| `WB_SITE_API_KEY` missing | Production |
| `WB_CLOUD_API_URL` (or `cloud.api_url`) missing | Production |
| MQTT broker missing | Production |
| MQTT username or password missing | Production |
| `mqtt.allow_anonymous: true` | Production |
| `WB_LOCAL_API_TOKEN` missing | Production |
| MQTT broker set with no credentials and anonymous not allowed | Development |
| Simulated hardware (a lane marked `simulated`, or an active cloud device flagged simulated) without `WB_ALLOW_SIMULATION=true` | Production |
| A lane in `tcp` mode without `tcp_host`, `serial` mode without a port, or another mode | Always |
| The same device key assigned to two roles or lanes | Always |
| The site key belongs to a different site code than `site.id` | When the cloud answers at start-up |
| `WB_ENV` not `development` or `production`; config file missing or invalid | Always |

If a simulated device appears in the cloud configuration after start-up in production, the daemon puts every lane into MANUAL_MODE (gates closed, lights red) and raises a CRITICAL `SIMULATION_IN_PRODUCTION` alert. While simulation is active every MQTT payload carries `simulated: true` and the heartbeat says so, which the cloud shows on the edge card.

A site on the Manual tier only logs a warning that it is not expected to run an edge.

## 7. Offline behaviour

| Mechanism | Behaviour |
|---|---|
| Local ledger | Every transaction is written to SQLite (`transactions` table) before anything is sent |
| Hash chain | `integrity_hash = SHA-256(canonical JSON of the transaction fields + previous_hash)`; the first link is 64 zeros or the cloud chain head adopted at start-up (`GET /api/transactions/chain-head`) |
| Chain check | On start-up `verify_chain()` recomputes every hash and link; problems raise a CRITICAL `LEDGER_INTEGRITY` alert |
| Sync queue | Transactions go to `POST /api/transactions/reconcile`, incidents to `POST /api/incidents`, every 30 s |
| Idempotency | Each upload carries an `idempotency-key` (the edge transaction id for transactions). A reply that confirms the record already exists is marked synced, so a lost response never causes a duplicate |
| Conflicts | HTTP 409 without a duplicate confirmation (for example `HASH_CHAIN_MISMATCH`) stays queued and raises a CRITICAL `CLOUD_SYNC_FAILURE` incident. It is never discarded |
| Backoff | Failed items wait `min(300, 5 × 2^retries)` seconds with jitter (between half and the full delay). A cycle stops at the first unreachable-cloud error |
| Restart | Items left "syncing" are re-queued at start-up |
| Long outage | A MEDIUM `CLOUD_SYNC_FAILURE` alert after 5 minutes offline with items pending |
| Bookings offline | Plates are looked up in the cloud first, then in the local booking cache (bookings seen in the last 120 minutes) |
| MQTT offline | Up to 1000 messages are buffered in memory and flushed on reconnect |
| Corruption | If SQLite fails `PRAGMA integrity_check`, the file is moved aside (`.corrupt-<time>.db`) and the newest backup restored |
| Backups | Hourly copies `edge-YYYYMMDD-HHMMSS.db` in the backup directory; the newest 48 are kept |

Back up the `/data` volume. Transactions that have not synced exist only on the edge until they reach the cloud.

## 8. Gate and lane safety

### Gate interlock (`gate_safety.py`)

Every gate open, whatever its source (state machine, local API, manual override, MQTT command), goes through one interlock. An open is refused, and the gate stays closed, when:

- the lane is in FAULT or MANUAL_MODE;
- the hardware transport is disconnected;
- no telemetry has been received, or the newest frame is older than `gates.telemetry_max_age_seconds` (2 s);
- the scale reports FAULT;
- **entry gate**: beam P2 is blocked while P1 is clear (something on the deck);
- **exit gate**: exactly one beam is blocked (a vehicle straddling the deck).

After an open, the gate closes automatically after `gates.auto_close_seconds` (8 s), but never while either beam is blocked. If it has been waiting for `max_hold_open_seconds` (300 s) a HIGH `GATE_HELD_OPEN` alert is raised. When the transport drops, pending auto-close timers are cancelled (the edge cannot send commands without a link).

MQTT gate commands on `.../lane/{n}/gate/command` are applied only when the schema is valid, the lane exists, `lane_number` matches the topic, `ts` carries a UTC offset and is within 30 s of now, and `seq` has not been used before on that lane.

### Weighing state machine (`state_machine.py`)

| Situation | What the edge does |
|---|---|
| Vehicle detected (weight above 500 kg or P1 broken) with no booking | VEHICLE_APPROACHING; ANPR runs if available; no match gives `UNAUTHORISED_ACCESS` (HIGH), entry gate closed |
| Booking has no registered driver card, or a different card is read | Entry red, entry gate closed, buzzer on, `DRIVER_MISMATCH` (CRITICAL). Fails closed |
| Card matches on approach | Entry gate opened through the interlock; light turns green only if the open succeeded |
| Both beams held for 2 s | Entry gate closed, light red, STABILISING |
| Vehicle leaves the beams while stabilising | Back to POSITIONING; window cleared |
| Weight stable (spread at most 20 kg over 3 s, above 500 kg) | Gross captured as the window mean rounded to 20 kg |
| Not stable within 60 s, or scale reports FAULT | Both gates closed, both lights red, FAULT, `SCALE_FAULT` |
| Overload (net above target plus 5 %, gross above the booking's legal GVW, or above capacity), empty pass at or above 18,500 kg, or loaded pass above 70,000 kg | Transaction recorded with flags, exit gate kept closed and red, buzzer on, HIGH alert(s). An operator decides |
| Within limits | AWAITING_DRIVER_DECISION. Driver **Accept** (kiosk) records the transaction and opens the exit through the interlock; if refused, the transaction stands and a `GATE_INTERLOCK` alert asks an operator to release it. Driver **Reload** reopens the entry gate |
| Lane clear after completion | Exit gate closed, light red, IDLE |
| Unexpected error while processing a frame | Close everything, FAULT, `SYSTEM_FAULT` |
| Hardware link lost for `serial.manual_mode_after_seconds` (30 s) | MANUAL_MODE, close commands attempted, HIGH `SENSOR_FAULT` |
| Restart with a lane mid-weighment | HIGH `POWER_RECOVERY` alert listing the incomplete sessions |

FAULT and MANUAL_MODE are sticky: telemetry does not move the lane on until an operator resets it.

Hardware limits to be aware of: the PIC18 firmware boots with gates closed and lights red, but has no communication watchdog. If the edge stops talking while a gate relay is energised, the firmware does not close it by itself. Hard-wired safety interlocks (safety beams, limit switches, emergency stop) must be part of the physical installation.

### Lane reset

After reviewing a FAULT or MANUAL_MODE lane on site:

```bash
curl -X POST http://127.0.0.1:8000/edge/lane-reset \
  -H "content-type: application/json" \
  -H "x-edge-token: $WB_LOCAL_API_TOKEN" \
  -d '{"operator_id":"j.smith","reason":"Scale cable reseated and deck checked clear","lane":"default"}'
```

- `reason` must be at least 10 characters. `lane` is the lane `id` from the YAML (`default` for a single-lane site); if omitted the first lane is used.
- Any other state returns 409. The reset closes both gates, sets both lights red, returns the lane to IDLE and raises a MEDIUM `LANE_RESET` alert (stored, published and synced as an incident).
- There is no cloud screen for lane reset; it is run on the edge PC.

## 9. Local API

| Method and path | Token | Purpose |
|---|---|---|
| `GET /health` | No | Status, site, tier, environment, simulated flag, connections, pending sync, per-lane state |
| `GET /edge/live?lane=` | No | Live telemetry, gates, booking, pending driver decision |
| `GET /edge/lanes` | No | Configured lanes |
| `GET /edge/transactions?limit=` | No | Recent local transactions (up to 100) |
| `POST /edge/check-in` | Yes | Check a vehicle in by `manual_plate`, or run ANPR on an image |
| `POST /edge/command` | Yes | Gate, light or buzzer command (through the interlock) |
| `POST /edge/manual-override` | Yes | Same, with `operator_id` and a reason of at least 10 characters; raises `MANUAL_OVERRIDE` |
| `POST /edge/driver-decision` | Yes | `ACCEPT` or `RELOAD` |
| `POST /edge/lane-reset` | Yes | See above |

The read endpoints have no token and include transaction data. Bind the API to loopback (`WB_HTTP_HOST=127.0.0.1`, or `-p 127.0.0.1:8000:8000` in Docker). If a co-located web server must reach it over the LAN (`SITE_DAEMON_URL`), restrict the port with a host firewall to that server only.

## 10. Commissioning checklist

1. `docker logs weighbridge-edge` shows the edge config line: site code, tier, lanes and device count.
2. **Hardware → Configuration**: edge card shows Online, the expected version, MQTT Connected, and no "SIMULATED" note.
3. **Hardware → Health**: controller, scale, beams, lights, gates and reader show Online; ANPR shows Offline unless the ANPR image is installed with a camera source.
4. `curl http://127.0.0.1:8000/health` returns `"environment": "production"`, `"simulated": false`, `serial_connected: true`.
5. With the deck empty, break and restore each beam and confirm the lane state and health readings change.
6. Test gate interlocks with a test vehicle before live use. Physical behaviour has not been validated by the vendor for this release.

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Exits with "refusing to start" | A production check failed | Read the listed problems; set the missing variables (section 6) |
| "the site API key belongs to site X" | Key issued for another site, or `site.id` wrong | Set `site.id` to the cloud site code, or issue a key for the right site |
| Log: "Cloud rejected the site API key (HTTP 401)" | Key rotated or revoked, site inactive, company suspended | Issue a new key; check the site is active |
| Log: "refusing to drive simulated hardware" | `simulated: true` in YAML or a cloud device flagged simulated | Clear the flag; use `WB_ALLOW_SIMULATION=true` only for test rigs |
| MQTT "refused the connection" | Wrong credentials, anonymous not allowed, ACL | Check username = site UUID and password in the broker's password file; check TLS CA |
| "MQTT topic prefix unknown" | Cloud unreachable at start and `site.cloud_id`/`organisation_id` not set | Restore cloud access, or fill both values in the YAML |
| Serial "Permission denied" | Container user cannot open the port | Add `--group-add` with the host `dialout` gid; check the device path |
| Lane stuck in MANUAL_MODE | Hardware link lost for 30 s, or simulation halt | Fix the link, then lane reset |
| 409 sync conflicts and CRITICAL alerts | Local chain diverged from the cloud (for example after a cloud reseed) | Do not delete the database by hand. Contact support with the alert details |
| Health shows a device Unknown | Its key is not in `device_keys`, or it is not reported by the edge | Map the key, or accept Unknown for record-only devices |
| `/edge/command` returns 503 | `WB_LOCAL_API_TOKEN` not set | Set it and restart |

# Troubleshooting

Symptom, cause and fix for the problems seen most often. Messages in quotes are the exact text the system shows or logs. For edge-specific detail see `docs/EDGE_DEPLOYMENT.md`, section 11.

## 1. Scale not reading (operator console, Web Serial)

| Symptom | Cause | Fix |
|---|---|---|
| "This browser has no Web Serial support (use Chrome or Edge on the weighbridge PC)." | Firefox, Safari, or an embedded browser | Use Chrome or Edge on the PC the indicator is plugged into |
| Auto-Detect finds nothing; "This browser has no access to any COM port" | The browser only exposes ports a user has approved in its port picker | Press **Auto-Detect Scale** or **Manual Connect** once and choose the port. To skip the picker permanently, an administrator runs `scripts/enable-scale-serial-policy.ps1` (below) |
| Port picker lists nothing | USB-serial driver missing, cable unplugged, or the page is not a secure context | Install the adapter's driver (an FTDI driver is in `ftdi_driver/`); check Device Manager for the COM port. Web Serial requires HTTPS or `http://localhost` |
| "Could not open the port: ... Close the operator console tab if it holds the port." | Another tab or program has the port open (only one can) | Close other console tabs and serial tools, then retry |
| "No data in 3 s at 9600 baud. Check the cable and that the indicator is in continuous output mode." | Indicator not transmitting, wrong cable (straight vs null-modem), wrong port | Set the indicator to continuous output; check TX/RX wiring; try the other COM port |
| "Data received but no weight could be parsed. Check baud/parity and protocol." | Baud, data bits or parity wrong (characters arrive garbled) | Use Auto-Detect, or set the indicator's values. Mettler Toledo continuous output is commonly 9600 7-E-1. Diagnostic scripts `scripts/scan-baud.ps1` and `scripts/test-indicator-framing.ps1` try combinations (they are hard-coded to COM4; edit the port first) |
| Gauge freezes, "SIGNAL LOST (>2.5s) — CHECK INDICATOR CABLE" | No frame for 2.5 s: cable pulled, indicator off, or output mode changed | Reseat the cable; the console reconnects automatically when the port returns |
| Weight shows, but the server says the weight is typed | The submitted value differs from the last value captured from the indicator | Capture from the live reading, or give a reason (section 8) |

### Allow all COM ports for the weighbridge app (Chrome and Edge policy)

Run in an elevated PowerShell on the weighbridge PC:

```powershell
.\scripts\enable-scale-serial-policy.ps1                                   # default origin http://localhost:3010
.\scripts\enable-scale-serial-policy.ps1 -Origins "https://weighbridge.example.co.za"
.\scripts\enable-scale-serial-policy.ps1 -Remove                           # undo
```

It sets the `SerialAllowAllPortsForUrls` policy for Chrome and Edge. Restart the browser and confirm at `chrome://policy` or `edge://policy`. Origins must match exactly (scheme, host and port).

## 2. NFC card scanning

| Symptom | Cause | Fix |
|---|---|---|
| "Can't reach the card-scanner bridge. Start it with `npm run nfc-bridge`, or type the UID in manually." | The bridge is not running, or the web server cannot reach it | On the PC with the reader: `npm run nfc-bridge:setup` once, then `npm run nfc-bridge`. The web **server** forwards to `NFC_BRIDGE_URL` (default `http://127.0.0.1:7777`), so the bridge must run on the same machine as the web server, or `NFC_BRIDGE_URL` must point to it. A cloud-hosted web server cannot reach a bridge on an operator PC |
| "NFC reader not detected. Check that it's plugged in." | Bridge running, reader unplugged or not recognised | Replug; run `npm run nfc-bridge:probe` to see raw frames. Only the supported HID reader (VID 0483, PID 4343) and 13.56 MHz cards are read; 125 kHz cards are not decoded |
| "Your session expired — sign in again to scan cards." | Session ended | Sign in again |
| Times out with no card | Card not held on the reader long enough, or unsupported card | Hold the card flat for a second; see `docs/NFC_SCANNER_SETUP.md` |

## 3. Device shows Unknown or Offline

| Symptom | Cause | Fix |
|---|---|---|
| **Unknown** | No report has ever been received for this device | Edge-driven devices: check the edge is running and its `device_keys` contain this exact device key. Web Serial scale: open the operator console and connect the scale. Devices nothing reports on (NFC reader on the bridge, UPS, kiosk, network devices, gate safety beam) stay Unknown by design |
| Edge log: "Not reporting device keys the cloud has not registered" | Edge mapping uses a key that does not exist in the cloud | Make the cloud device key and the edge `device_keys` value identical (for example the Semi-Automatic template's `RFID_DECK`) |
| **Offline** | No report within three expected heartbeats (90 s by default), or the last report was OFFLINE | Check the edge (Hardware → Health shows the edge's last heartbeat). For a Web Serial scale, the console tab must stay open and visible |
| Several lane devices Offline together, controller Offline | The I/O controller link is down; devices behind it follow its state | Check the serial cable or TCP gateway; check the edge log for "Hardware transport unavailable" |
| Devices **Warning** | Telemetry stale (older than 2 s) but link up, or ANPR errors | Check the controller is sending frames; check the camera source |
| ANPR camera Offline | Image built without `INSTALL_ANPR=true`, `anpr.enabled: false`, or no `camera_source` | Rebuild with ANPR, or accept manual plate check-in |
| Device shows **Maintenance** | Maintenance ticked in the hardware centre | Untick it when the repair is complete |

## 4. Edge key rejected (HTTP 401)

| Symptom | Cause | Fix |
|---|---|---|
| Edge log: "Cloud rejected the site API key (HTTP 401); check WB_SITE_API_KEY"; API answers "Valid site API key required" or "Invalid site API key" | Key mistyped, rotated or revoked; site deactivated; company suspended or archived | Issue a new key in **Hardware → Configuration → Edge controller**, set `WB_SITE_API_KEY`, restart the edge. Check the site is active and the company is active |
| Legacy edge still sending `SITE_DAEMON_API_KEY` | The cloud accepts the shared key only with `ALLOW_LEGACY_SITE_KEY=true`, and never on `/api/edge/config` or `/api/edge/heartbeat` | Re-key the edge with a per-site key |
| Heartbeat answers 429 "Heartbeat rate exceeded" | More than 20 heartbeats per minute from one site (for example two edges sharing a key) | Make sure only one daemon uses each site's key |

## 5. Edge refuses to start

The log line starts "refusing to start:" and lists every problem.

| Message contains | Fix |
|---|---|
| "WB_SITE_API_KEY is required in production" | Set the per-site key |
| "WB_CLOUD_API_URL (or cloud.api_url) is required in production" | Set it, including `/api` |
| "WB_MQTT_URL (or mqtt.broker) is required in production" | Set the broker URL |
| "MQTT credentials (WB_MQTT_USERNAME / WB_MQTT_PASSWORD) are required in production" | Set both |
| "WB_LOCAL_API_TOKEN is required in production" | Set a long random token |
| "the shared default site key is retired" | Replace `dev-site-key-change-me` with a per-site key |
| "the site API key belongs to site X, but this edge is configured for site Y" | Set `site.id` to the cloud site code, or use the right key |
| "tcp mode requires tcp_host" / "serial mode requires serial_port" | Complete the lane transport settings |
| "device key ... is assigned to both ..." | Give each role and lane a distinct device key |
| "`runtime` cannot be set in the config file" | Remove the `runtime:` section; use environment variables |
| "config file not found" | Mount the YAML and point `WB_CONFIG_PATH` at it |
| "WB_ENV must be 'development' or 'production'" | Fix the value |

## 6. Simulated hardware refused

| Symptom | Cause | Fix |
|---|---|---|
| "refusing to drive simulated hardware in production (...); set WB_ALLOW_SIMULATION=true only if this is intentional" | A lane in the YAML has `simulated: true`, or an active cloud device is flagged **Simulated device** | On a live site: clear both flags. On a test rig only: set `WB_ALLOW_SIMULATION=true` |
| Lanes suddenly in MANUAL_MODE, CRITICAL "Simulated hardware in production" | A device was flagged simulated in the cloud after the edge started | Clear the flag in the hardware centre, then reset the lanes (`POST /edge/lane-reset`) |
| Edge card shows "Edge is running with SIMULATED hardware." | The edge reported `simulated: true` in its heartbeat | Expected on test rigs; investigate on a live site |

## 7. MQTT anonymous access refused

| Symptom | Cause | Fix |
|---|---|---|
| "mqtt.allow_anonymous is not permitted in production" | YAML sets `allow_anonymous: true` with `WB_ENV=production` | Remove it; give the edge a username and password |
| "MQTT has no credentials; set WB_MQTT_USERNAME / WB_MQTT_PASSWORD or mqtt.allow_anonymous: true (development only)" | Development edge pointed at a broker with no credentials configured | Set credentials, or allow anonymous for local development only |
| Edge log "MQTT broker ... refused the connection" | Production broker (`allow_anonymous false`) rejected the username or password, or ACL/TLS mismatch | Add the edge to the password file (`mosquitto_passwd`, username = site UUID), reload the broker, check `WB_MQTT_TLS_CA` |
| Edge connects but no messages appear for the site | The ACL confines each user to `tenant/+/site/<username>/#`; a username other than the site UUID gets nothing | Use the site UUID as the username |

## 8. "Typed weight — reason required" and related errors

| Message | Cause | Fix |
|---|---|---|
| "Typed weight — reason required" panel in the weighing dialog | Semi-Automatic or Fully Automatic site, and the weight differs from the indicator reading the console captured | Re-capture from the indicator, or enter a reason (a quick reason can be clicked) |
| "This site reads weights from the indicator. Give a reason (at least 5 characters) to enter a weight by hand." (HTTP 422) | Reason missing or shorter than 5 characters | Enter a fuller reason |
| "Typed weights at a fully automatic site need a supervisor (transaction.override permission)." (HTTP 422) | Fully Automatic site; the user lacks `transaction.override` | A supervisor (built-in SUPERVISOR role, or an ADMIN) records the weight, or fix the indicator |
| A `MANUAL_OVERRIDE` incident appears after a weighment | Expected: every typed weight at Semi/Full is raised for review | Review and resolve it on the Incidents screen |

## 9. Site cannot be activated

| Message | Fix |
|---|---|
| "Add at least one weighbridge lane before activating" (422) | Add a lane |
| "The company is not active" (409) | Activate the company first |
| "Not ready: Company licence permits up to ...; site is set to ..." | Raise the licence (super admin, `PUT /api/admin/companies/{id}`) or lower the site tier |
| "Not ready: Fully Automatic sites require ... hardware." (or Semi-Automatic) | Add and enable a device of the required type in the hardware centre; applying the matching template is the quickest way |
| Tier save refused: "Company licence permits up to ..." | Same as the licence blocker |

Warnings (amber) do not block activation.

## 10. PostgreSQL port binding on Windows

| Symptom | Cause | Fix |
|---|---|---|
| `docker compose up` fails to publish the postgres port ("ports are not available", "access a socket in a way forbidden by its access permissions") | Hyper-V / WinNAT reserves dynamic port ranges that include the chosen port | Run `netsh interface ipv4 show excludedportrange protocol=tcp`, pick a free port outside the ranges, set `POSTGRES_HOST_PORT` in `.env` (default 15432), and update `DATABASE_URL`/`DIRECT_URL` for host-side tools |
| Host tools cannot connect but containers work | Host tools use `127.0.0.1:${POSTGRES_HOST_PORT}`; containers use `postgres:5432` | Use the right address for each |

## 11. Migrations out of sync

| Symptom | Cause | Fix |
|---|---|---|
| Web container restarts; log shows `prisma migrate deploy` failing | A migration failed or the history does not match the database | Read the error in `docker compose logs web`. Restore from backup if a migration half-applied; fix and redeploy |
| `migrate deploy` says the database schema is not empty (Prisma P3005) | The database was created with `db push` and has no migration history | Baseline: mark the migrations already reflected in the schema as applied with `prisma migrate resolve --applied <folder>`, then run `migrate deploy`. Back up first |
| `migrate dev` reports drift for order pause/resume or preset weights | Those columns reached the database through `db push` | Migration `20261026090000_capture_db_push_drift` is idempotent and records them; run `migrate deploy` |
| App errors about missing columns such as `licensed_tier` or `operating_tier` | The new migrations were not applied | Run `npm --workspace @weighbridge/database run migrate:deploy` (the web container does this on start) |
| Never | — | Do not run `npm run db:migrate` (`migrate dev`) or `db push` against production |

## 12. Login rate limited

| Symptom | Cause | Fix |
|---|---|---|
| Correct password refused; server log `auth_login_rate_limited` | 10 attempts on one account within 15 minutes, or 50 attempts from one IP within 15 minutes (successes count too) | Wait for the 15-minute window to pass. Counters are held in memory, so restarting the web app also clears them |
| Many users behind one NAT locked out together | They share one source IP for the per-IP limit | Make sure the reverse proxy passes the real client IP in `X-Forwarded-For` (`docs/DEPLOYMENT_GUIDE.md`, section 5) |
| Sign-in fails for every user of one company | Company suspended or archived | The platform super admin reactivates the company |
| Sign-in fails for one user, password known to be right | User suspended or deleted | An administrator reactivates or recreates the user |

## 13. Other

| Symptom | Cause | Fix |
|---|---|---|
| Gate button: "No edge controller you can command is connected to this deployment" | The web server has no `SITE_DAEMON_URL`/`SITE_DAEMON_SITE_CODE`, or the user cannot access that site | Gate commands from the browser work only where the web server is co-located with the site's edge |
| Gate button: "Edge refused the command: ... gate open refused: ..." | The edge interlock refused (beams, stale telemetry, lane in FAULT or MANUAL_MODE) | Clear the cause on site; reset the lane if it is in FAULT |
| `/api/health` returns 503 "database unavailable" | PostgreSQL down or unreachable | Check the database and `DATABASE_URL`; details are in the server log (`health_database_unavailable`) |
| Web app will not start: "AUTH_SECRET is still a placeholder" | Production with a placeholder secret | Generate one with `openssl rand -base64 48` |
| Attachments disappear after a redeploy | Stored on local disk (`ATTACHMENT_STORAGE_PATH`), which is not persistent on serverless hosts or unmounted containers | Mount a persistent volume for the attachment directory, or use option A hosting |

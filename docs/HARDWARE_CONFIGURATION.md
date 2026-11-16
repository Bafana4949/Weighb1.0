# Hardware and site configuration

This guide covers the hardware centre (`/admin/hardware`), device tests, the health dashboard (`/admin/hardware/health`) and the site setup wizard (`/admin/sites/new`).

Who can do what:

| Action | Platform Super Admin | Company Admin / Site Admin |
|---|---|---|
| View hardware configuration for sites in scope | Yes | Yes (read-only banner: "Hardware is configured by the platform administrator") |
| Change tier, workflows, devices; apply templates | Yes | No |
| Issue, rotate or revoke the edge key | Yes | No |
| Run safe device tests | Yes | Yes |
| View hardware health | Yes, all sites | Yes, own sites |
| Create sites with the wizard; activate sites | Yes | No |

Screenshots: [05-hardware-config-fully-automatic.png](screenshots/05-hardware-config-fully-automatic.png), [06-hardware-config-devices.png](screenshots/06-hardware-config-devices.png), [07-hardware-device-editor.png](screenshots/07-hardware-device-editor.png), [08-hardware-config-manual-tier.png](screenshots/08-hardware-config-manual-tier.png), [20-site-admin-hardware-readonly.png](screenshots/20-site-admin-hardware-readonly.png).

## 1. Choosing what to configure

At the top of **Hardware → Configuration** pick:

1. **Company** (disabled when you can see only one company).
2. **Site** (inactive sites are marked "inactive").
3. **Weighbridge / lane**: "All devices", "Site-wide devices" (no lane), or one lane. New devices default to the selected lane.

The page also accepts `?site=<site code or id>`, which is how the wizard and the health page link to it.

## 2. Operating tier card

- Three tier buttons. Tiers above the company licence are disabled and marked "Above company licence".
- Capability tiles show, per capability: Active, Not in this tier, Required — hardware missing, Recommended — no hardware, or Optional.
- Blockers (red) and warnings (amber) come from the readiness check described in `docs/TIERS.md`.
- **Permitted weighing workflows**: Outbound (tare, load, gross), Inbound (gross, unload, tare), Weigh loaded once (stored empty weight), Weigh empty once (store the empty weight). At least one must stay ticked. They are enforced by the server, and Company and Site Admins can also change them under **Sites → View Details → Weighing options**. See `TIERS.md`.
- **Operator rules at this tier** states the typed-weight policy. Requiring a card scan before the first weight at Semi-Automatic sites is modelled (`featureOverrides.requireCardIdentification`) but has no tick box yet, because the operator console does not enforce it; on edge-controlled lanes the edge always checks the driver's card.
- "Installed hardware supports up to ..." appears when the installed devices would support a different tier.
- **Save tier settings** writes the tier, overrides and workflows and records `SITE_TIER_UPDATED` in the audit log. A tier above the licence is refused; missing hardware is not (it blocks activation instead).

## 3. Edge controller card

Shows edge status (Online, Offline, Never connected, Not required), last heartbeat, edge version, pending and failed offline sync, MQTT connection, and the key prefix.

| Button | Effect | Audit action |
|---|---|---|
| Issue key | Creates a `wbe_...` key, stores only its SHA-256 hash and prefix, shows the full key **once** | `EDGE_KEY_ISSUED` |
| Rotate key | Same as issue; the previous key stops working immediately (confirmation prompt) | `EDGE_KEY_ROTATED` |
| Revoke | Clears the key; the site's edge is locked out immediately (confirmation prompt) | `EDGE_KEY_REVOKED` |

Copy the key into the edge controller's `WB_SITE_API_KEY` straight away. It cannot be displayed again; if lost, rotate.

If the edge reports simulated hardware, the card shows "Edge is running with SIMULATED hardware."

## 4. Hardware templates

The template card lists the built-in templates (and any saved ones). It defaults to the template matching the site's tier.

| Template | Tier | Devices created |
|---|---|---|
| Manual weighbridge | Manual | SCALE_PRIMARY (Web Serial, Mettler Toledo continuous, 9600 7-E-1), PRINTER_DESK |
| Standard semi-automatic | Semi-Automatic | EDGE_CONTROLLER, CTRL_MAIN (PIC18F45K22, /dev/ttyUSB0, 115200), SCALE_PRIMARY (via controller), RFID_ENTRY, BEAM_P1, BEAM_P2, LIGHT_DECK, PRINTER_DESK |
| Fully automatic lane | Fully Automatic | The semi set plus ANPR_ENTRY, BEAM_GATE_SAFETY, GATE_ENTRY, GATE_EXIT, KIOSK_DRIVER, PRINTER_KIOSK, UPS_MAIN |

Applying a template **adds missing devices only** (matched by device key). Existing devices and their settings are kept. Devices whose template leaves out a site-specific required field (for example the RFID reader's IP address) are still created; the confirmation message tells you how many need completing.

Saving a site's devices as a reusable template is available through the API only (`POST /api/admin/hardware/profiles` with `name`, `tier`, `fromSiteId`, optional `organisationId`; addresses, COM ports, hostnames and credential references are stripped).

## 5. Devices

Devices are grouped by category (Weighing, Identification, Access & traffic, Sensors, Control, Output, Infrastructure). Tick a device type to add one, or use **Add another**. Each device has:

| Field | Notes |
|---|---|
| Display name | Free text |
| Device key | Capitals, digits and underscores (2–60). Must be unique per site and must match the edge's `device_keys` mapping for edge-driven devices |
| Lane | A lane, or Site-wide |
| Connection | Limited to the connection types the device type supports. A support badge shows "Adapter ready", "Via edge controller" or "Adapter planned" |
| Manufacturer, model, serial number | Optional, for support records |
| Type-specific settings | See section 7 |
| Enabled | Disabled devices do not count towards readiness and show as Disabled |
| Maintenance | See section 9 |
| Simulated device (test/demo only) | See section 10 |

**Remove** deletes a device that has no history; a device with status history is retired (disabled) instead, so the audit trail keeps its reference.

Every create, update, retire and delete is audited (`HARDWARE_DEVICE_CREATED`, `HARDWARE_DEVICE_UPDATED` or `SCALE_CONFIGURATION_UPDATED` for scales, `HARDWARE_DEVICE_RETIRED`, `HARDWARE_DEVICE_DELETED`).

## 6. Connection types and support levels

Reproduced from `CONNECTION_TYPES` in `apps/web/src/lib/hardware-catalog.ts`. "implemented" means a working adapter ships in this repository; "edge" means the site daemon drives it; "planned" means the setting can be recorded but nothing drives the device.

| Connection type | Label | Support | Note |
|---|---|---|---|
| `WEB_SERIAL` | USB/serial via browser (Web Serial) | implemented | Operator console reads the indicator directly. Chrome or Edge only. |
| `SERIAL_RS232` | Serial RS-232 | edge | Read by the edge controller (pyserial). |
| `SERIAL_RS485` | Serial RS-485 | edge | Through an RS-485 converter presenting a serial port. Multi-drop addressing is not implemented. |
| `USB` | USB | implemented | PC/SC NFC readers through the local NFC bridge; USB-serial indicators through Web Serial. |
| `TCP_IP` | TCP/IP (Ethernet / Wi-Fi) | edge | Edge controller opens a TCP socket to the device or serial server. |
| `MQTT` | MQTT | implemented | Device publishes to the site's tenant topic tree. |
| `HTTP_API` | HTTP API | planned | Vendor HTTP integrations need a per-vendor adapter. |
| `RTSP` | RTSP video stream | planned | ANPR currently reads still snapshots; live RTSP decoding is not implemented. |
| `SNAPSHOT` | Snapshot image source | edge | Edge ANPR reads a still image (file or snapshot path) per capture. |
| `MODBUS_TCP` | Modbus TCP | planned | No Modbus adapter yet. Use the PIC/relay controller protocol. |
| `MODBUS_RTU` | Modbus RTU | planned | No Modbus adapter yet. |
| `DIGITAL_IO` | Digital I/O via controller | edge | Input/relay channel on the site I/O controller (PIC18 protocol). |
| `NFC_BRIDGE` | Local NFC bridge | implemented | tools/nfc-bridge on the operator PC, proxied by /api/nfc/uid. |
| `BLUETOOTH` | Bluetooth | planned | No Bluetooth adapter yet. |
| `NETWORK` | Network (monitoring only) | planned | Infrastructure is recorded for documentation; SNMP monitoring is not implemented. |
| `NONE` | Not connected (record only) | implemented | Documented for the site record; no data link. |

Clarifications from the code:

- The "edge" support level means the daemon can talk over that transport to the **I/O controller** using the PIC18 wire protocol (`#WT:...$` / `@CMD:...$`). The daemon has no generic per-device driver for third-party RFID readers, indicators or relay boards; those reach the edge through the I/O controller.
- The `USB` note mentions PC/SC; the bundled bridge actually reads one specific USB HID reader (VID 0483 / PID 4343). See `tools/nfc-bridge/README.md`.
- `MQTT` as a device connection: the platform has no MQTT subscriber, so messages a device publishes are not read by the cloud application.
- The edge reads its physical wiring (serial port, TCP host, lane device keys, ANPR source, gate timings) from its own YAML file. Of the cloud device settings, the edge currently uses: the device list (to filter heartbeat reports), the `isSimulated` flag, lanes, and the site identity. Other per-device settings in the cloud are records for support and are not pushed to the hardware.

## 7. Per-device settings

Connection fields appear only for the matching connection types:

| Field | Shown for | Rules |
|---|---|---|
| IP address / hostname | TCP_IP, HTTP_API, RTSP, MODBUS_TCP | Required; letters, digits, dots and dashes |
| TCP port | Same | Required; 1–65535 |
| URL path | HTTP_API, RTSP | Optional |
| COM port / device path | SERIAL_RS232, SERIAL_RS485, MODBUS_RTU | e.g. COM3 or /dev/ttyUSB0 on the edge |
| Baud rate | Serial types and WEB_SERIAL | Required; 1200–115200 |
| Data bits / parity / stop bits | Serial types and WEB_SERIAL | 7 or 8 / none, even, odd / 1 or 2 |
| Modbus unit ID | MODBUS_TCP, MODBUS_RTU | 0–247 |
| MQTT topic suffix | MQTT | Appended to `tenant/{company}/site/{site}/lane/{lane}/` |
| I/O controller device key, Controller channel | DIGITAL_IO | Both required; channel 0–64 |
| Credential reference | Networked types and MQTT | Name of a secret stored on the edge. Passwords are never stored in the cloud |
| Expected heartbeat (seconds) | All devices | 5–3600; drives the Offline rule (section 11) |

Device-specific settings (from `DEVICE_TYPES`):

| Device type | Settings |
|---|---|
| Scale indicator | Protocol / parser (Mettler Toledo Continuous, MT-SICS, Generic ASCII, Avery Weigh-Tronix via generic ASCII, Rice Lake IQ via generic ASCII, Edge I/O controller telemetry); unit (kg, t); require stable weight; zero threshold; minimum weighable; maximum capacity; polling interval; signal-lost timeout; decimal precision |
| RFID reader | Technology (UHF, HF 13.56 MHz, LF 125 kHz); position (Entry, Deck, Exit); reader ID |
| NFC reader | Position (Operator desk, Entry, Deck, Exit, Kiosk); reader ID |
| QR scanner | Input mode (keyboard wedge, serial) |
| ANPR camera | Direction; recognition engine (EasyOCR on edge; camera on-board is planned); confidence threshold 0.3–1; plate format (South Africa, any); capture timeout; image retention days (0 = keep plate text only) |
| CCTV camera | View (deck, entry, exit, cab, load); image retention days |
| Entry / exit boom gate | Open pulse (ms); auto-close after (seconds, required); open confirmation timeout; safety beam device key; on controller fault (stay closed, or open for evacuation); manual override allowed for (supervisors/admins, or operators) |
| Traffic light | Red, amber, green channels; default / fault state (red only) |
| Positioning beam / sensor | Role (P1 front, P2 rear, entry loop, exit loop, deck occupancy, obstruction, gate safety); active low; debounce |
| I/O controller | Controller type (PIC18F45K22 WB protocol v1; PLC planned; relay board planned); watchdog seconds |
| Printer | Printer type (standard browser PDF print; thermal ESC/POS planned); paper width (58, 80, 210 mm); copies |
| Edge controller | Hostname; hardware (industrial PC, mini PC, Raspberry Pi, VM) |
| Touchscreen kiosk | Mode (driver self-service, operator) |
| Network device | Role (switch, router, firewall, access point, LTE backup); management IP |
| UPS | Capacity (VA); runtime at load (minutes) |
| Buzzer / siren | None |
| Other device | Notes; any connection type |

The edge applies each gate's **auto-close seconds** from the cloud configuration. Settings recorded in the cloud but **not enforced by the edge or firmware today**: gate open pulse, open confirmation timeout, safety beam key, fault behaviour and manual-override role; controller watchdog seconds; ANPR confidence threshold, plate format, capture timeout and retention. The edge uses its own YAML values (`gates.*`, `anpr.*`).

The API validates every save against the catalogue: unknown keys are dropped, required fields are checked, and a connection type the device does not support is refused.

## 8. Safe device tests

Every saved device shows **Check configuration & status**. Scales on Web Serial and NFC readers on the NFC bridge also show a live read button. All tests are read-only: they never move gates, never write to the indicator, and never create transactions. Each test result is stored on the device (`lastTestedAt`, `lastTestResult`) and audited as `HARDWARE_TEST`.

| Test | What it does | Pass condition |
|---|---|---|
| Check configuration & status | Validates settings against the catalogue; flags planned adapters, simulated devices, and protocols parsed by the generic parser; reports the live status from the last heartbeat | No validation errors. A planned adapter or simulated device gives "warn" |
| Test scale (live read) | Opens the chosen COM port in the browser at the configured baud and framing (8-N-1, 7-E-1 or 7-O-1), listens for 3 seconds, closes the port | At least one weight parsed from the indicator's continuous output |
| Test read (tap a card) | Polls `/api/nfc/uid` for up to 15 seconds | A card UID is returned |

The overall result is "pass" only when the configuration check passes and a live read passed; without a live read the result is at most "warn". `physicallyValidated` is set true only by a passing live read.

If the scale test reports that the port is busy, close the operator console tab that holds the port and try again.

## 9. Maintenance mode

Tick **Maintenance** on a device when it is being repaired. Effects in the code:

- Health pages show the device as **Maintenance** instead of Offline or Error.
- The device does not count as working hardware for capability resolution. If it was the only device for a required capability, the tier card shows a warning (not a blocker) because the device is still configured.
- The edge daemon receives the flag in its configuration but does not act on it today.

## 10. Simulated devices

Tick **Simulated device (test/demo only)** for a device that is backed by the hardware simulator. Effects:

- The device shows a "Simulated" badge everywhere.
- The configuration check warns that the edge will refuse it in production.
- A production edge (`WB_ENV=production`) refuses to start, or halts into MANUAL_MODE if one appears later, unless `WB_ALLOW_SIMULATION=true`. See `docs/EDGE_DEPLOYMENT.md`.

Never leave the flag set on a live site.

## 11. Hardware health dashboard

`/admin/hardware/health` lists every **active** site in scope, refreshes every 15 seconds and shows totals: sites monitored, devices online, offline or error, warnings, edges offline, pending offline sync. Screenshots: [09-hardware-health.png](screenshots/09-hardware-health.png), [18-hardware-health-company.png](screenshots/18-hardware-health-company.png), [26-tablet-hardware-health.png](screenshots/26-tablet-hardware-health.png).

Device states (`deriveDeviceStatus` in `lib/hardware-health.ts`), checked in this order:

| State | Condition |
|---|---|
| Disabled | Device not enabled |
| Maintenance | Maintenance ticked |
| Unknown | No report has ever been received |
| Offline | Last report is older than the stale limit, or the last report said OFFLINE |
| Online | Last report ONLINE |
| Warning | Last report DEGRADED |
| Error | Last report FAULT |

The stale limit is **three missed heartbeats**: `max(heartbeatSeconds × 3, 60)` seconds, where `heartbeatSeconds` is the device's "Expected heartbeat" setting or 30 by default. With the default that is 90 seconds.

Edge status per site:

| State | Condition |
|---|---|
| Not required / Not used / Key not issued | No edge key issued (shows "Key not issued" if an Edge controller device is configured) |
| Never connected | Key issued, no heartbeat yet |
| Online | Last heartbeat within 90 seconds |
| Offline | Last heartbeat older than 90 seconds, or a heartbeat was seen and the key was later revoked |

Where reports come from:

- **Edge heartbeat** (`POST /api/edge/heartbeat`, every 30 s): the edge reports itself and every device key in its `device_keys` mapping that the cloud has registered. Devices behind the I/O controller follow the controller link: if the link is down they are reported OFFLINE; if telemetry is stale, DEGRADED. The ANPR camera is reported OFFLINE when the ANPR packages are not installed or no camera source is set.
- **Operator console** (`POST /api/sites/{id}/hardware/status`, every 30 s while the console tab is visible): reports the SCALE on Web Serial as Online, Warning (signal lost) or Offline (not connected). The endpoint also accepts NFC reader reports, but the console does not send them today, so an NFC reader on the bridge stays Unknown.
- Every device not covered by either source stays **Unknown**. A closed or hidden console tab stops scale reports, and the scale turns Offline after the stale limit. A health row changes only when the state changes (`hardware_status` history), while `lastSeenAt` updates on every report.

The site card also shows open hardware incidents (sensor fault, scale fault, ANPR failure, cloud sync failure).

## 12. Site setup wizard

`/admin/sites/new` (platform super admin). Screenshots: [10-site-wizard-company.png](screenshots/10-site-wizard-company.png), [11-site-wizard-tier.png](screenshots/11-site-wizard-tier.png).

| Step | What you enter | Checks |
|---|---|---|
| 1. Company | The owning company; shows its licence | A company must be chosen |
| 2. Site | Name, code, type, address, latitude, longitude | Code 2–20 letters, digits or dashes, unique; coordinates in range |
| 3. Tier | Operating tier | Cannot exceed the company licence |
| 4. Weighbridges | Layout (single bidirectional, or separate entry/exit), number of lanes (1–8), opening and closing times | With the entry/exit layout, lanes alternate Entry and Exit |
| 5. Hardware | A built-in template at or below the chosen tier, or none | |
| 6. Workflows | Permitted weighing workflows | At least one |
| 7. Review | Summary | |

**Create** makes the site **inactive** with its lanes, configuration and template devices in one step, and records `SITE_CREATED`. The result page shows a checklist (template applied, device addresses filled in and tested, products, users and site access, roles) with links.

### Activation readiness check

**Validate & activate site** calls `POST /api/admin/sites/{id}/activate`. It succeeds only when the company is active, the site has at least one lane, and the tier readiness check has no blockers. Otherwise the message lists each blocker (for example "Not ready: Fully Automatic sites require edge controller (offline operation) hardware."). Fix the blockers in the hardware centre and try again. Successful activation is audited as `SITE_ACTIVATED`.

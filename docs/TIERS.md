# Operating tiers

One platform, three commercial tiers. A tier never changes the software that is installed; it decides which capabilities a site may use. The rules live in `apps/web/src/lib/tiers.ts` and are evaluated by `resolveSiteCapabilities()`.

| Tier | Code value | Summary (from `TIER_SUMMARY`) |
|---|---|---|
| Manual | `MANUAL` | Operator-driven weighing with minimal hardware. Indicator integration optional. |
| Semi-Automatic | `SEMI_AUTOMATIC` | Automatic scale reading and card identification with operator confirmation. |
| Fully Automatic | `FULLY_AUTOMATIC` | Unattended flow: identification, positioning, gates and lights automated; exceptions routed to an operator. |

## 1. How a site's capabilities are decided

```
effective tier         = lower of (site operatingTier, company licensedTier)
capability enabled     = available at the effective tier
                         AND at least one matching device is active and not in maintenance
                         AND not switched off in the site's featureOverrides.disabled list
```

- `Organisation.licensedTier` is the licence cap. A site set above the licence gets a blocker, and its effective tier is clamped to the licence.
- `Site.operatingTier` is chosen per site in the hardware centre or the site wizard.
- `Site.featureOverrides` holds `disabled` (capabilities turned off even though hardware exists, for example a gate under repair) and `requireCardIdentification` (Semi-Automatic only).

## 2. Capability matrix

Generated from the `CAPABILITIES` object. Meaning of each value:

- **unavailable**: cannot be enabled at this tier. Installed hardware of this type produces a warning ("installed but not used").
- **optional**: used if the hardware is installed.
- **included**: used whenever the hardware is present; recommended. Missing hardware produces a warning.
- **required**: the site cannot be activated without this hardware configured.

| Capability (key) | Satisfied by device type | Manual | Semi-Automatic | Fully Automatic |
|---|---|---|---|---|
| Automatic scale reading (`indicatorIntegration`) | SCALE | optional | required | required |
| RFID / NFC identification (`cardIdentification`) | RFID_READER or NFC_READER | optional | included | required |
| QR identification (`qrIdentification`) | QR_SCANNER | optional | optional | optional |
| ANPR (`anpr`) | ANPR_CAMERA | unavailable | optional | included |
| Positioning validation (`positioningValidation`) | POSITION_SENSOR | optional | included | required |
| Traffic lights (`trafficLights`) | TRAFFIC_LIGHT | optional | included | required |
| Automatic boom gates (`gateAutomation`) | ENTRY_GATE or EXIT_GATE | unavailable | optional | required |
| Edge controller, offline operation (`edgeController`) | EDGE_DAEMON | optional | included | required |
| Driver self-service kiosk (`selfServiceKiosk`) | KIOSK | unavailable | optional | optional |
| CCTV evidence (`cctv`) | CCTV_CAMERA | optional | optional | optional |
| Ticket printing (`ticketPrinting`) | PRINTER | optional | optional | included |

"Satisfied by" means any one active device of the listed types counts. The check is configuration-level: it confirms a device row exists and is enabled, not that the device works.

## 3. Typed weights (manual-entry policy)

`MANUAL_ENTRY_POLICY` decides how a weight typed by an operator (instead of read from the indicator) is treated. It is enforced on the server in `POST /api/transactions/manual` (`weightPolicy` and `manualEntryError` in `lib/site-capabilities.ts`).

| Tier | Policy | What the operator must do to type a weight | What is recorded |
|---|---|---|---|
| Manual | `PRIMARY` | Nothing. Typing is the normal method. | Audit entry with `weightSource` |
| Semi-Automatic | `REASON_REQUIRED` | Give a reason of at least 5 characters. | Audit entry `MANUAL_WEIGHT_OVERRIDE`, plus a `MANUAL_OVERRIDE` incident (severity MEDIUM) for review |
| Fully Automatic | `SUPERVISOR_OVERRIDE` | Give a reason **and** hold the `transaction.override` permission. | Same as Semi-Automatic |

Who holds `transaction.override`: the platform super admin; any ADMIN without custom role assignments (the built-in admin set grants every permission); and users assigned the built-in `SUPERVISOR` role. A plain OPERATOR does not.

How the source is decided: the operator console marks a weight `INDICATOR` when the value submitted equals the value it captured from the indicator over Web Serial, otherwise `MANUAL`. Weights submitted by an edge controller are always treated as `INDICATOR`.

Limitations in the current code:

- The weight source is declared by the browser. The server cannot prove that a browser-submitted weight came from the indicator.
- Constant (preset) weights applied in bulk through **Orders → fast-track** (`POST /api/orders/{id}/fast-track`) do not go through the typed-weight policy at any tier. They are audited (`ORDER_CONSTANT_WEIGHTS_UPDATED` and per-batch entries) but do not raise `MANUAL_OVERRIDE` incidents.

## 4. Card requirement

`requireCardIdentification` is computed as:

| Tier | Card required? |
|---|---|
| Manual | Never |
| Semi-Automatic | Only if the site override `requireCardIdentification` is set **and** a card reader is enabled (no UI toggle yet; not enforced in the operator console) |
| Fully Automatic | Always, when a card reader is enabled |

Enforcement today:

- The value is resolved and shown in the hardware centre and returned by `GET /api/sites/{id}/capabilities`. The operator console and `POST /api/transactions/manual` **do not yet enforce** a card scan before the first weight.
- On automated lanes the edge state machine enforces the driver card itself, independent of tier: the tag read by the I/O controller must match the booking's registered driver card, and a booking without a registered card fails closed (entry gate stays closed, `DRIVER_MISMATCH` incident).

## 5. Permitted weighing workflows

Each site stores `allowedWorkflows` (at least one of `DISPATCH`, `RECEIPT`, `KNOWN_TARE`, `SINGLE`; default `DISPATCH` and `RECEIPT`; the two weigh-once options are off until an administrator enables them). They are edited by the Super Admin (tier card, site wizard) and by Company and Site Admins (**Sites → View Details → Weighing options**), and returned by the capabilities API. All four are enforced by the transaction API (a flow that is not enabled returns 422):

| Option | Label | What the operator can do |
|---|---|---|
| `DISPATCH` | Outbound | 1st weigh empty (tare), 2nd weigh loaded (gross) |
| `RECEIPT` | Inbound | 1st weigh loaded (gross), 2nd weigh empty (tare) |
| `KNOWN_TARE` | Weigh loaded once | Weigh the loaded truck once; net = loaded − the truck's stored empty weight; waybill issued immediately |
| `SINGLE` | Weigh empty once | Weigh the empty truck once; its empty weight is stored on the vehicle (audited as `VEHICLE_EMPTY_WEIGHT_CAPTURED`). No transaction is created |

An empty weight above the site's *empty vehicle max* is refused, and typed weights follow the tier's manual-entry policy.

## 6. Licence cap

- `Organisation.licensedTier` defaults to `MANUAL`. The migration `20261026100000_tiers_edge_identity_hardware_center` adds it with that default, so after upgrading, every existing company is licensed for Manual until the platform super admin raises it.
- Only the platform super admin can change it, with `PUT /api/admin/companies/{id}` and body `{"licensedTier": "SEMI_AUTOMATIC"}` (or `FULLY_AUTOMATIC`). The change is audited as `COMPANY_LICENCE_CHANGED`. The Companies screen does not have a licence field yet.
- A downgrade is refused (HTTP 409) while any active site of that company is set above the new licence. Downgrade those sites first.
- The site wizard and the tier card grey out tiers above the licence, and the API refuses to save a site tier above it (HTTP 422).

## 7. Readiness blockers and activation

`resolveSiteCapabilities()` produces these issues:

| Condition | Severity | Message (example) |
|---|---|---|
| Site tier above company licence | blocker | "Company licence permits up to Manual; site is set to Fully Automatic." |
| A **required** capability has no active device of a matching type | blocker | "Fully Automatic sites require automatic boom gates hardware." |
| A required capability's devices are all in maintenance | warning | "Traffic lights hardware is in maintenance; the lane will route to an operator." |
| An **included** capability has no device | warning | "ANPR is recommended at Fully Automatic." |
| Hardware installed for an **unavailable** capability | warning | "ANPR hardware is installed but not used at Manual." |

The maintenance warning text describes intent: the edge daemon does not read the maintenance flag today, so it does not reroute a lane by itself.

`POST /api/admin/sites/{id}/activate` (super admin only) activates a site only when:

1. the company status is `ACTIVE`,
2. the site has at least one lane, and
3. there are no blockers.

Saving a tier is allowed while hardware is missing (so a site can be configured before commissioning); only a licence blocker stops the save.

## 8. Upgrade path

Moving from Manual to Semi-Automatic to Fully Automatic uses the same software. It is a hardware, configuration and licence change:

1. **Licence.** The platform super admin raises the company's `licensedTier` (see section 6).
2. **Hardware.** Install the additional equipment (section 10).
3. **Configuration.** In **Hardware → Configuration** select the site, apply the matching built-in template ("Standard semi-automatic" or "Fully automatic lane"; it adds only missing devices and keeps existing ones), then fill in addresses, ports, COM ports and controller channels.
4. **Edge controller.** Issue the site's edge key and install the site daemon (`docs/EDGE_DEPLOYMENT.md`). Map the daemon's `device_keys` to the cloud device keys (the defaults already match the templates).
5. **Tier.** Change the site's operating tier in the tier card and save.
6. **Readiness.** Clear every blocker shown in the tier card, then activate or keep the site active.

`highestSupportedTier()` shows "Installed hardware supports up to ..." in the tier card as a hint.

## 9. Customer comparison

| | Manual | Semi-Automatic | Fully Automatic |
|---|---|---|---|
| Operator involvement | Operator identifies every vehicle and captures each weight | Operator confirms each weighment; weight read automatically | Unattended in the normal case; operator handles exceptions |
| Scale reading | Typed, or read from the indicator in the browser (Web Serial) | Automatic from the indicator (Web Serial in the console, or through the edge); typing needs a reason | Automatic through the edge; typing needs a reason and a supervisor |
| RFID / NFC | Optional (desk NFC reader to fill card fields) | Recommended; card scan can be made mandatory per site (not yet enforced in the console) | Required; the edge checks the driver card against the booking |
| ANPR | Not available | Optional | Recommended (EasyOCR on the edge, optional image build) |
| Boom gates | Operated by hand; no automation | Optional, driven by the edge | Required, driven by the edge with interlocks |
| Traffic lights | Optional (needs an edge and I/O controller to drive) | Recommended | Required |
| Positioning (P1/P2 beams) | Optional | Recommended | Required before weight capture |
| Edge / offline operation | Optional; without an edge the console needs the cloud connection | Recommended; offline ledger and later sync | Required |
| Reporting | Full platform reports, waybills, audit log | Same | Same |
| Monitoring | Scale health reported by the operator console while it is open | Edge heartbeat and per-device health (plus console scale reports if the scale is on Web Serial) | Edge heartbeat and per-device health |
| Best for | Low-volume sites, a single desk, minimal hardware budget | Medium volume where staff remain at the weighbridge | High-volume lanes run without a permanent operator |
| Relative cost | Low | Medium | High |

Validation note: only the Manual path (Web Serial indicator) has been physically validated. Semi-Automatic and Fully Automatic flows were exercised end to end with the hardware simulator; physical gates, beams, RFID readers, ANPR cameras, I/O controllers and printers are **not physically validated**.

## 10. Hardware requirements matrix

Legend: **Required** = needed for the tier to work or to pass readiness; **Recommended** = expected for good operation; **Optional** = supported if wanted; **Not used** = no role at this tier.

| Hardware | Manual | Semi-Automatic | Fully Automatic | Purpose | Connection |
|---|---|---|---|---|---|
| Scale deck and load cells | Required | Required | Required | Physical weighing | Load cells to junction box to indicator |
| Scale indicator | Required | Required | Required | Converts load-cell signal to a weight the system reads | RS-232 / USB-serial to the operator PC (Web Serial), or to the I/O controller / edge |
| Operator PC or laptop | Required | Required | Recommended | Runs the operator console in Chrome or Edge | Ethernet or Wi-Fi; USB to indicator and NFC reader |
| Industrial PC (edge controller) | Optional | Recommended | Required | Runs `apps/site-daemon`: offline ledger, sync, lane control | Ethernet; serial or TCP to the I/O controller |
| Monitor | Required | Required | Recommended | Operator console display | HDMI / DisplayPort |
| Touchscreen / kiosk | Not used | Optional | Optional | Driver accepts the captured load (`/kiosk`) | Ethernet; browser |
| Network switch | Optional | Required | Required | Connects edge, PCs, cameras, readers | Ethernet |
| Router / firewall | Required | Required | Required | Internet access to the cloud platform and MQTT broker | WAN / Ethernet |
| Wi-Fi / Ethernet | Required | Required | Required | Site LAN; prefer wired Ethernet for the edge | Ethernet / 802.11 |
| UPS | Recommended | Recommended | Recommended (in the built-in template) | Keeps edge, indicator and network up through short outages | Mains; USB/network monitoring is record-only |
| Standard printer | Optional | Optional | Recommended | Waybill PDFs printed from the browser | USB or network, through the OS print dialog |
| Thermal printer | Optional | Optional | Optional | 80 mm slip. The platform produces a plain-text slip download; **ESC/POS printing is not implemented** | USB or network, through the OS |
| NFC reader | Optional | Optional (counts as the card reader) | Optional (desk card issuing) | Reads 13.56 MHz card UIDs at the desk | USB HID through `tools/nfc-bridge` |
| RFID reader | Optional | Recommended | Required | Reads driver or vehicle tags on the lane | ASCII serial into the I/O controller (EUSART2, 9600) |
| Cards / tags | Optional | Recommended | Required | Driver and vehicle identification | n/a |
| ANPR camera | Not used | Optional | Recommended | Number-plate recognition at entry or exit | Still image or OpenCV source read by the edge; live RTSP processing not implemented |
| CCTV camera | Optional | Optional | Optional | Evidence. Recorded in the cloud; the edge saves a scale snapshot only from the ANPR camera source | Snapshot / RTSP (planned) |
| Positioning beams P1/P2 | Optional | Recommended | Required | Confirm the vehicle is fully on the deck before capture | Digital input on the I/O controller |
| Boom gates | Not used | Optional | Required | Control entry to and exit from the deck | Relay output on the I/O controller |
| Traffic lights | Optional | Recommended | Required | Red/green driver guidance | Relay output on the I/O controller |
| I/O controller (PIC18F45K22; PLC planned) | Not used | Recommended | Required | Reads beams and RFID, drives gates, lights and buzzer | RS-232 / USB-serial (115200) or TCP to the edge. PLC and relay-board adapters are planned |
| Serial adapters RS-232 / RS-485 | Optional | Optional | Optional | Needed when the PC or edge has no native port. RS-485 multi-drop is not implemented | USB-serial converter |
| Serial-to-TCP gateway | Optional | Optional | Optional | Lets the edge reach the I/O controller over the LAN (TCP mode) | Ethernet |
| Cabling and enclosures | Required | Required | Required | Signal, power and weather protection | n/a |
| Backup connectivity (LTE) | Recommended | Recommended | Recommended | Keeps cloud sync and remote support available. Most important at Manual sites without an edge, which cannot weigh while the cloud is unreachable | Router failover |

A Semi-Automatic site passes readiness with a scale alone. The built-in "Standard semi-automatic" template adds the edge, I/O controller, deck RFID reader, P1/P2 beams, a deck traffic light and a printer.

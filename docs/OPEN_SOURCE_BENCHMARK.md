# Open-Source Benchmark

Comparison of our Weighbridge and Site Access Control platform ("WeighTruck") against publicly available open-source systems in adjacent domains. Researched via live web search on 2026-07-28. No code was copied from any project listed here — this document records architectural patterns worth adopting and explicit licence constraints, per the project's reuse rules.

## How to read this document

- **Relevant** = the project's architecture or a specific subsystem informed a design decision in this codebase.
- **Reuse compatible** = whether copying source code from that project into ours would be legally safe, given our project has no declared licence of its own (treated conservatively: assume we cannot yet accept AGPL/GPL-derived code without a licensing decision from the project owner).
- Every row is sourced — see [Sources](#sources) for the exact page fetched/searched and date.

## Projects studied

| # | Project | Category | Licence | Maintained? | Reuse compatible with us? |
|---|---|---|---|---|---|
| 1 | [Traccar](https://github.com/traccar/traccar) | Fleet/GPS tracking | Apache-2.0 | Yes, very active | Yes (permissive) |
| 2 | [ThingsBoard](https://github.com/thingsboard/thingsboard) | IoT/MQTT device platform | Apache-2.0 | Yes, very active | Yes (permissive) |
| 3 | [Fleetbase](https://github.com/fleetbase/fleetbase) | Logistics/fleet OS | AGPL-3.0 (commercial licence available) | Yes | **No** — AGPL requires network-use source disclosure; incompatible unless we adopt AGPL ourselves |
| 4 | [ERPNext / Frappe](https://github.com/frappe/erpnext) | Multi-tenant ERP | GPL-3.0 | Yes, very active | **No** — GPL-3.0 is copyleft; ideas only, not code |
| 5 | [OpenALPR](https://github.com/openalpr/openalpr) | ANPR/LPR library | AGPL-3.0 (dual-licensed, commercial available) | Stale (community forks more active than upstream) | **No** — AGPL; architecture/approach only |
| 6 | [Frigate NVR](https://github.com/blakeblackshear/frigate) | NVR + LPR via MQTT | MIT | Yes, very active | Yes (permissive) |
| 7 | [Leosac](https://github.com/leosac/access-control) | Physical access control (embedded Linux) | AGPL-3.0 | Unclear from repo alone | **No** — AGPL |
| 8 | [esp-rfid](https://github.com/esprfid/esp-rfid) | RFID access control (ESP8266) | GPL-3.0 | Moderate | **No** — GPL; architecture only |
| 9 | [osTicket](https://github.com/osticket/osticket) | Service-desk ticketing | GPL-2.0 | Yes | **No** — GPL; workflow patterns only |
| 10 | [Carbone](https://github.com/carboneio/carbone) | Template→PDF/DOCX/XLSX report engine | **Carbone Community Licence (CCL)** — not OSI-standard; explicitly forbids offering the Community Edition as a hosted document-generation service | Yes, active | **Ambiguous/risky** — our platform is itself a hosted SaaS; the CCL's anti-hosting clause makes this a real risk to depend on directly. Documented, not adopted. |
| 11 | [SaaS-Boilerplate (ixartz)](https://github.com/ixartz/SaaS-Boilerplate) | Next.js + Tailwind + shadcn/ui multi-tenant SaaS starter | MIT | Yes, active | Yes (permissive) |
| 12 | [EdgeX Foundry](https://www.edgexfoundry.org/) | Industrial edge/IoT microservices framework | Apache-2.0 | Yes (Linux Foundation project) | Yes (permissive) |

Also reviewed and excluded as not genuinely comparable or too thin to evaluate meaningfully: several student/prototype weighbridge repos found via search (`mulyonost/timbangan`, `Amexatgit/WEIGHBRIDGE-AUTOMATION-SYSTEM`, `Markking99/Weigh-bridge-software`, `IGPython/IGPython-OLD`) — all single-site, single-tenant, no multi-client concept, no offline edge daemon, minimal or no licence declared. `saidsl/weigh_bridge_management` (an ERPNext app for weighbridge) was found but its actual source could not be verified as functionally complete from the listing alone. These are noted for completeness per the research instructions but did not materially influence any design decision.

## Comparison matrix

Scale: ✅ have it and it's solid · 🟡 have it partially/basic · ❌ missing · N/A not applicable to that project's domain

| Capability | WeighTruck (ours) | Traccar | ThingsBoard | Fleetbase | ERPNext | Frigate |
|---|---|---|---|---|---|---|
| Multi-client tenancy | ✅ (Organisation + mineScope + RLS-style scoping in every query) | N/A (single-org GPS platform) | 🟡 (tenant/customer hierarchy, but not our domain) | ✅ | ✅ | N/A |
| Roles & permissions | ✅ (coarse UserRole + granular Role/Permission RBAC, additive) | 🟡 (fixed role set) | ✅ (fine-grained ACLs) | ✅ | ✅ (very mature) | N/A |
| Client onboarding workflow | ✅ (draft→active gating) | N/A | 🟡 | 🟡 | N/A | N/A |
| Weighbridge topology (bidirectional/dual) | ✅ data model; 🟡 daemon only supports one lane live | N/A | N/A | N/A | N/A | N/A |
| Booking/pre-authorisation | ✅ | N/A | N/A | ✅ (dispatch) | ✅ | N/A |
| ANPR | ✅ (edge, OpenCV/OCR) | N/A | N/A | N/A | N/A | ✅ (mature, MIT, active) |
| RFID | ✅ | N/A | N/A | N/A | N/A | N/A |
| Weight stability / overload validation | ✅ | N/A | 🟡 (generic telemetry rules, not domain-specific) | N/A | N/A | N/A |
| Gate/traffic-light control | ✅ (via edge command API) | N/A | ✅ (rule-engine actuation) | N/A | N/A | N/A |
| Offline-first edge operation | ✅ (SQLite, idempotency keys, hash chain, crash-recovery sessions) | 🟡 (client buffers position pings, not full offline workflow) | ✅ (gateway offline buffering) | ❌ | N/A | N/A |
| Cloud reconciliation | ✅ (idempotent, retry+backoff) | ✅ | ✅ | N/A | N/A | N/A |
| Duplicate transaction handling | ✅ (unique idempotency_key, unique hash) | N/A | ✅ | N/A | N/A | N/A |
| Fraud/anomaly detection | ✅ (clone detection, anomaly scoring) | ❌ | 🟡 (generic anomaly rules) | ❌ | N/A | N/A |
| Subcontracted transporters | ✅ (VehicleTransporterAssignment, warn-not-reject) | N/A | N/A | 🟡 (carrier assignment, less granular) | N/A | N/A |
| Service orders / support tickets | ✅ (built this session) | ❌ | ❌ | ❌ | ✅ (via Helpdesk app) | N/A |
| Reports (transaction, ops, incidents) | ✅ (3 types, CSV+PDF) | 🟡 (position/trip reports only) | ✅ (dashboards) | ✅ | ✅ (very mature) | N/A |
| 3-copy ticket/slip printing | ✅ (built this session, audited) | N/A | N/A | N/A | 🟡 (generic print formats) | N/A |
| Audit trail | ✅ (SystemLog on every mutation) | 🟡 | ✅ | 🟡 | ✅ | N/A |
| Hardware monitoring / device registry | ✅ (HardwareDevice/HardwareStatus) | N/A | ✅ (very mature — this is ThingsBoard's core strength) | N/A | N/A | 🟡 |
| Calibration management | ✅ (CalibrationCertificate) | N/A | N/A | N/A | N/A | N/A |
| Notifications | ✅ (dashboard/email/SMS routing table) | ✅ | ✅ (rule-engine driven) | ✅ | ✅ | N/A |
| API security (auth, rate limiting) | 🟡 — strong auth/session/tenant isolation; **no rate limiting anywhere** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Observability (structured logs, health checks) | 🟡 — `/health` endpoints exist; **no structured logging**, ad-hoc `console.log` | ✅ | ✅ (extensive) | 🟡 | 🟡 | ✅ |
| Backup & recovery | 🟡 — SQLite edge backups exist; no documented Postgres backup strategy | N/A | ✅ | 🟡 | 🟡 | N/A |
| Testing | 🟡 — good unit + new integration/tenant-isolation tests; daemon has 1 pre-existing failing test | ✅ (extensive) | ✅ (extensive) | 🟡 | 🟡 | ✅ |
| Deployment | ✅ (Docker Compose, documented) | ✅ | ✅ | ✅ | ✅ | ✅ |

## Patterns worth adopting (architecture only, not code)

1. **ThingsBoard's rule-chain model** for hardware alerting — our `Incident`-on-anomaly pattern is a simpler version of the same idea (event → rule → action); worth keeping simple rather than adopting ThingsBoard's full rule-engine complexity, since our domain (one weighbridge state machine per site) doesn't need it.
2. **Traccar's protocol-adapter pattern** (one small adapter class per device protocol, normalised into a common event shape before reaching business logic) — relevant if we ever need to support more scale/PLC brands beyond the current PIC18 firmware; not urgent now.
3. **Frigate's MQTT event-topic naming convention** (`frigate/events`, `frigate/tracked_object_update`) is close to what we already do (`weighbridge/{site}/...` topics) — no change needed, just confirms our approach is idiomatic for the ecosystem.
4. **EdgeX Foundry's device-service abstraction** (a device service per hardware family, talking a common internal protocol to the core) is architecturally similar to how our site-daemon abstracts serial/TCP telemetry — validates the existing design rather than suggesting a change.
5. **ERPNext/Frappe's permission model** (doctype-level + field-level permissions, roles composable per user) is more granular than what we built this session; we deliberately built a coarser Role→Permission model scoped to ~40 keys rather than per-field ACLs, which is the right tradeoff for our domain size — noted as a deliberate divergence, not a gap.

## Patterns to avoid

1. **Carbone's/Fleetbase's SaaS-hosting-restrictive licences** — a strong argument for never taking a dependency on AGPL/CCL-licensed code for a product we intend to host as a service. This directly shaped the decision to keep waybill/report PDF generation on `@react-pdf/renderer` (MIT, already a dependency) rather than reaching for Carbone.
2. **OpenALPR's abandonment risk** — the upstream repo shows more activity in community forks than the canonical repo, a caution against depending on it for production ANPR; our existing OpenCV/OCR edge pipeline avoids this dependency risk entirely.

## Sources

| Project | Source | Licence confirmed via | Date inspected |
|---|---|---|---|
| Traccar | https://github.com/traccar/traccar | Search result + traccar.org | 2026-07-28 |
| ThingsBoard | https://github.com/thingsboard/thingsboard | WebFetch of repo README | 2026-07-28 |
| Fleetbase | https://github.com/fleetbase/fleetbase, https://fleetbase.io/docs/community/licensing | Search result | 2026-07-28 |
| ERPNext / Frappe | https://github.com/frappe (org), https://docs.frappe.io/erpnext/open-source | Search result | 2026-07-28 |
| OpenALPR | https://github.com/openalpr/openalpr | Search result | 2026-07-28 |
| Frigate | https://github.com/blakeblackshear/frigate, https://docs.frigate.video/configuration/license_plate_recognition/ | Search result | 2026-07-28 |
| Leosac | https://github.com/leosac/access-control | WebFetch of repo README | 2026-07-28 |
| esp-rfid | https://github.com/esprfid/esp-rfid | Search result | 2026-07-28 |
| osTicket | https://github.com/osticket/osticket | Search result | 2026-07-28 |
| Carbone | https://github.com/carboneio/carbone | WebFetch of repo README | 2026-07-28 |
| SaaS-Boilerplate | https://github.com/ixartz/SaaS-Boilerplate | WebFetch of repo README | 2026-07-28 |
| EdgeX Foundry | https://www.edgexfoundry.org/, https://lfedge.org/ | Search result | 2026-07-28 |

**Attribution note:** No source code from any project in this table has been copied into this repository. Where a pattern above influenced an implementation choice, that choice was independently re-implemented against our own schema/stack, never transcribed from the reference project.

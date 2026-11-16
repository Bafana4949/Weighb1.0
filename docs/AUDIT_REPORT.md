# Weighbridge & Access Control Platform: Initial Audit

**Date:** 2026-10-26 · **Baseline commit:** `66fc380` (main) · **Scope:** whole repository, local database, Docker setup

This report records the state of the system **before** the hardening and tier work. Each finding has a severity and a status. "Fixed in this pass" means the fix is in the working tree and covered by tests or verification described in [FINAL_TECHNICAL_REPORT.md](FINAL_TECHNICAL_REPORT.md).

---

## 1. Current architecture

| Layer | What exists today |
|---|---|
| Cloud web | Next.js 15 App Router (`apps/web`), React 19, Tailwind, Radix, ~100 route handlers, NextAuth v5 (JWT, 8 h sessions), Zod validation on most write routes |
| Database | PostgreSQL 16 via Prisma 6 (`packages/database`), 38 tables, 14 migrations. Deployable to Supabase or the bundled `postgres` container |
| Real-time | **Polling only.** The custom Socket.IO server (`apps/web/server.ts`) was deleted in `b3b19c5`; `socket.io` is still a dependency but is unused. `lib/mqtt.ts` publishes but nothing in the web app subscribes |
| Edge | **Missing.** The Python edge daemon, hardware simulator and PIC18 firmware were deleted in `b3b19c5` ("convert to manual system"). `docker-compose.yml` still referenced them, so the `edge` and `edge-dual` profiles could not build |
| Scale | Browser **Web Serial** reader in the operator console (`lib/serial-reader.ts`), with a Mettler Toledo continuous parser, auto-detect across baud and framing, and reconnect. Chrome and Edge only |
| NFC | Uncommitted work: local NFC bridge (`tools/nfc-bridge`) behind a same-origin proxy (`/api/nfc/uid`) |
| Documents | `@react-pdf/renderer` waybills and reports, CSV exports, QR verification page (`/verify/[hash]`) |
| Deployment | Vercel and Supabase (current production path), plus Docker Compose profiles. The web Dockerfile runs `migrate deploy` on start |

## 2. Modules

Companies, sites, lanes, site config, users, roles and permissions (RBAC catalogue), transporters (haulier organisations linked to mining companies), vehicles, trailers, drivers, fleet roster, products, sources, destinations, weighbridge orders (pause and resume, fast-track constant weights), bookings, manual weighing (first weigh, second weigh, direct), waybills, incidents, fraud dashboard, service orders with attachments, reports (tonnage, turnaround, incidents, daily summary, consolidated), raw data, audit log, billing, hardware devices, installations, RFID credentials.

## 3. User roles

| Role | How it is modelled | Gaps found |
|---|---|---|
| Platform Super Admin | `role=ADMIN`, `platformRole=PLATFORM_SUPER_ADMIN`, no organisation | Correctly separated through `isPlatformSuperAdmin` |
| Company Admin | `role=ADMIN` with an organisation | Can promote users to ADMIN through `PUT /admin/users/[id]` |
| Site Admin | **Not implemented.** `UserSiteAccess` rows can be created but are never enforced | Every admin and operator sees every site of their company |
| Operator / Security | `role=OPERATOR` / `SECURITY` | Not restricted to assigned sites |
| Transporter | `role=TRANSPORTER` in a haulier organisation | Can see other transporters' bookings on shared orders |

## 4. Weighbridge workflows

* **Dispatch** (tare first, then gross) and **Receipt** (gross first, then tare), captured as first and second weighments.
* **Direct** single-step capture of both weights.
* **Fast-track** bulk orders that use constant tare or gross weights.
* **Walk-in** weighing that auto-creates a booking from a typed plate.
* Weight comes from the indicator (Web Serial) when it is connected; otherwise the operator types it. There is no record of which source was used, and there is no reason requirement for manual entry.

## 5. Hardware integrations (as found)

| Device | State |
|---|---|
| Scale indicator (Mettler Toledo continuous) | Works through Web Serial in the browser. Physically validated by the team per git history (`8a34771`, `cae7ec2`) |
| NFC (PC/SC USB reader) | Uncommitted local bridge. Any signed-in user, including transporters, could call it |
| ANPR, gates, traffic lights, beams, PIC18 | Code deleted. Device rows can still be created with configuration claiming "MODBUS_TCP" relays that nothing implements |
| Printer | Browser print of the PDF waybill. No ESC/POS driver |

## 6. Database

Good foundations: UUID keys, mapped snake_case names, indexes on the hot paths, a partial unique index preventing two active weighments per booking, an advisory-lock-serialised hash chain, and soft deletion on users, vehicles and drivers.

Gaps:

* **Migration drift (Critical).** The `PAUSED` order status, the four fast-track preset columns, and two default and nullability changes reached databases through `prisma db push` but had no migration. A fresh `migrate deploy`, which the Docker image runs, would build a database the current code crashes against.
* `Trailer` has no `organisationId`, so trailers are global across tenants.
* `SystemLog` has no organisation, role or reason columns, so company-scoped audit views cannot be built honestly.
* `HardwareStatus` is an append-only history with no latest-state column, so every dashboard has to scan it.
* There is no tier, licence or edge identity anywhere in the model.

## 7. Multi-tenancy model

`lib/access.ts` provides fail-closed helpers (`userScope`, `userSiteScope`, `TenantScopeError`), and about two thirds of the routes use them correctly. The remainder either filter by id only, or use fail-open patterns (`if (callerOrg && …)`, `org ? {…} : {}`). Those patterns grant cross-tenant access to any non-super-admin account that has no organisation, and such an account can be created through `POST /admin/users`.

## 8. Deployment model

Vercel with Supabase in production, and Compose for local work. Compose problems found:

* The edge services pointed at deleted directories.
* The default secrets (`development-secret-change-before-production`, `dev-site-key-change-me`) would be used silently if the env file was missing.
* Mosquitto ran with `allow_anonymous true` on `0.0.0.0`.
* pgAdmin had a fixed default password.
* Postgres was published on a fixed host port that collides with Windows Hyper-V reserved ranges.

## 9. Strengths to keep

* The fail-closed tenant helper design and the persona tests (`multi-tenant-personas.test.ts`).
* The hash-chained transactions with advisory-lock serialisation, `getChainHead`, and the reconciliation idempotency.
* The Web Serial scale reader: robust framing auto-detect, reconnect, unload cleanup, and 19 tests.
* South African time handling (`lib/datetime.ts`) applied consistently.
* Structured logger with recursive secret redaction.
* Order lifecycle: pause and resume, automatic cutoff on fulfilment, queue isolation.
* Security headers and CSP in `next.config.mjs`. No debug routes remain.

## 10. Findings

### Critical

| # | Finding | Location | Status |
|---|---|---|---|
| C1 | Fast-track loads any order by id. Any operator can create completed weighments and waybills in another company's chain and mark its order fulfilled | `api/orders/[id]/fast-track` | Fixed in this pass |
| C2 | Migration drift: `PAUSED` and the preset columns are missing from migrations | `packages/database/migrations` | Fixed (idempotent migration `20261026090000`) |
| C3 | Edge daemon, simulator and firmware deleted while compose and the cloud reconcile APIs still expect them | `docker-compose.yml`, `apps/site-daemon` | Fixed (restored and hardened) |

### High

| # | Finding | Location | Status |
|---|---|---|---|
| H1 | `?site=` filter overwrote the tenant filter, so any operator could list another company's bookings | `api/bookings` GET | Fixed |
| H2 | Transaction detail, print history and waybill were unscoped for staff roles | `api/transactions/[id]/*` | Fixed |
| H3 | Booking creation did not check that the site, order, vehicle or driver belongs to the caller | `api/bookings` POST | Fixed |
| H4 | Order update and create accepted foreign keys from other tenants | `api/orders`, `api/orders/[id]` | Fixed |
| H5 | Order assign trusted body ids, force-approved bookings past policy, and was not audited | `api/orders/[id]/assign` | Fixed |
| H6 | Any ADMIN could reconcile into any site's chain. `chain-head` was unscoped | `api/transactions/reconcile`, `chain-head` | Fixed |
| H7 | One global, non-constant-time site API key for every site. A leaked key gives write access to every site | `lib/api.ts requireSiteOrRole` | Fixed (per-site hashed keys) |
| H8 | `requirePermission` granted every permission to users with no role assignments | `lib/api.ts` | Fixed (falls back to the built-in role's permission set) |
| H9 | Walk-in weighing reused any tenant's vehicle by plate, attributed loads to the platform's first haulier, used the first user in the database as creator, and hard-coded "Coal (ROM)" | `api/transactions/manual` | Fixed |
| H10 | Suspended users and suspended companies kept working until their JWT expired (up to 8 h) | `lib/api.ts`, `auth.ts` | Fixed (per-request status check) |
| H11 | MQTT broker anonymous on all interfaces, with flat `weighbridge/{site}` topics and no ACL | `mosquitto/config` | Fixed (production config with ACL and tenant topic tree) |

### Medium

| # | Finding | Status |
|---|---|---|
| M1 | Booking id not checked against the site in manual first weigh and direct capture | Fixed |
| M2 | Incidents could be filed against any site, with unverified linked ids | Fixed |
| M3 | Company admin could promote users to ADMIN, and attach another tenant's custom roles | Fixed |
| M4 | Fail-open org checks in about 20 routes and pages | Fixed in the routes listed in the final report |
| M5 | Driver `idNumberEncrypted` and `idNumberHash` returned through `driver: true` includes | Fixed in API routes |
| M6 | Transporters saw other transporters' bookings on shared orders. `ratePerTonZar` leaked | Fixed |
| M7 | Company admin could delete or suspend a haulier shared with other companies | Fixed (unlink only, unless super admin) |
| M8 | Edge command, driver-decision and live routes had no site binding | Fixed |
| M9 | Site Admin role absent. `UserSiteAccess` stored but not enforced | Fixed (site-restricted access context) |
| M10 | Login logged email addresses with `console.error`. No brute-force limit on sign-in | Fixed |
| M11 | Seed hard-coded and printed the super admin password | Fixed (env-provided or generated once) |
| M12 | No mobile navigation: the sidebar is hidden below `lg` and has no menu button | Fixed |
| M13 | Header showed a hard-coded "Platform online" and dashboards showed hard-coded "Operational" | Fixed (real status or removed) |
| M14 | NFC proxy callable by any signed-in user | Fixed (staff roles only) |

### Low

| # | Finding | Status |
|---|---|---|
| L1 | Service-order attachments had no content-type allowlist, an unsanitised filename and no `nosniff` | Fixed |
| L2 | `/api/health` leaked the database host and error text without auth | Fixed |
| L3 | Password reset ignored user status and left sibling tokens valid | Fixed |
| L4 | Unbounded list queries (vehicles, drivers, trailers, users, orders) | Partly fixed (caps added). Remainder listed in the final report |
| L5 | `socket.io` is an unused dependency. Root clutter: `scratch_*.mjs`, `*.bak-corrupted`, `build_logs.txt` | Documented. Untracked user files left in place |
| L6 | No ESLint config, so `next lint` prompts interactively | Fixed |

### Enhancements (product gaps against the brief)

* No tier model (Manual, Semi-Automatic, Fully Automatic). Added: `OperatingTier` on sites, `licensedTier` on companies, capability matrix in `lib/tiers.ts`.
* No hardware configuration centre beyond create-only device rows. Added: catalogue-driven device configuration, edge key issuing, health dashboard, profiles and a site setup wizard.
* No record of whether a weight came from the indicator or was typed. Added: weight source with a tier-dependent manual-entry policy.
* No hardware health beyond append-only history. Added: denormalised latest state and an edge heartbeat.

## 11. Testing gaps found

61 unit tests passed at baseline. There were no tests for tier behaviour, hardware configuration validation, edge authentication, site-restricted access, the manual-weighment tenant rules, or MQTT topics. The integration test needs a container-only database URL. The Python edge tests were deleted along with the daemon.

## 12. Implementation plan (executed in this order)

1. Critical fixes: migration drift, fast-track scoping, edge restore.
2. Security sweep: per-site edge keys, session revalidation, permission fallback, route-by-route tenant fixes, MQTT ACL.
3. Tier capability model and site-level access (Site Admin).
4. Hardware configuration centre, profiles, health, edge heartbeat and config APIs.
5. Operator flow: weight source and manual-entry policy per tier, allowed workflows.
6. Dashboards: real edge and hardware status, tier distribution.
7. Tests, deployment configuration, documentation, screenshots, presentation.

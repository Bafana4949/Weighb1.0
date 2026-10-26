# Final Technical Report: Platform Hardening, Tiers and Hardware Centre

**Branch:** `platform-hardening-and-tiers` (from `main` at `66fc380`) · **Date:** 2026-10-26
**Companion documents:** [AUDIT_REPORT.md](AUDIT_REPORT.md) (findings before the work) · [TIERS.md](TIERS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

---

## 1. Executive summary

The platform is now one multi-company, multi-site product with three commercial tiers: **Manual**, **Semi-Automatic** and **Fully Automatic**. Each tier is a per-site setting, capped by the company's licence and enforced by the server. The work had three parts:

* **Security.** The work started with an audit (3 critical, 11 high and 14 medium findings). All of them were fixed. They included cross-company access to orders, transactions and bookings, a single shared edge key for every site, and migrations that could not rebuild the live schema.
* **Edge restored.** The Python edge controller, hardware simulator and PIC18 firmware had been deleted earlier. They were restored and hardened, and connected to the cloud through per-site keys, a configuration pull and heartbeats.
* **New capabilities.** A catalogue-driven Hardware & Site Configuration centre, a hardware health dashboard, a site setup wizard, real Site Admin scoping, and tier rules in the operator console.

**Verification:**

* The full stack ran end to end: web app, edge daemon and hardware simulator against a demo database.
* 28 of 28 HTTP persona checks passed.
* One unattended Fully Automatic weighment reconciled into the cloud hash chain.
* Automated tests: **111** web (was 61) and **89** edge (was 13 when restored).
* `next build` passes, ESLint reports 0 errors, and all Docker Compose profiles validate.

**Not physically validated:** gates, beams, lane RFID readers, ANPR cameras, PLCs and printers. They were exercised against the simulator only.

## 2. Original system assessment

See [AUDIT_REPORT.md](AUDIT_REPORT.md). In short:

* The web platform was solid but uneven. Its isolation helpers were fail-closed, but about a third of the routes bypassed them.
* The edge was deleted, while `docker-compose.yml` and the cloud reconcile APIs still assumed it existed.
* There was no tier model.
* Hardware could only be created, never edited or tested, and its configuration claimed adapters (for example Modbus relays) that did not exist.
* `UserSiteAccess` was stored but never enforced.
* Dashboards showed hard-coded statuses such as "Platform online" and "Operational".

## 3. Changes made (commits)

| Commit | Summary |
|---|---|
| `b013753` | Restore site-daemon, hardware simulator and PIC18 firmware verbatim from history |
| `002eb83` | Pre-existing NFC bridge work from the working tree, committed unchanged |
| `a00bd12` | Security sweep: tenant/site isolation, per-site edge keys, per-request session revalidation, permission fallback, login limits, secret scrubbing, migration drift fix, tier/edge/hardware schema |
| `a94f629` | Edge hardening: cloud contract, tenant MQTT topics, gate safety, local token, production refusals, optional ANPR image, 88 tests |
| `7cd647b` | Tier model, hardware centre, health dashboard, setup wizard, edge APIs, operator tier rules, mobile navigation |
| `bf0a4c8` | Fixes found by end-to-end runs (fail-open driver card check on the edge, nullable RFID contract, walk-in tare, site-scoped reports and exports), demo seed, persona checks |
| `88cf304` | Removed the hard-coded commodity and dashboard statuses; product picker; 28 screenshots |
| `3cb99e1` | ESLint with zero errors; seed no longer hard-codes the Super Admin password |
| *(docs)* | Documentation set (this commit) |

In total, 217 files changed: 17,893 lines inserted and 2,231 deleted, including the restored edge (about 4,200 lines) and the lock file.

## 4. Architecture

Cloud (Next.js 15, PostgreSQL 16 via Prisma 6, Mosquitto) → companies → sites → lanes → edge controller (FastAPI, SQLite ledger, sync worker, MQTT, PIC18 I/O protocol) → hardware. A Manual site needs no edge, because the operator console reads the indicator over Web Serial. Gate commands always pass through the edge and its interlocks; the browser never drives a gate. Full detail is in [ARCHITECTURE.md](ARCHITECTURE.md).

New server modules in `apps/web/src/lib`:

| Module | Responsibility |
|---|---|
| `tiers.ts` | Capability matrix, manual-entry policy, readiness, upgrade hint |
| `hardware-catalog.ts` | Device types, connection types with honest support levels, per-type fields, validation |
| `hardware-health.ts` | Online / Offline / Warning / Error / Disabled / Unknown / Maintenance derivation |
| `hardware-service.ts` | Device validation, template application, health recording |
| `hardware-profiles.ts` | Built-in Manual, Semi and Full templates |
| `site-access.ts` | Platform / company / site-restricted access context |
| `edge-auth.ts` | Per-site key generation and hashing, legacy-key policy |
| `site-capabilities.ts` | Effective capabilities and the typed-weight policy |
| `transporter-links.ts`, `order-refs.ts` | Cross-tenant reference checks |

## 5. Security improvements

| Area | Change |
|---|---|
| Sessions | Every API call re-reads the user's status, role and organisation, and the organisation's status. Suspensions take effect immediately. Accounts that have no company and are not super admin are refused, which closes every `org && …` fail-open at its root |
| Permissions | Users with no custom roles get their base role's permission set, never "allow all" |
| Sign-in | Limits per account (10 per 15 min) and per IP (50). No email addresses in logs. Suspended companies refused. LOGIN audited |
| Isolation | About 20 routes fixed (see the audit). Bookings `?site=` can no longer replace the tenant filter. Fast-track, orders, assign, incidents, transactions, waybills, reconcile, chain-head and manual weighing are all scoped |
| Administrators | Only the Super Admin creates or changes Administrators. A Site Admin cannot manage users or widen their own access |
| Edge identity | Per-site `wbe_` keys, SHA-256 stored, shown once, rotate and revoke. The legacy shared key is accepted only with `ALLOW_LEGACY_SITE_KEY=true` and never a placeholder |
| Responses | `passwordHash`, `idNumberEncrypted`, `idNumberHash`, `edgeKeyHash` and `tokenHash` are stripped from every API response. Driver ID ciphertext no longer reaches client pages |
| Edge | Local operator token on mutating endpoints. Production refuses to start without its key, MQTT credentials, token or cloud URL, and refuses simulated hardware. Gate commands are validated for freshness and replay |
| MQTT | Tenant topic tree, production broker config with TLS, password file and per-site ACL template |
| Other | Attachment allowlist, safe download headers, health endpoint without leaks, reset-password refuses inactive accounts, production refuses a placeholder `AUTH_SECRET`, seed without a hard-coded password |

## 6. Multi-tenancy improvements

* Access context levels:
  * Platform: every site.
  * Company: every site of the company.
  * Sites: only the assigned sites, which is what makes a user a Site Admin.
* The context applies to sites, transactions, bookings, orders, incidents, reports, exports, billing, raw data, the audit log (scoped by `SystemLog.organisationId`, which is now recorded and backfilled), the operator console and the hardware pages.
* Walk-in weighing resolves vehicles, drivers and hauliers only inside the site's company and its contracted hauliers.
* Shared hauliers are unlinked rather than suspended for everyone.

## 7. The three tiers

| | Manual | Semi-Automatic | Fully Automatic |
|---|---|---|---|
| Typed weights | Normal | Reason required, raises a MANUAL_OVERRIDE exception | Reason plus `transaction.override` permission, raises an exception |
| Scale integration | Optional | Required | Required |
| Card identification | Optional, never required | Recommended; can be required per site | Required |
| Gates | Operated by hand | Optional automation | Required |
| Edge / offline | Optional | Recommended | Required |

* Each site's tier is capped by `Organisation.licensedTier`.
* A licence downgrade is refused while any site runs above the new licence.
* Activation is blocked while required hardware is missing.

The full matrix and hardware lists are in [TIERS.md](TIERS.md).

## 8. Hardware configuration

`/admin/hardware`: choose company, site and lane. The page then shows:

* the tier card: capabilities, blockers, workflows and card rule;
* the edge card: status, key issue, rotate and revoke;
* templates;
* each device type as a toggle, with editors that show only the fields for that type and connection.

Safe tests do not move hardware or create transactions:

* a configuration check;
* a read-only Web Serial scale read;
* an NFC bridge read.

`/admin/hardware/health` shows live status from edge heartbeats and from operator consoles (the scale on Manual sites). `/admin/sites/new` is the setup wizard; it creates the site inactive, and activation runs the readiness check.

## 9. Hardware compatibility (honest support levels)

| Support | Connections |
|---|---|
| Adapter ready | Web Serial (indicator → browser), USB NFC via local bridge (PC/SC), MQTT |
| Via edge controller | Serial RS-232, RS-485 through a converter, TCP/IP, digital I/O via PIC18, ANPR still snapshots (EasyOCR, optional image build) |
| Planned (recorded only) | Modbus TCP/RTU, RTSP video, vendor HTTP APIs, Bluetooth, SNMP monitoring, ESC/POS thermal printing |

Scale parsers: Mettler Toledo Continuous, MT-SICS and generic ASCII. Avery and Rice Lake go through the generic parser and must be confirmed with a live reading.

## 10. Database improvements

* Migration `20261026090000_capture_db_push_drift`: idempotent capture of `PAUSED` and the fast-track preset columns.
* Migration `20261026100000_tiers_edge_identity_hardware_center`:
  * `OperatingTier`;
  * `licensed_tier`, `operating_tier` and `feature_overrides`;
  * edge identity and heartbeat columns;
  * richer `hardware_devices` (connection, maker, model, simulated, maintenance, latest health, last test);
  * `hardware_profiles`;
  * `system_logs.organisation_id`, `actor_role` and `reason`;
  * `site_configs.allowed_workflows`;
  * eight new device types;
  * backfills.

Both migrations are additive. A fresh database built from migrations alone was verified to work (the demo database). Latest device health is now denormalised, and history rows are written only when the state changes, which bounds the growth of `hardware_status`.

## 11. UX improvements

* Mobile navigation drawer (the sidebar was previously unreachable below desktop width).
* Role label (Platform Super Admin, Company Admin, Site Admin, …).
* A real connection indicator.
* Product picker for walk-ins instead of a hard-coded "Coal (ROM)".
* Reason prompt with one-tap reasons for typed weights.
* The gate button now sends a real, audited command through the edge; before, it showed a toast and did nothing.
* Template defaults match the site tier.
* Honest "Unknown" and "Key not issued" states.
* The legacy hard-coded hardware checkboxes were removed from the Sites dialog in favour of the hardware centre.

## 12. Reporting improvements

* Reports, CSV/PDF exports, statistics, billing, raw data and dashboards respect site restrictions.
* The Super Admin dashboard shows tier distribution, offline edges, hardware alerts, failed syncs and active users.
* The company dashboard shows each site's tier and edge state.
* Transaction list rows carry their id.

## 13. Edge improvements

* Cloud contract:
  * per-site key;
  * `GET /api/edge/config`;
  * `POST /api/edge/heartbeat` every 30 s, carrying per-device health keyed to the cloud's device keys, which now default to the template keys.
* Safety: fail-closed gates. A driver without a registered card is held for an operator. Making the field nullable for the cloud contract briefly exposed a `None == None` admission path, which was caught in the end-to-end run and fixed before commit.
* Sync: idempotent with capped back-off.
* Hosting: configurable HTTP host and port, non-root container, health check.
* Simulator: falls back to a plate report when ANPR is not installed.

## 14. Deployment readiness

* `docker compose config` passes for every profile (default, cloud, edge, edge-dual, admin-tools).
* Ports are bound to loopback by default, and the Postgres host port is configurable (Windows Hyper-V reserves 15432 on this machine).
* The web service has a health check, and the edge services use the hardened image and dev configs.
* A production Mosquitto config and ACL template are provided.

Guides: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) and [EDGE_DEPLOYMENT.md](EDGE_DEPLOYMENT.md).

## 15. Testing results

| Check | Result |
|---|---|
| `npx tsc --noEmit` (web) | Pass |
| `npm test` (web, Vitest) | **111 passed** (11 files: tiers, hardware catalogue/health/edge keys, site access personas, MQTT topics, plus the original suites) |
| `npm run lint` (web) | 0 errors, 5 accepted warnings |
| `next build` (production) | Pass |
| Edge `pytest` | **89 passed** |
| `scripts/e2e-personas.mjs` against the running app | **28/28 passed** |
| Live edge ↔ cloud | Config pulled, heartbeats updated 10 devices, 1 unattended weighment reconciled (`WB-MOP-N-20261026-000001`, net 33,320 kg, chained to the cloud head) |
| Fresh database from migrations | Pass (demo database) |
| `docker compose config` (5 profiles) | Pass |
| `docker compose --profile cloud build web` | Pass (built before the final Dockerfile edit, which added the attachments directory) |
| Edge image (`apps/site-daemon`, default, no ANPR) | Built and health check passing (edge restoration work) |
| Screenshots | 28 captures of the running app (desktop, tablet, phone) in `docs/screenshots/` |

Defects found by the end-to-end runs and then fixed:

* walk-in tare violated a DB constraint;
* `driver_rfid: null` broke the edge booking lookup and exposed a fail-open gate check;
* entry-gate command resent every frame;
* site-restricted users saw company-wide reports;
* hard-coded commodity and dashboard statuses.

## 16. Known limitations

* In-memory rate limiter. A multi-instance deployment needs a shared store such as Redis.
* The web app has no MQTT subscriber; dashboards poll, and the edge reports over HTTPS.
* The transaction hash chain is unkeyed SHA-256. It makes tampering evident, but does not protect against a database administrator.
* No multi-factor sign-in yet.
* `socket.io` is still an unused dependency.
* Planned adapters listed in section 9.
* There is no firmware-level gate watchdog; auto-close lives in the edge daemon.
* Hardware tests from the cloud are configuration plus heartbeat status. Live device probes run only for browser-attached devices (scale, NFC).
* Some list endpoints remain unpaginated: vehicle history and the transporter reports.
* Gate and light commands from the console reach an edge only when the web server is on that edge's LAN (`SITE_DAEMON_URL`). A cloud-hosted deployment has no command path to edges yet; the planned route is MQTT `gate/command`, which the edge already validates.
* The edge applies each gate's auto-close time from the cloud configuration. The other recorded gate settings, the controller watchdog and the ANPR settings are documented for commissioning but not applied; the edge uses its own site file. The PIC firmware has its watchdog disabled.
* The weight source (indicator or typed) is declared by the browser. The server enforces the tier policy on that declaration, but cannot prove that a value said to come from the indicator did.
* `requireCardIdentification` is modelled but not enforced in the operator console (edge lanes always check the card). Only `DISPATCH`/`RECEIPT` of the permitted workflows are enforced. Fast-track constant weights bypass the typed-weight rule.
* Server-rendered pages trust the 8-hour JWT; the per-request database check covers API routes, which is where data is read and changed.
* The edge's read-only local endpoints (`/health`, `/edge/live`) need no token; keep the local API bound to loopback (`WB_HTTP_HOST=127.0.0.1`) on edge PCs.
* The operator console reports only the scale's health, and only while its tab is visible.

## 17. Hardware requiring physical validation

| Item | Status |
|---|---|
| Boom gates, relays, safety beam | Not physically validated (simulator only) |
| Positioning beams P1/P2, traffic lights | Not physically validated (simulator only) |
| Lane RFID readers (UHF/HF) | Not physically validated |
| ANPR camera (EasyOCR on edge) | Tested on sample images only |
| PIC18F45K22 controller firmware | Not re-validated in this pass |
| Thermal printers | ESC/POS not implemented |
| NFC desk reader (PC/SC via bridge) | Built by the team; not re-validated in this pass |
| Mettler Toledo indicator over Web Serial | Physically validated by the team earlier (git history); not re-validated in this pass |

## 18. Recommended roadmap

1. Pilot one Semi-Automatic site: commission the edge, reader, beams and lights against the checklist, and measure turnaround and exceptions for a month.
2. Add a firmware gate watchdog and a link-loss safe state.
3. Add a cloud MQTT subscriber that pushes live lane state to consoles.
4. Add the Modbus TCP adapter, then ESC/POS printing.
5. Move rate limiting and sessions to a shared store; add MFA for administrators.
6. Key the hash chain (HMAC with an edge-held key) and add a periodic chain-verification job.
7. Remove `socket.io`; paginate the remaining list endpoints.

## 19. Changed files (by area)

| Area | Files |
|---|---|
| `apps/web/src/app` (pages and routes) | 51 |
| `apps/web/src/lib` | 17 |
| `apps/web/src/components` | 12 |
| `apps/web/src/tests` | 4 new suites |
| `apps/site-daemon` | 42 |
| `apps/hardware-simulator` | 7 |
| `packages/database` | schema, 2 migrations, seed, demo seed |
| `packages/mqtt-topics` | topic builders |
| `mosquitto/` | production config, ACL template, README |
| Other | `docker-compose.yml`, `scripts/e2e-personas.mjs`, `docs/` |

Run `git diff --stat 66fc380..HEAD` for the exact list.

## 20. Commands used

```bash
# database
docker compose up -d postgres mosquitto            # POSTGRES_HOST_PORT=25432 on this machine
npm run db:migrate                                  # or: prisma migrate deploy
npx tsx packages/database/seed.ts                   # SEED_SUPERADMIN_PASSWORD optional
DATABASE_URL=.../weighbridge_demo DEMO_PASSWORD=... npx tsx packages/database/seed-demo.ts

# web
cd apps/web && npx tsc --noEmit && npm test && npm run lint && npx next build

# edge
cd apps/site-daemon && python -m venv .venv && .venv/Scripts/pip install -r requirements-core.txt -r requirements-dev.txt
.venv/Scripts/python -m pytest -q

# end to end (app running against the demo DB)
BASE_URL=http://127.0.0.1:3010 DEMO_PASSWORD=... node scripts/e2e-personas.mjs
python apps/hardware-simulator/simulator.py --headless
WB_ENV=development WB_ALLOW_SIMULATION=true WB_SITE_API_KEY=wbe_... WB_LOCAL_API_TOKEN=... WB_CONFIG_PATH=... python apps/site-daemon/daemon.py
python apps/hardware-simulator/scenarios.py normal --plate "..."

docker compose --profile cloud --profile edge config -q
```

## 21. How to deploy

1. Back up the production database (`scripts/backup/backup-postgres.sh`).
2. Deploy the branch. Run `prisma migrate deploy`. The drift migration is idempotent, so it is safe on databases that received the columns through `db push`.
3. Set `AUTH_SECRET` (not a placeholder) and `PASSWORD_PEPPER`.
4. For each company, set `licensedTier`. Existing sites default to Manual, so the tier rules (typed weights, cards) do not change until a tier is raised. The security fixes apply immediately: company admins can no longer create Administrators, and operators can only pause or resume orders.
5. For each automated site:
   * issue an edge key in Hardware → Configuration;
   * deploy the edge container with `WB_SITE_API_KEY`, MQTT credentials and `WB_LOCAL_API_TOKEN`;
   * apply a template and fill in addresses;
   * activate.
6. Existing edge installs that use the old shared key need `ALLOW_LEGACY_SITE_KEY=true` temporarily until they are re-keyed. No such installs existed in this repository's deployment.

## 22. How to roll back

* **Code:** redeploy `main` (`66fc380`), or `git revert` the branch commits.
* **Database:** both new migrations only add things (enum values, nullable or defaulted columns, one table, indexes), so the previous code runs against the migrated schema. One caveat: the previous code's Prisma client does not know the eight new device types, so delete or retire any device created with those types before rolling back. Rolling back the schema itself is not needed and not recommended; restore from the backup taken in step 1 only if required.
* **Edge:** stop the container. Manual sites are unaffected because they do not use the edge.

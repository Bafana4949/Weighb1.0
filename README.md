# Weighbridge and Access-Control Platform

A multi-company platform for weighbridges and site access. One cloud deployment serves many mining companies, each with its own sites, users, transporters, products, orders and reports. Each site runs at one of three automation tiers, from operator-driven weighing to unattended lanes with an on-site edge controller.

- **Cloud**: Next.js 15 web app and API, PostgreSQL (Prisma), Mosquitto MQTT.
- **Edge**: a Python site daemon per site that drives the lane I/O controller, keeps an offline SHA-256 hash-chained ledger and reconciles with the cloud.
- **Operator PC**: reads the scale indicator directly in Chrome or Edge (Web Serial) and NFC cards through a small local bridge.

This repository is an engineering system, not a certified legal-for-trade instrument. Live deployment needs metrology verification, electrical and safety review of the lane hardware, and site acceptance testing. Physical gates, beams, RFID readers, ANPR cameras, I/O controllers and printers have **not** been physically validated; the automated flows have been exercised with the hardware simulator.

## Tiers

| | Manual | Semi-Automatic | Fully Automatic |
|---|---|---|---|
| Operator | Identifies vehicles and captures every weight | Confirms each weighment | Handles exceptions only |
| Scale reading | Typed, or from the indicator in the browser | Automatic; typing needs a reason | Automatic via the edge; typing needs a reason and a supervisor |
| Cards, ANPR, beams, lights, gates | Optional card reader; no automation | Card reader, beams and lights recommended; ANPR and gates optional | Card reader, beams, lights, gates and edge required; ANPR recommended |
| Edge controller | Optional | Recommended | Required |
| Relative cost | Low | Medium | High |

Tier rules live in `apps/web/src/lib/tiers.ts`. A site's tier is capped by its company's licence. Moving up a tier is a hardware, configuration and licence change on the same software. See [docs/TIERS.md](docs/TIERS.md).

## Repository layout

| Path | Contents |
|---|---|
| `apps/web` | Next.js 15 platform: UI, API routes, auth, tenancy, tiers, hardware centre (`src/lib`, `src/app`, `src/components`) |
| `apps/site-daemon` | Edge controller: FastAPI, weighing state machine, gate interlock, SQLite ledger, sync worker, MQTT, optional ANPR |
| `apps/hardware-simulator` | Simulated lane I/O controller speaking the same wire protocol over TCP, with scripted scenarios |
| `apps/firmware-pic18` | Prototype PIC18F45K22 I/O controller firmware |
| `packages/database` | Prisma schema, migrations, `seed.ts`, `seed-demo.ts`, RBAC catalogue |
| `packages/shared-types`, `packages/mqtt-topics` | Shared TypeScript types and MQTT topic helpers |
| `tools/nfc-bridge` | Local USB NFC reader bridge on `127.0.0.1:7777` |
| `mosquitto/` | Development and production broker configuration, ACL template |
| `scripts/` | Backups, serial diagnostics, Chrome/Edge serial policy, end-to-end persona checks |
| `docs/` | Documentation (index below) |

## Quick start (development)

Prerequisites: Node.js 20+, Docker with Compose, and Python 3.11 for the edge daemon.

```bash
cp .env.example .env                 # development defaults work as-is
docker compose up -d postgres mosquitto
npm install
npm run db:migrate                   # prisma migrate dev (development only)
npm run db:seed                      # permissions, roles and the platform super admin
npm run dev:web                      # http://localhost:3010
```

`npm run db:seed` prints the super admin's email and, unless you set `SEED_SUPERADMIN_PASSWORD` in `.env`, a generated password shown once. Change it after the first sign-in.

PostgreSQL is published on `127.0.0.1:15432` by default. On Windows, if that port is reserved by Hyper-V, set `POSTGRES_HOST_PORT` in `.env` and adjust `DATABASE_URL` and `DIRECT_URL` (see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)).

Optional pieces:

```bash
npm run nfc-bridge:setup && npm run nfc-bridge          # desk NFC reader
docker compose --profile cloud up -d --build            # the web app as a container on :3010
docker compose --profile edge up -d --build             # edge daemon + hardware simulator (see below)
```

For the `edge` profile, issue the site's key in **Hardware → Configuration → Edge controller**, export `WB_SITE_API_KEY` and `WB_LOCAL_API_TOKEN`, and set `site.id` in `apps/site-daemon/config.docker.dev.yaml` to that site's code. The daemon refuses a key that belongs to another site.

## Demo data

`packages/database/seed-demo.ts` creates three fictional companies (one per tier) with sites, lanes, template hardware, users for every persona, transporters, products, orders and a week of hash-chained transactions. It **refuses to run unless the database name contains `demo`**.

```bash
docker compose exec postgres createdb -U weighbridge weighbridge_demo
# point DATABASE_URL and DIRECT_URL in .env at .../weighbridge_demo, then:
npm run db:migrate
cd packages/database
DATABASE_URL=postgresql://weighbridge:weighbridge_dev_change_me@127.0.0.1:15432/weighbridge_demo \
DEMO_PASSWORD='choose-a-demo-password' npx tsx seed-demo.ts
```

All demo accounts share `DEMO_PASSWORD` (generated and printed if unset): `platform.admin@weighbridge.demo`, `admin@<company>.demo`, `siteadmin.<site>@...`, `operator.<site>@...`, `security.<site>@...`, `dispatch@swift.demo`.

## Tests

| Suite | Command | Result for this release |
|---|---|---|
| Web unit tests | `npm test` (runs Vitest in `apps/web`) | 111 passing |
| Edge tests | `cd apps/site-daemon && pip install -r requirements-core.txt -r requirements-dev.txt && pytest` | 89 passing |
| HTTP persona checks | `BASE_URL=http://localhost:3010 DEMO_PASSWORD='...' node scripts/e2e-personas.mjs` against a running app with demo data | 28 of 28 passing |
| Production build | `npm run build` | Succeeds |

The persona checks sign in as each demo persona and verify company and site isolation, IDOR protection, tier typed-weight rules, administrator restrictions, transporter isolation and edge-key binding. They write demo transactions; never run them against production.

## Documentation

| Document | For |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, tenancy model, data flows, what is and is not validated |
| [docs/TIERS.md](docs/TIERS.md) | Tier capabilities, typed-weight policy, licence cap, readiness, hardware matrix |
| [docs/HARDWARE_CONFIGURATION.md](docs/HARDWARE_CONFIGURATION.md) | Hardware centre, device settings, safe tests, health dashboard, site wizard |
| [docs/EDGE_DEPLOYMENT.md](docs/EDGE_DEPLOYMENT.md) | Installing and running the site daemon; gate safety; offline behaviour |
| [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Production cloud deployment, migrations, TLS, MQTT, backups, rollback |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model and known limitations |
| [docs/USER_GUIDES.md](docs/USER_GUIDES.md) | Task guides for every role |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Symptom, cause and fix |
| [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) | PostgreSQL backup, verification and restore |
| [docs/NFC_SCANNER_SETUP.md](docs/NFC_SCANNER_SETUP.md) | Desk NFC reader and bridge |
| [mosquitto/README.md](mosquitto/README.md) | Broker topic tree and edge accounts |
| [docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md) | Audit findings before this release |
| [docs/FINAL_TECHNICAL_REPORT.md](docs/FINAL_TECHNICAL_REPORT.md) | Technical report for this release |

Older documents at the repository root (`DEPLOYMENT.md`, `USER_MANUAL.md`, `EXECUTIVE_SYSTEM_SUMMARY.md`) and `docs/RUNNING_THE_SYSTEM.md` predate this release. Where they differ from the documents above, the documents above are current.

# System Gap Analysis

Grounded in direct inspection of the running system (not assumption) and the comparison in [`OPEN_SOURCE_BENCHMARK.md`](./OPEN_SOURCE_BENCHMARK.md). Every gap below was independently verified against the actual code/tests/live containers before being listed — several suspected gaps were checked and turned out to already be handled correctly (noted at the bottom under "Investigated, not a gap").

## CRITICAL

None found. Tenant isolation, authentication, transaction idempotency (unique `idempotency_key`/`waybill_number`/`integrity_hash`), and the SHA-256 hash chain were all verified working (integration-tested against real Postgres this session; the edge SQLite schema already enforces uniqueness at the database level).

## HIGH

### H1 — No rate limiting on any API route
- **Current behaviour**: every route in `apps/web/src/app/api` (confirmed by repo-wide grep) has zero request-rate limiting. `/api/auth/login`, `/api/transporters/apply`, `/api/auth/forgot-password` are all publicly reachable (per `middleware.ts`'s `publiclyReachable` list) with no throttling.
- **Expected professional behaviour**: public/auth-adjacent endpoints should be rate-limited per IP (and per account for login) to resist credential-stuffing and signup spam. Traccar, ThingsBoard and osTicket all ship this by default.
- **Evidence**: `grep -rl "rate.?limit\|RateLimit" apps/web/src` → zero matches.
- **Reference systems**: ThingsBoard (per-tenant + per-endpoint rate limiting), Traccar (login throttling).
- **Proposed solution**: a small in-memory (or Redis-backed, if we ever run multiple instances) token-bucket middleware applied to the public auth routes first, then extended to write-heavy routes.
- **Affected files**: new `apps/web/src/lib/rate-limit.ts`; `middleware.ts` or per-route application in `api/auth/login/route.ts`, `api/transporters/apply/route.ts`, `api/auth/forgot-password/route.ts`, `api/auth/reset-password/route.ts`.
- **Security impact**: closes a real brute-force/spam vector.
- **Migration impact**: none (no schema change).
- **Testing requirement**: unit test the limiter's bucket logic; manual verification that repeated requests get 429'd.
- **Status**: **implemented this session** — see Changes Made.

### H2 — Dual entry/exit weighbridge topology has no live daemon behaviour
- **Current behaviour**: `Site.topology` and `Lane` are real, stored, editable data (Phase 2 of the SaaS conversion). The Python site-daemon reports its configured topology via `/health` but the `WeighingStateMachine` is a single instance regardless of topology — a `DUAL_ENTRY_EXIT` site still gets one shared-deck state machine.
- **Expected professional behaviour**: two independent state machines (or one parameterised per-lane), independent MQTT topic namespaces, independent hardware transport connections.
- **Evidence**: `apps/site-daemon/daemon.py` instantiates exactly one `WeighingStateMachine`; no lane parameter exists anywhere in `state_machine.py`, `protocol.py`, or `mqtt_client.py`.
- **Proposed solution**: documented as a scoped, standalone follow-on (this is real Python architecture work requiring a second hardware-simulator instance to test against — not something to rush).
- **Affected files**: `apps/site-daemon/state_machine.py`, `daemon.py`, `mqtt_client.py`, `protocol.py`; `apps/hardware-simulator/`; `docker-compose.yml` (new services).
- **Security impact**: none directly, but a client configured for dual topology today gets a UI that implies capability the runtime doesn't have — already mitigated by explicit "config saved, live dual-lane ships later" messaging built into the admin UI.
- **Testing requirement**: two-lane concurrent session test (one lane authorising while the other weighs) once implemented.
- **Status**: not implemented — genuinely out of scope for a safe single-pass change; tracked as a recommendation.

## MEDIUM

### M1 — No structured logging
- **Current behaviour**: ad-hoc `console.log`/`console.error` in a handful of places (notification placeholders, seed script); no request-scoped structured logger (pino/winston or similar) anywhere in `apps/web`.
- **Expected professional behaviour**: JSON-structured logs with request IDs, correlatable across the web app and the daemon, so incidents can be traced without grepping raw text.
- **Evidence**: `grep -l "pino\|winston" apps/web/package.json` → no match.
- **Reference systems**: ThingsBoard, Traccar (both ship structured, leveled logging by default).
- **Proposed solution**: introduce a thin `lib/logger.ts` wrapping `pino`, adopted incrementally in new/touched routes rather than a repo-wide rewrite.
- **Affected files**: new `apps/web/src/lib/logger.ts`; `package.json`.
- **Security impact**: improves incident response time; must ensure the logger never logs full request bodies (driver ID numbers, passwords) — needs an explicit redaction allowlist if adopted.
- **Migration impact**: none.
- **Testing requirement**: none beyond confirming redaction behaviour.
- **Status**: not implemented this session (genuinely lower priority than H1, and a repo-wide logging migration is its own multi-file effort better done deliberately rather than squeezed in).

### M2 — No documented PostgreSQL backup/DR strategy
- **Current behaviour**: the edge SQLite database has an explicit `backup()` method and a `backup_directory` config. The cloud PostgreSQL database has no equivalent documented backup process in this repository — it relies entirely on whatever the hosting provider (Neon, per this session's deployment work) does by default.
- **Expected professional behaviour**: documented RPO/RTO expectations and at minimum a documented manual/automated backup procedure.
- **Evidence**: no `docs/BACKUP.md` or equivalent; no backup script in `packages/database`.
- **Proposed solution**: document Neon's point-in-time-recovery retention window and add a runbook; not a code change.
- **Affected files**: new `docs/BACKUP_AND_RECOVERY.md`.
- **Security impact**: data-loss risk in a real incident is currently undocumented, not necessarily unmitigated (Neon does PITR by default) — this is a documentation gap, not a missing safeguard.
- **Status**: not implemented this session — recommended as a documentation-only follow-up.

### M3 — Stale test in the site-daemon suite (corrected finding)
- **Current behaviour**: `tests/test_state_machine.py::test_happy_path_state_transitions` asserts the state reaches `COMPLETE` immediately after the weight stabilises. It actually reaches `AWAITING_DRIVER_DECISION` and stays there.
- **Investigation result**: this is **not a state-machine bug**. `AWAITING_DRIVER_DECISION` is an intentional, documented state (`state_machine.py:279`) — the daemon deliberately pauses for an explicit driver accept/reject decision (via `POST /api/edge/driver-decision`, part of the driver load-check kiosk feature) before finalising to `COMPLETE`. The test was written before that step existed and was never updated to simulate it.
- **Correction to prior reporting**: an earlier report in this session's history described this as a "pre-existing bug" without investigating the root cause. Having now traced it, the correct classification is a stale test expectation, not a functional defect.
- **Proposed solution**: update the test to call the driver-decision step (matching how `scenario_normal_weighment` in the real simulator does it, or how it's expected to work in production) before asserting `COMPLETE`.
- **Affected files**: `apps/site-daemon/tests/test_state_machine.py`.
- **Status**: documented, not fixed this session (touching daemon test internals was intentionally deferred to keep this pass low-risk; flagged clearly rather than silently left mischaracterised).

### M4 — No CI pipeline
- **Current behaviour**: `.github/` does not exist in the repository. `tsc`, `next build`, `vitest run`, and `pytest` are all run manually.
- **Expected professional behaviour**: at minimum, a GitHub Actions workflow running typecheck + build + fast test suite on every push/PR.
- **Evidence**: `find .github -type f` → no results.
- **Proposed solution**: a single `.github/workflows/ci.yml` running the same commands used throughout this session's verification loop.
- **Security impact**: none directly; reduces the chance of a regression reaching `main` unnoticed.
- **Status**: not implemented this session — flagged as a valuable, low-risk follow-up (no schema/runtime risk at all, purely additive tooling).

## LOW

### L1 — File-upload validation is size-only
- **Current behaviour**: `POST /api/service-orders/[id]/attachments` enforces a 10 MB size cap and requires auth + tenant scoping, but does not sniff actual file content against the declared `contentType`, nor restrict file extensions.
- **Expected professional behaviour**: content-type sniffing (e.g. magic-byte check) to prevent a mislabeled executable being served back with a misleading `content-type`.
- **Evidence**: `apps/web/src/app/api/service-orders/[id]/attachments/route.ts` — no content sniffing.
- **Proposed solution**: add a lightweight magic-byte check for common types (PDF/JPEG/PNG) before storage.
- **Security impact**: low — files are served with `content-disposition: attachment` (forces download, not inline render), which already mitigates the main XSS-via-upload risk.
- **Status**: not implemented — genuinely low severity given the existing `attachment` disposition mitigation.

### L2 — No API versioning
- **Current behaviour**: all routes are unversioned (`/api/...`, not `/api/v1/...`).
- **Assessment**: **not a real gap yet** — this is an internal API consumed only by our own web/daemon/simulator, not a public partner API with external consumers who'd need a stability contract. Versioning now would be premature abstraction.
- **Status**: correctly deferred; listed here only because the request asked it be considered.

## NOT REQUIRED

- **API-key rotation UI** — the daemon's `x-site-api-key` is a single shared secret per deployment; a rotation workflow is real work but there is no current operational pain point driving it, and no reference system in the benchmark treats this as table-stakes for a system this size.
- **Multi-region deployment** — no evidence this system needs to run in more than one region; adding it now would be speculative.
- **GraphQL API** — the existing REST API is consistent and adequate for the current client (own Next.js frontend); no external integration partner has been identified that would benefit from GraphQL.

## Investigated, not a gap (confirmed already correct)

- **Transaction idempotency**: `sync_queue.idempotency_key` is `NOT NULL UNIQUE`; `transactions.waybill_number` and `transactions.integrity_hash` are both `NOT NULL UNIQUE` — duplicate submission is rejected at the database level, not just application logic.
- **Crash recovery**: `incomplete_sessions` table + `_initialise_with_recovery()` in `database.py` — the daemon already resumes/cleans up sessions interrupted by a crash.
- **PII handling in audit logs**: verified `api/drivers/[id]/blacklist/route.ts` and the general `audit()` call pattern — encrypted driver ID fields (`idNumberEncrypted`/`idNumberHash`) are never passed into `beforeData`/`afterData`, and API responses consistently strip them before returning.
- **Tenant isolation**: proven via a real (non-mocked) integration test suite against Postgres this session, covering both site-scoping and platform-super-admin unscoped access.

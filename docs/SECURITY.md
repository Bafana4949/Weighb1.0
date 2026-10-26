# Security model

This document describes the controls implemented in the code today and their known limitations. File references are relative to `apps/web/src/` unless stated otherwise.

## 1. Authentication

| Control | Implementation |
|---|---|
| Sign-in | NextAuth v5 credentials provider (`auth.ts`). Email plus password (minimum 8 characters); passwords are stored as bcrypt hashes (cost 12 where accounts are created) |
| Session | JWT, maximum age **8 hours** (`auth.config.ts`) |
| Secret | `AUTH_SECRET` (or `NEXTAUTH_SECRET`). In production the app refuses to start if it is missing, or if it still matches a placeholder pattern (`change-before-production`, `change-me`, `replace-with`) |
| Refused at sign-in | Unknown accounts, accounts not `ACTIVE`, deleted accounts, and users of a `SUSPENDED` or `ARCHIVED` company. All failures return the same generic error |
| Brute-force limits | Per account (keyed by a SHA-256 of the email): 10 attempts per 15 minutes. Per source IP: 50 attempts per 15 minutes. Successes and failures both count. A limited attempt fails like a wrong password and logs `auth_login_rate_limited` |
| Successful sign-in | Records `lastLoginAt` and a `LOGIN` audit entry with IP and user agent |
| Password reset | Single-use token, valid 1 hour, stored only as a peppered SHA-256 hash. `forgot-password` is limited to 5 requests per hour per IP, `reset-password` to 10 |

### Per-request revalidation

The JWT is treated as a hint. `currentSession()` in `lib/api.ts`, used by every API guard (`requireRole`, `requirePermission`, `requirePlatformSuperAdmin`, `requireCompanyAdmin`), re-reads from the database on each API call:

- the user's role, status, deletion flag, company and platform role;
- the company's status.

A suspended or deleted user, a suspended or archived company, or a changed role takes effect on the next API call. Any account other than the platform super admin that has no company is refused, so company-based filters fail closed.

## 2. Authorisation

### 2.1 Roles

Base roles (`UserRole`): `ADMIN`, `OPERATOR`, `SECURITY`, `TRANSPORTER`. Platform role (`PlatformRole`): `PLATFORM_SUPER_ADMIN` (and `PLATFORM_SUPPORT`, defined but not given special access in the guards).

Route-level gates in `middleware.ts`: `/admin/*` requires `ADMIN`; `/operator/*` requires `ADMIN`, `OPERATOR` or `SECURITY`; `/transporter/*` requires `ADMIN` or `TRANSPORTER`. Unauthenticated API calls get 401; unauthenticated page requests are redirected to `/login`.

### 2.2 Permissions and the fallback

`requirePermission(key)` in `lib/api.ts`:

1. The platform super admin is always allowed.
2. A user **with** custom role assignments is allowed only if one of those roles grants the key.
3. A user **without** custom role assignments falls back to the built-in set for their base role (`basePermissionAllows` in `lib/permissions.ts`). It never falls back to "everything":

| Base role | Built-in permission set |
|---|---|
| ADMIN | All permissions (`CLIENT_ADMIN`) |
| OPERATOR | The `OPERATOR` set: view sites, vehicles, drivers, bookings; process, print and reprint transactions; incidents; hardware view and control; reports view; orders view and create; master-data view |
| SECURITY | The `VIEWER` set plus `incident.create`, `transaction.print`, `hardware.view` |
| TRANSPORTER | `booking.view`, `booking.create`, `vehicle.view`, `driver.view`, `transaction.view`, `transaction.print`, `report.view` |

The built-in `SUPERVISOR` role (assignable) adds `transaction.override`, which is needed to type a weight at a Fully Automatic site.

### 2.3 Administrator accounts

- Only the platform super admin can create users with the `ADMIN` role, or change a user's role to or from `ADMIN`.
- Nobody can change their own role. The last platform super admin cannot be demoted.
- Company-wide administration (users, roles, role assignments, site access, password resets) requires `requireCompanyAdmin()`, which refuses a Site Admin. A Site Admin therefore cannot grant themselves more sites.
- Transporter logins are created through transporter onboarding, not the users screen.

## 3. Tenant and site isolation

Implemented in `lib/access.ts` and `lib/site-access.ts` (see `docs/ARCHITECTURE.md`, section 4).

- Every query for tenant data is filtered by company (`userScope`, `userSiteScope`) and, for site-restricted users, by the sites in `UserSiteAccess` (`siteWhere`, `viaSiteWhere`, `canAccessSite`).
- Missing scope fails closed with `TenantScopeError` (HTTP 403), never an unfiltered query.
- Records outside the caller's scope return **404**, so their existence is not confirmed.
- A `?site=` query parameter narrows results but cannot widen them beyond the caller's scope.
- Transporters see only bookings, transactions and waybills of their own organisation (`transporterScope`, `canViewTransaction`). On shared orders they see only their own trucks, and the commercial rate (`ratePerTonZar`) is returned as `null` to anyone other than the platform super admin and `ADMIN` users. Only the platform super admin can set the rate.

These rules were exercised by `scripts/e2e-personas.mjs` (28 of 28 checks passing against the demo data set): company isolation, IDOR on transactions and waybills, `?site=` widening, fast-track on another company's order, Site Admin restriction and self-escalation, administrator creation, tier typed-weight rules, transporter isolation and rate redaction, edge key binding, and rejection of bad and legacy keys.

## 4. Edge controller credentials

| Control | Implementation (`lib/edge-auth.ts`, `lib/api.ts`) |
|---|---|
| Key format | `wbe_` followed by 30 random bytes in base64url |
| Storage | Only the SHA-256 hash (`sites.edge_key_hash`, unique) and a short display prefix are stored. The full key is shown once when issued or rotated |
| Binding | `authenticateEdge` resolves the key to exactly one site. `actorCanAccessSite` allows an edge to act only on that site |
| Refused | Unknown keys, keys of inactive sites, keys of suspended or archived companies |
| Rotation and revocation | Platform super admin only; immediate; audited (`EDGE_KEY_ISSUED`, `EDGE_KEY_ROTATED`, `EDGE_KEY_REVOKED`) |
| Heartbeat abuse | `POST /api/edge/heartbeat` is limited to 20 calls per minute per site |
| Legacy shared key | `SITE_DAEMON_API_KEY` is accepted only when `ALLOW_LEGACY_SITE_KEY=true`, at least 24 characters long, not a `change-me` placeholder, compared in constant time. It keeps the old platform-wide reach, is refused by `/api/edge/config` and `/api/edge/heartbeat`, and is meant only for a short re-keying window |

The edge itself refuses the retired default key `dev-site-key-change-me` and, in production, refuses to start without its key, cloud URL, MQTT credentials and local token (`docs/EDGE_DEPLOYMENT.md`, section 6).

## 5. Data protection

| Control | Implementation |
|---|---|
| Secret scrubbing in responses | `ok()` in `lib/api.ts` serialises with `scrubSecrets`, which drops `passwordHash`, `idNumberEncrypted`, `idNumberHash`, `edgeKeyHash` and `tokenHash` at any depth, whatever a route included |
| Driver ID numbers | Encrypted with AES-256-GCM (`lib/crypto.ts`), key derived from `AUTH_SECRET`; a peppered SHA-256 (`PASSWORD_PEPPER`) is kept for lookups |
| Log redaction | The web logger (`lib/logger.ts`) redacts keys matching password, token, secret, database URL, API key, ID number. The edge log formatter redacts secret-shaped values and any `wbe_` key |
| Attachments | Service-order attachments: at most 10 MB; content type and extension must match an allowlist: PDF, PNG, JPEG, WebP, plain text (`.txt`, `.log`), CSV, XLSX, DOCX. HTML, SVG and scripts are refused. Stored under random names |
| Security headers | `next.config.mjs`: HSTS (2 years, includeSubDomains, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation off), a Content Security Policy with `frame-ancestors 'none'`, and `no-store` caching on dynamic responses |
| Health endpoint | `/api/health` reveals only ok or "database unavailable" |

Rate limits on other routes (per IP, in memory): company, user, product, source and destination creation and updates (20 per 10 minutes); report exports (20 per 5 minutes); waybill printing (60 per 5 minutes); service-order creation (30 per 5 minutes); reconciliation (240 per minute); site capability and hardware reads (60 per minute); console hardware status reports (12 per minute per user and site).

## 6. Transaction integrity

- Each completed weighment carries `integrityHash = SHA-256` of a canonical JSON payload (`wb.weighment.v1`: booking, vehicle, driver, site, gross, tare, net, commodity, capture time, waybill number, edge transaction id, previous hash) (`lib/chain.ts`). Hashes link per site into a chain starting from 64 zeros.
- Edge transactions are hashed on the edge. The cloud recomputes the hash on reconciliation and rejects mismatches (`INTEGRITY_HASH_MISMATCH`) and out-of-sequence links (`HASH_CHAIN_MISMATCH`), as well as site, booking-identity and tare mismatches.
- Waybills carry a QR link to the public `/verify/{hash}` page.
- Typed weights at Semi-Automatic and Fully Automatic sites need a reason (and at Fully Automatic the `transaction.override` permission), and raise a `MANUAL_OVERRIDE` incident.

## 7. Audit trail

`audit()` in `lib/audit.ts` writes a `system_logs` row with:

| Field | Content |
|---|---|
| `userId` | Acting user, if any |
| `actorRole` | Role held when acting, e.g. `PLATFORM_SUPER_ADMIN`, `ADMIN`, `OPERATOR` |
| `organisationId` | Owning company; derived from the site when not given, so company admins see the entry |
| `siteId` | Site concerned |
| `action`, `entityType`, `entityId` | What was done to what |
| `reason` | Justification for overrides, cancellations, typed weights, gate commands |
| `ipAddress`, `userAgent` | Where provided |
| `beforeData`, `afterData` | JSON snapshots |
| `occurredAt` | Timestamp |

Audit log visibility: the platform super admin sees everything, a Company Admin sees their company, a Site Admin sees their sites. Examples of audited actions: `LOGIN`, `SITE_CREATED`, `SITE_ACTIVATED`, `SITE_TIER_UPDATED`, `COMPANY_LICENCE_CHANGED`, `EDGE_KEY_*`, `HARDWARE_DEVICE_*`, `HARDWARE_TEST`, `HARDWARE_COMMAND` (with the operator's reason), `MANUAL_WEIGHT_OVERRIDE`, `TRANSACTION_PRINTED`, `TRANSACTION_REPRINTED`, `ORDER_CONSTANT_WEIGHTS_UPDATED`.

## 8. MQTT

- Production broker (`mosquitto/config/mosquitto.prod.conf`): no anonymous access, password file, TLS 1.2+ on 8883, plain 1883 on loopback only, optional mutual TLS.
- ACL (`mosquitto/config/acl.example`): an edge authenticates with its site UUID as username and can read and write only `tenant/+/site/<its site id>/#`. The cloud account reads `tenant/#` and may write only lane gate-command topics. A monitor account reads heartbeats, hardware status and `$SYS`.
- The edge refuses `mqtt.allow_anonymous` in production, keeps TLS certificate verification on, and stamps each message with `ts`, a per-topic increasing `seq` and a message id.
- Inbound gate commands are accepted only with a valid schema, a known lane matching the topic, a `ts` within 30 seconds, and a `seq` not used before on that lane. The `seq` history is held in memory; after a restart the 30-second window bounds replay. Every accepted command still passes the gate interlock.

## 9. Edge local API

- Every mutating endpoint (`/edge/command`, `/edge/manual-override`, `/edge/check-in`, `/edge/driver-decision`, `/edge/lane-reset`) requires `x-edge-token` equal to `WB_LOCAL_API_TOKEN` (constant-time comparison). Without a configured token they return 503.
- Manual override and lane reset require a reason of at least 10 characters and raise an alert that is synced to the cloud as an incident.
- The cloud proxy (`/api/edge/command`, co-located deployments only) requires a signed-in OPERATOR, ADMIN or SECURITY user with access to the configured site, a reason of at least 10 characters, writes a `HARDWARE_COMMAND` audit entry, and forwards with `SITE_DAEMON_TOKEN`.
- Gates are never driven from the browser. All gate commands pass the edge interlock.

## 10. Configuration safety

- Web: placeholder `AUTH_SECRET` refused in production; legacy edge key refused unless explicitly enabled and non-placeholder.
- Edge: production start-up refuses missing secrets, anonymous MQTT and simulated hardware (`WB_ALLOW_SIMULATION` must be set explicitly); the `runtime` switches cannot be set from the YAML file.
- Seed: `packages/database/seed.ts` takes the initial super admin password from `SEED_SUPERADMIN_PASSWORD` (minimum 12 characters) or generates a random one and prints it once. Re-running never resets an existing password. Change the initial password after first sign-in. `seed-demo.ts` refuses databases whose name lacks `demo`.

## 11. Known limitations

| Limitation | Impact | Mitigation today |
|---|---|---|
| Rate limiter is in memory (`lib/rate-limit.ts`) | Correct for one Node instance only. With several instances or serverless hosting, each counts separately and limits weaken; counters reset on restart | Run a single web instance behind the proxy; a shared store (for example Redis) is needed before scaling out |
| Hash chain is unkeyed SHA-256 | Tamper-evident against edits that do not recompute the chain. Someone with database write access can rewrite records and recompute every later hash; it is not tamper-proof against a database administrator | Restrict database access; keep off-site encrypted backups to compare against |
| No multi-factor authentication | Passwords are the only factor | Strong passwords, brute-force limits, short sessions |
| No cloud MQTT subscriber | Edge telemetry on MQTT is not consumed by the cloud; dashboards rely on HTTPS heartbeats and polling | — |
| `socket.io` server package unused | `components/providers.tsx` opens a Socket.IO client connection, but no server exists; the dependency adds surface without function | Remove or implement |
| Server-rendered pages use the JWT | Database revalidation (section 1) applies to API routes. Pages read role and company from the token, so a suspended user or changed role can still load page content until the 8-hour token expires | Suspend the account (API access stops at once); keep session length short |
| Weight source is declared by the browser | The server cannot prove a browser-submitted weight came from the indicator | Typed-weight reasons and `MANUAL_OVERRIDE` incidents at Semi/Full; edge-captured weights are not affected |
| Edge read endpoints have no token | `/health`, `/edge/live`, `/edge/lanes`, `/edge/transactions` return site data to anyone who can reach the port | Bind to loopback (`WB_HTTP_HOST=127.0.0.1` or publish on `127.0.0.1` only); firewall |
| Legacy shared key, when enabled | Platform-wide reach on the routes that accept it | Leave `ALLOW_LEGACY_SITE_KEY` unset except during re-keying |
| Audit log is an ordinary table | Not append-only; a database administrator can change it | Restrict database access; back it up |
| Content Security Policy allows `'unsafe-inline'` and `'unsafe-eval'` scripts | Weaker protection against injected script | React escaping; no user HTML is rendered |
| Cloud notification topic not in the ACL | `dashboard/{userId}/notifications` publishes are not granted to the cloud account in `acl.example`; nothing subscribes to them | — |

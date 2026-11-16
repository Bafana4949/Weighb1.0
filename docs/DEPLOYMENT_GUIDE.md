# Production deployment guide

This guide covers the cloud platform: web app, PostgreSQL, MQTT broker, reverse proxy, health checks, backups, monitoring and rollback. Edge controllers are covered in `docs/EDGE_DEPLOYMENT.md`; security settings in `docs/SECURITY.md`.

## 1. Deployment options

| Option | Database | Web app | MQTT | Notes |
|---|---|---|---|---|
| A. Self-hosted Docker Compose (`cloud` profile) | `postgres:16-alpine` container | `apps/web/Dockerfile` | Mosquitto container, production config | Recommended when edges are used. Everything in this guide applies |
| B. Vercel + Supabase | Supabase PostgreSQL | Vercel (`vercel.json`, region `dub1`) | Not provided; host a broker separately if edges use MQTT | See section 3 for the limitations of serverless hosting |

Both run the same code. Edge controllers only need HTTPS access to `https://<host>/api` and, if used, MQTT over TLS.

## 2. Option A: Docker Compose

### 2.1 Prepare the host

1. Install Docker Engine with the Compose plugin.
2. Clone the repository on the release branch or tag.
3. Copy `.env.example` to `.env` in the repository root and fill in real values. At minimum:

| Variable | Requirement |
|---|---|
| `POSTGRES_PASSWORD` | Strong, unique. Compose falls back to a development default if unset |
| `AUTH_SECRET` | At least 32 random characters (`openssl rand -base64 48`). The app refuses to start in production with a placeholder |
| `PASSWORD_PEPPER` | Random, stable. Changing it later invalidates reset tokens and driver ID-number lookups |
| `NEXT_PUBLIC_APP_URL` | Public HTTPS URL; used in password-reset links and waybill QR verification links |
| `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD` | For the first seed (section 2.4) |
| `SMTP_*` | For password-reset and notification email (optional) |

`AUTH_SECRET` also encrypts stored driver ID numbers (AES-256-GCM). Rotating it makes previously encrypted ID numbers unreadable and signs every user out. Plan rotations accordingly.

### 2.2 Windows hosts: PostgreSQL port

Compose publishes PostgreSQL on `127.0.0.1:${POSTGRES_HOST_PORT:-15432}`. The port is configurable because Windows Hyper-V reserves dynamic port ranges, which can make a bind fail. Check reserved ranges with:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

and set `POSTGRES_HOST_PORT` in `.env` to a free port outside them. Inside the compose network the web container always uses `postgres:5432`.

### 2.3 Start

```bash
docker compose --profile cloud up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3010/api/health
```

- The web container listens on 3000 and is published on host port 3010.
- On every start the container runs `prisma migrate deploy` and then `next start`. A failing migration stops the container from starting; read `docker compose logs web`.
- The default `mosquitto` service uses the **development** configuration (anonymous, loopback only). For production replace it as described in section 6.
- The `web` service receives only the variables listed under its `environment:` in `docker-compose.yml` (database URLs built from `POSTGRES_*`, `AUTH_SECRET`, `PASSWORD_PEPPER`, `NEXT_PUBLIC_APP_URL`, `MQTT_URL` fixed to the compose broker, `SITE_DAEMON_*`, `SMTP_*`, `TWILIO_*`). `NFC_BRIDGE_URL`, `ALLOW_LEGACY_SITE_KEY` (default `false`) and `SITE_DAEMON_API_KEY` are passed through from your environment; `ATTACHMENT_STORAGE_PATH` is fixed to `/workspace/.attachments`.
- Service-order attachments are stored on the `web-attachments` named volume (mounted at `/workspace/.attachments`), so they survive container recreation. Include that volume in your backups.

### 2.4 First seed and the super admin account

`packages/database/seed.ts` creates the RBAC permission catalogue, the built-in roles, and the platform super admin. It inserts no demo data.

The super admin account is controlled by two variables:

| Variable | Behaviour |
|---|---|
| `SEED_SUPERADMIN_EMAIL` | Account email. Default `superadmin@weighbridge.co.za` |
| `SEED_SUPERADMIN_PASSWORD` | Initial password, at least 12 characters (the seed exits if shorter). If unset, a random password is generated and **printed once** in the seed output |

Re-running the seed never resets an existing account's password; it reports "unchanged". It does reassert that account's super-admin role and active status.

Empty values (for example a line `SEED_SUPERADMIN_PASSWORD=`) are treated as unset: the seed then uses the default email and generates a password.

The seed reads the repository-root `.env` and exits if that file does not exist. Run it from a checkout that can reach the database. With the compose database on the same host:

```bash
# .env in the repository root contains, among others:
#   DATABASE_URL=postgresql://weighbridge:<POSTGRES_PASSWORD>@127.0.0.1:15432/weighbridge?schema=public
#   SEED_SUPERADMIN_PASSWORD=<at least 12 characters>
npm install
npm run db:seed
```

Sign in, then change the super admin password immediately (it was either generated into a terminal or written to `.env`), and remove `SEED_SUPERADMIN_PASSWORD` from `.env`.

Do not run `packages/database/seed-demo.ts` against production. It refuses any database whose name does not contain `demo`.

## 3. Option B: Vercel and Supabase

The earlier guide (`DEPLOYMENT.md`, `supabase/README.md`) describes the account setup. Points that have changed or need care:

1. **Connection strings.** `DATABASE_URL` = Supabase pooler (port 6543, `?pgbouncer=true`); `DIRECT_URL` = direct or session connection (port 5432). Prisma uses `DIRECT_URL` for migrations.
2. **Schema.** Apply the Prisma migrations, not the old SQL snapshot in `supabase/migrations/`:
   ```bash
   # root .env holds DATABASE_URL and DIRECT_URL for Supabase
   npm --workspace @weighbridge/database run migrate:deploy
   npm run db:seed
   ```
3. **Environment variables** in Vercel project settings: everything in `.env.example` that applies (section 1 of that file). The `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` variables are read by `lib/supabase.ts`, which no route imports today; they are optional.
4. **Limitations of serverless hosting** (from the code):
   - Service-order attachments are written to local disk (`lib/storage.ts`, `ATTACHMENT_STORAGE_PATH`). Vercel's filesystem is not persistent, so attachments will not survive. Use option A, or replace the storage module, before relying on attachments.
   - The rate limiter is in memory per instance (`lib/rate-limit.ts`). On serverless each instance counts separately, so login brute-force limits are weaker.
   - There is no MQTT broker. Leave `MQTT_URL` unset or point it at a hosted broker.
   - Operator gate commands through `/api/edge/command` require the web server to reach an edge on the site LAN (`SITE_DAEMON_URL`), which a Vercel deployment cannot.

## 4. Migrations

| Command | Prisma command | Use |
|---|---|---|
| `npm run db:migrate` | `prisma migrate dev` | Development only. Creates new migrations from schema changes and may offer to reset a drifted database. Never run against production |
| `npm --workspace @weighbridge/database run migrate:deploy` | `prisma migrate deploy` | Production. Applies pending migrations in order; never resets. The web container runs it on start |
| `npm run db:push` | `prisma db push` | Do not use in production. It changes the schema without migration history, which is how drift arose before this release |

### Migrations in this release

The three most recent migration folders:

| Folder | What it does | New in this branch? |
|---|---|---|
| `20260918110000_one_active_weighment` | Partial unique index: at most one `IN_PROGRESS` transaction per booking (`CREATE UNIQUE INDEX IF NOT EXISTS`) | No; already on `main` |
| `20261026090000_capture_db_push_drift` | Records changes that earlier reached some databases through `db push`: `OrderStatus` value `PAUSED`; `drivers.rfid_tag` nullable; `vehicles.tare_weight_kg` default 0; order preset gross/tare weights and constant-weight flags. Written with `IF NOT EXISTS` so it applies to fresh databases and to databases that already have these columns | Yes |
| `20261026100000_tiers_edge_identity_hardware_center` | `OperatingTier` enum; new hardware device types; device connection, health, maintenance, simulation and test columns; `organisations.licensed_tier` (default `MANUAL`); `site_configs.allowed_workflows`; site edge-key, edge-status, tier and feature-override columns; audit `actor_role`, `organisation_id`, `reason`; `hardware_profiles` table; indexes; backfills audit `organisation_id` and device last-health | Yes |

All three are additive: new enum values, new nullable or defaulted columns, a new table and indexes. No column is dropped or renamed.

After applying them, check these defaults:

- Every existing company is licensed `MANUAL` and every existing site runs at `MANUAL`. Raise licences and site tiers deliberately (`docs/TIERS.md`, section 6).
- Existing edge controllers that used the shared `SITE_DAEMON_API_KEY` must be issued per-site keys. During the changeover `ALLOW_LEGACY_SITE_KEY=true` lets the old key authenticate on routes that also accept users (reconcile, manual transactions, incidents, bookings, chain head). It is not accepted by `/api/edge/config` or `/api/edge/heartbeat`, and the 1.1.0 edge refuses the old default key. Remove the flag when re-keying is complete.

If a database was created with `db push` and has no `_prisma_migrations` history, `migrate deploy` fails on the first migration. Baseline it first by marking the migrations already reflected in the schema as applied (`prisma migrate resolve --applied <folder>`), take a backup, then run `migrate deploy`.

## 5. Reverse proxy and TLS

Terminate TLS in front of the web container. Example nginx server block:

```nginx
server {
    listen 80;
    server_name weighbridge.example.co.za;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name weighbridge.example.co.za;

    ssl_certificate     /etc/letsencrypt/live/weighbridge.example.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/weighbridge.example.co.za/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # The app already sends Strict-Transport-Security; hide it so only one header is sent.
    proxy_hide_header Strict-Transport-Security;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # Attachments are up to 10 MB, sent base64-encoded.
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;

        # WebSocket upgrade
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Overwrite, do not append: the app rate-limits on the FIRST X-Forwarded-For entry,
        # so a client-supplied value must not survive.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;

        proxy_read_timeout 120s;
    }
}
```

Notes:

- The application sets its own security headers in `apps/web/next.config.mjs`: HSTS (2 years, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a Content Security Policy, `Referrer-Policy` and `Permissions-Policy`.
- The app does not run a WebSocket server today; the upgrade headers are there so the proxy will not need changing if one is added.
- Keep port 3010 closed to the internet; only the proxy should reach it.
- Set `NEXT_PUBLIC_APP_URL` to the public `https://` URL.

## 6. MQTT broker for production

Files: `mosquitto/config/mosquitto.prod.conf`, `mosquitto/config/acl.example`, `mosquitto/README.md`.

1. Copy `mosquitto.prod.conf` to the broker host as `/mosquitto/config/mosquitto.conf`. It disables anonymous access, enables persistence, listens on 8883 with TLS (TLS 1.2+) and keeps 1883 on loopback only.
2. Place the CA, server certificate and key in `/mosquitto/certs/` (`ca.crt`, `server.crt`, `server.key`). Uncomment `require_certificate true` for mutual TLS.
3. Copy `acl.example` to `/mosquitto/config/acl`. Its rules:
   - `pattern readwrite tenant/+/site/%u/#`: an edge whose username is its site UUID can use only its own site's topics.
   - `weighbridge-cloud`: read `tenant/#`, write `tenant/+/site/+/lane/+/gate/command`.
   - `weighbridge-monitor`: read heartbeats, hardware status and `$SYS/#`.
4. Create one password entry per edge and for the cloud account:
   ```bash
   docker compose exec mosquitto mosquitto_passwd -b /mosquitto/config/passwd <siteId> '<strong password>'
   docker compose exec mosquitto kill -HUP 1
   ```
5. Set the web app's `MQTT_URL` to `mqtts://weighbridge-cloud:<password>@<broker>:8883`.

Today the web app only publishes per-user notifications to `dashboard/{userId}/notifications`, which `acl.example` does not grant to `weighbridge-cloud` and which nothing subscribes to. The cloud does not subscribe to edge telemetry yet; dashboards use HTTPS heartbeats and polling.

## 7. Health checks

| Component | Check | Healthy | Unhealthy |
|---|---|---|---|
| Web app | `GET /api/health` (no authentication) | 200 `{"success":true,"data":{"status":"ok",...}}` | 503 `database unavailable` when PostgreSQL does not answer |
| Web container | Compose `healthcheck` runs `wget` on `/api/health` every 15 s (start period 60 s) | healthy | unhealthy after 10 failures |
| PostgreSQL | Compose `pg_isready` every 5 s | | |
| Edge controller | `GET http://127.0.0.1:8000/health` on the edge; Docker `HEALTHCHECK` | `"status":"ok"` | `"degraded"` when the hardware link is down |
| Edge as seen from the cloud | **Hardware → Health**: edge Online if a heartbeat arrived in the last 90 s | | Offline |

The health endpoint deliberately reveals nothing about configuration; details go to the server log.

## 8. Backups

PostgreSQL is the system of record. Use the scripts in `scripts/backup/` (full procedure in `docs/BACKUP_RECOVERY.md`):

```bash
# Nightly, from cron, on the Docker host
POSTGRES_CONTAINER=weighbridge-system-postgres-1 \
BACKUP_ENCRYPTION_KEY='<passphrase kept in a secrets manager>' \
  scripts/backup/backup-postgres.sh /var/backups/weighbridge

# Prove a backup restores (into a throwaway database; the live one is untouched)
scripts/backup/restore-postgres.sh /var/backups/weighbridge/<file>.sql.gz
```

- `backup-postgres.sh` dumps with `pg_dump` inside the container, verifies the gzip and dump header, optionally writes an AES-256-CBC encrypted copy, and keeps `BACKUP_RETENTION_COUNT` (default 30) local files. Copy the encrypted file off-site; the repository has no uploader.
- `restore-postgres.sh` restores into a new database by default. Overwriting a database needs both `--target <db>` and `--i-understand-this-overwrites-target`.
- With Supabase, use the provider's backups and point-in-time recovery.
- Edge PCs keep hourly SQLite copies of their own ledger. Also back up each edge's `/data` volume: transactions not yet synced exist only there.
- Service-order attachments on disk (`ATTACHMENT_STORAGE_PATH`, default `.attachments` in the app's working directory) are not in the database dump; back that directory up separately.

## 9. Monitoring

| Signal | Where |
|---|---|
| Web app logs | `docker compose logs web`. JSON lines with `timestamp`, `level`, `event`; secret-looking fields are redacted. Watch `auth_login_rate_limited`, `auth_login_failed`, `health_database_unavailable` |
| Edge logs | `docker logs <edge>`. JSON lines; `wbe_` keys and tokens redacted |
| Edge connectivity and backlog | **Hardware → Health**: edges offline, pending and failed offline sync per site |
| Device state | **Hardware → Health**: per-device Online, Offline, Warning, Error, Unknown, Maintenance |
| Operational exceptions | **Incidents**: scale faults, sensor faults, ANPR failures, cloud sync failures, manual weight overrides, driver mismatches |
| Audit | **Audit log** (super admin: all; company admin: own company; site admin: own sites) |

There is no built-in alert delivery to an external monitoring system. Point an uptime monitor at `/api/health` and alert on non-200.

## 10. Rollback

1. **Application.** Redeploy the previous release: `git revert` the release commit (or check out the previous tag) and rebuild, or run the previous image tag. Tag images per release (for example `weighbridge-web:<git sha>`) so this is a one-line change.
2. **Database.** The migrations in this release are additive, so the previous application version runs against the upgraded schema; leave the schema in place. Do not hand-edit `_prisma_migrations`. If a full database rollback is unavoidable, restore the backup taken immediately before the upgrade (section 8), accepting the loss of data written since.
3. **Edges.** Edge 1.1.0 requires per-site keys. If the cloud is rolled back to a version without per-site keys, roll edges back too, or keep them stopped; their SQLite ledgers keep queued transactions until the cloud accepts them.

Take a backup before every upgrade.

## 11. Upgrade checklist

1. Back up PostgreSQL and each edge's `/data`.
2. Deploy the new web image; confirm migrations applied (`docker compose logs web`) and `/api/health` returns 200.
3. Raise company licences and site tiers to their intended values.
4. Issue per-site edge keys, update each edge's environment, upgrade edges to 1.1.0.
5. Check **Hardware → Health** for every site.
6. Remove `ALLOW_LEGACY_SITE_KEY` if you set it.

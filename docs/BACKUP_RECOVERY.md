# PostgreSQL Backup & Recovery

Scope: the PostgreSQL database (`postgres` service in `docker-compose.yml`), which is the system of record for organisations, sites, bookings, transactions, service orders, and every other tenant's data. The site-daemon's local SQLite ledger is a separate, disposable edge cache — see the note at the bottom.

## Scripts

| Script | Purpose | Touches live data? |
|---|---|---|
| `scripts/backup/backup-postgres.sh` | Runs `pg_dump` inside the `postgres` container, gzips the output, verifies it, optionally encrypts it. | Read-only. |
| `scripts/backup/verify-backup.sh` | Checks a backup file's gzip integrity, dump header, and table count. | No — never connects to any database. |
| `scripts/backup/restore-postgres.sh` | Restores a backup. **By default restores into a brand-new throwaway database**, never the live one. | Only if you explicitly pass `--target <existing-db> --i-understand-this-overwrites-target`. |

All three are POSIX shell scripts that drive the `postgres` container via `docker exec`/`docker inspect`; they don't need `psql`/`pg_dump` installed on the host.

## Backup procedure

```bash
scripts/backup/backup-postgres.sh backups
```

Produces `backups/weighbridge-<db>-<UTC timestamp>.sql.gz`, then automatically:
1. Checks the gzip is not truncated/corrupt (`gzip -t`).
2. Checks the decompressed content starts with a real `pg_dump` header.
3. If `BACKUP_ENCRYPTION_KEY` is set, writes an additional AES-256-CBC-encrypted copy (`.sql.gz.enc`) — **upload the encrypted copy off-site, not the plaintext one.**
4. Prunes local copies beyond `BACKUP_RETENTION_COUNT` (default 30). This is a local-disk retention count, not itself an off-site archive — see "Off-site copies" below.

Run this on a schedule (cron / Windows Task Scheduler / a CI job) — it is not wired into the app automatically, since this repo has no background job runner for the web app today.

## Verification

Run `verify-backup.sh` against every backup immediately after it's produced (the backup script already does this once), and periodically re-verify older files on the retention shelf in case of bit rot:

```bash
scripts/backup/verify-backup.sh backups/weighbridge-weighbridge-20260728T120000Z.sql.gz
```

A verification-only pass never opens a database connection — it only inspects the file — so it's safe to run against any backup, including ones copied from off-site storage, without needing database credentials.

## Restore procedure

**Default (safe) mode** — proves a backup is restorable without risking anything:

```bash
scripts/backup/restore-postgres.sh backups/weighbridge-weighbridge-20260728T120000Z.sql.gz
```

This creates a new database named `weighbridge_restore_test_<timestamp>` inside the same Postgres server and restores into *that*. The live `weighbridge` database is never touched. After inspecting the restored data (the script prints the exact `DROP DATABASE` command), delete the throwaway database.

**This is the mode to use for routine "does our backup actually work" drills — run it on a schedule, not just after writing the scripts.**

**Destructive (real recovery) mode** — only during an actual incident, only when you mean it:

```bash
scripts/backup/restore-postgres.sh <file> --target weighbridge --i-understand-this-overwrites-target
```

Both `--target` and the confirmation flag are required together; the script refuses to overwrite an existing database with just one of them. There is no `--force`-style single flag that skips confirmation, on purpose.

Before running destructive mode against a database anyone depends on:
1. Take a **fresh** backup of the current (possibly-corrupted) state first, even if it's broken — you may need to recover data from *after* the last good backup.
2. Stop the `web` and `site-daemon` services so nothing writes to the database mid-restore.
3. Restore into a scratch database first (default mode) and check it before pointing anything real at the recovered data.

## Retention & off-site copies

- **Local retention**: `BACKUP_RETENTION_COUNT` (default 30) daily backups kept on local disk by the backup script.
- **Off-site copies**: this repo does not include an uploader (no S3/Blob credentials assumed) — pipe the `.sql.gz.enc` file this script produces to whatever off-site object storage your deployment already uses (e.g. `aws s3 cp`, `az storage blob upload`, `rclone`). Encrypt (`BACKUP_ENCRYPTION_KEY`) before it leaves the machine that ran the backup; the encryption key must be stored somewhere other than next to the backups themselves (a secrets manager, not this repo).
- **Compliance-driven retention** (how long backups must be kept, and whether daily is even the right cadence) is a business decision this repo doesn't make for you — the defaults above are reasonable for local development, not a substitute for an actual policy signed off by whoever owns data-retention compliance for a real deployment.

## What this does *not* cover

- **The site-daemon's local SQLite edge ledger** (`/data/edge.db` inside the `site-daemon`/`site-daemon-dual` containers) is intentionally excluded. It's a disposable local cache: `EdgeDatabase._initialise_with_recovery()` already detects corruption and rebuilds itself, and `bootstrap_chain_head()` re-syncs a fresh/empty ledger from the cloud's real transaction chain head on startup. Losing it does not lose data — every transaction is reconciled to PostgreSQL, which is the actual system of record. (Its own `backups/` directory inside the container, written by `EdgeDatabase.backup()`, is a local safety net for same-machine SQLite corruption, not a substitute for the PostgreSQL backups this document covers.)
- **Neon/production**: if this app is deployed against a managed Postgres provider (the repo's Vercel deployment uses Neon), that provider's own point-in-time-recovery/backup feature is the primary mechanism — these scripts assume a self-hosted `postgres` container (`docker-compose.yml`) and would need their `pg_dump`/`docker exec` calls adapted to run against a remote connection string instead.

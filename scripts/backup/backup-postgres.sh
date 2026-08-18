#!/usr/bin/env bash
# Takes a consistent, non-destructive PostgreSQL backup via pg_dump inside the
# running `postgres` container. Never touches production data — this is a
# read-only dump. See docs/BACKUP_RECOVERY.md for the full policy.
#
# Usage:
#   scripts/backup/backup-postgres.sh [output-directory] [container-name]
#
# Env vars (match docker-compose.yml defaults):
#   POSTGRES_USER, POSTGRES_DB, POSTGRES_CONTAINER
#   BACKUP_ENCRYPTION_KEY  - optional. If set, the dump is additionally
#                            encrypted at rest with `openssl enc -aes-256-cbc`
#                            using this passphrase, producing a second
#                            `.sql.gz.enc` file alongside the plain one.
set -euo pipefail

OUT_DIR="${1:-backups}"
CONTAINER="${2:-${POSTGRES_CONTAINER:-weighbridge-system-postgres-1}}"
DB_USER="${POSTGRES_USER:-weighbridge}"
DB_NAME="${POSTGRES_DB:-weighbridge}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILENAME="weighbridge-${DB_NAME}-${TIMESTAMP}.sql.gz"

mkdir -p "$OUT_DIR"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container '$CONTAINER' is not running. Set POSTGRES_CONTAINER or pass it as the 2nd argument." >&2
  exit 1
fi

echo "Backing up database '$DB_NAME' from container '$CONTAINER'..."
# --format=plain piped through gzip (not pg_dump -Fc) so the artifact is
# restorable with nothing beyond `psql` + `gunzip` on any machine, matching
# the disaster-recovery assumption that the restore tool itself may not be
# available if this dump is ever needed on a fresh host.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" --no-owner --no-privileges "$DB_NAME" | gzip -9 > "$OUT_DIR/$FILENAME"

SIZE=$(du -h "$OUT_DIR/$FILENAME" | cut -f1)
echo "Backup written: $OUT_DIR/$FILENAME ($SIZE)"

# Integrity check: a valid gzip that ungzips cleanly and starts with a
# PostgreSQL dump header. Cheap, catches truncated/corrupt writes immediately
# rather than at restore time when it's too late to re-run the backup.
if ! gzip -t "$OUT_DIR/$FILENAME"; then
  echo "ERROR: backup file failed gzip integrity check" >&2
  exit 1
fi

# `|| true` matters here: `head -c` closes its input early once it has enough
# bytes, which sends gunzip a SIGPIPE — under `set -o pipefail` that makes the
# whole pipeline report failure even though grep matched correctly. Without
# this, a perfectly valid backup would fail its own integrity check.
HEADER=$(gunzip -c "$OUT_DIR/$FILENAME" 2>/dev/null | head -c 4096 || true)
if ! printf '%s' "$HEADER" | grep -q "PostgreSQL database dump"; then
  echo "ERROR: backup file does not look like a pg_dump plain-SQL archive" >&2
  exit 1
fi
echo "Integrity check passed."

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$OUT_DIR/$FILENAME" -out "$OUT_DIR/$FILENAME.enc" -pass env:BACKUP_ENCRYPTION_KEY
  echo "Encrypted copy written: $OUT_DIR/$FILENAME.enc (upload this one off-site, not the plaintext)"
fi

# Retention: keep the most recent 30 daily backups, prune older ones. Adjust
# to match your actual RPO/compliance requirement before relying on this in
# production — 30 is a reasonable local-dev/demo default, not a policy.
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-30}"
ls -1t "$OUT_DIR"/weighbridge-"${DB_NAME}"-*.sql.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | while read -r old; do
  echo "Pruning old backup: $old"
  rm -f "$old" "$old.enc"
done

echo "Done."

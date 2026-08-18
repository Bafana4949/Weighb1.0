#!/usr/bin/env bash
# Restores a backup produced by backup-postgres.sh into a NEW, throwaway
# database by default — never the live one — so testing a restore can never
# accidentally destroy production/working data. Restoring on top of an
# existing database (including the live one) requires two explicit,
# separate opt-ins (see --target and --i-understand-this-overwrites-target
# below); this script refuses to run destructively by accident.
#
# Recommended normal use (safe, non-destructive, proves the backup works):
#   scripts/backup/restore-postgres.sh backups/weighbridge-weighbridge-20260728T120000Z.sql.gz
#   -> restores into a fresh database named weighbridge_restore_test_<timestamp>
#      inside the same postgres container, leaves the live database untouched.
#
# Destructive use (only when you actually mean it):
#   scripts/backup/restore-postgres.sh <file> --target weighbridge --i-understand-this-overwrites-target
set -euo pipefail

FILE="${1:?Usage: restore-postgres.sh <path-to-backup.sql.gz> [--target DB_NAME --i-understand-this-overwrites-target]}"
shift || true

CONTAINER="${POSTGRES_CONTAINER:-weighbridge-system-postgres-1}"
DB_USER="${POSTGRES_USER:-weighbridge}"
TARGET_DB=""
CONFIRMED_OVERWRITE="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET_DB="$2"; shift 2 ;;
    --i-understand-this-overwrites-target) CONFIRMED_OVERWRITE="true"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ ! -f "$FILE" ]; then
  echo "ERROR: backup file not found: $FILE" >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container '$CONTAINER' is not running." >&2
  exit 1
fi

if [ -z "$TARGET_DB" ]; then
  TARGET_DB="weighbridge_restore_test_$(date -u +%Y%m%dT%H%M%SZ)"
  echo "No --target given: restoring into a NEW, throwaway database '$TARGET_DB' (the live database is not touched)."
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$TARGET_DB\";"
else
  EXISTS=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET_DB'")
  if [ "$EXISTS" = "1" ]; then
    if [ "$CONFIRMED_OVERWRITE" != "true" ]; then
      echo "ERROR: target database '$TARGET_DB' already exists. Restoring into it will overwrite its current contents." >&2
      echo "Re-run with --i-understand-this-overwrites-target if that is genuinely what you want." >&2
      exit 1
    fi
    echo "Restoring on top of EXISTING database '$TARGET_DB' (explicitly confirmed)."
  else
    docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$TARGET_DB\";"
  fi
fi

echo "Restoring $FILE into '$TARGET_DB' ..."
gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q

TABLE_COUNT=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TARGET_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "Restore complete. '$TARGET_DB' now has $TABLE_COUNT tables in the public schema."
echo "Verify application-level correctness (row counts, a few known rows) before trusting this restore, then drop the throwaway database when done:"
echo "  docker exec $CONTAINER psql -U $DB_USER -d postgres -c 'DROP DATABASE \"$TARGET_DB\";'"

#!/usr/bin/env bash
# Verifies a backup produced by backup-postgres.sh WITHOUT touching any live
# database: gzip integrity, PostgreSQL dump header, and a statement count so
# an empty/truncated dump is caught before anyone trusts it as a real backup.
#
# Usage: scripts/backup/verify-backup.sh <path-to-backup.sql.gz>
set -euo pipefail

FILE="${1:?Usage: verify-backup.sh <path-to-backup.sql.gz>}"

if [ ! -f "$FILE" ]; then
  echo "ERROR: file not found: $FILE" >&2
  exit 1
fi

echo "Verifying $FILE ..."

if ! gzip -t "$FILE"; then
  echo "FAIL: gzip integrity check failed — the file is truncated or corrupt" >&2
  exit 1
fi
echo "  gzip integrity: OK"

# `|| true`: see backup-postgres.sh — head -c closing early SIGPIPEs gunzip,
# which pipefail would otherwise misreport as this check having failed.
HEADER=$(gunzip -c "$FILE" 2>/dev/null | head -c 4096 || true)
if ! printf '%s' "$HEADER" | grep -q "PostgreSQL database dump"; then
  echo "FAIL: does not look like a pg_dump plain-SQL archive" >&2
  exit 1
fi
echo "  dump header: OK"

TABLE_COUNT=$(gunzip -c "$FILE" | grep -c "^CREATE TABLE " || true)
INSERT_LINES=$(gunzip -c "$FILE" | grep -cE "^(INSERT INTO|COPY )" || true)
echo "  tables found in dump: $TABLE_COUNT"
echo "  data statements found: $INSERT_LINES"

if [ "$TABLE_COUNT" -lt 1 ]; then
  echo "FAIL: dump contains no CREATE TABLE statements — this is not a usable backup" >&2
  exit 1
fi

echo "PASS: $FILE looks like a valid, non-empty PostgreSQL backup."

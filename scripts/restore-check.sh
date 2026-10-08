#!/usr/bin/env bash
# Proves a backup can be restored (Phase F): restores a dump into a throwaway PostgreSQL 18 container on this machine, then compares
# every table's row count with the manifest written next to it. A backup nobody has restored is only a hope.
#
# Usage:  scripts/restore-check.sh <ironlog-....dump> [manifest]      (the manifest defaults to the dump's name with .manifest)
# Needs Docker. Touches nothing but its own container, which it removes afterwards. Prints "RESTORE OK" or what differs.
set -euo pipefail

dump="${1:?Usage: scripts/restore-check.sh <dump file> [manifest file]}"
manifest="${2:-${dump%.dump}.manifest}"
[ -f "$dump" ] || { echo "No such file: $dump" >&2; exit 2; }
[ -f "$manifest" ] || { echo "No manifest next to it: $manifest" >&2; exit 2; }

name="iron-log-restore-check-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore postgres:18 >/dev/null
# The image starts a temporary server while it initialises (socket only), then the real one: only the real one listens on TCP.
for _ in $(seq 1 90); do docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d restore >/dev/null 2>&1 && break; sleep 1; done
# No -i: inside the loop below, a command that reads stdin would swallow the rest of the manifest and silently check one table.
psql_in() { docker exec "$name" psql -h 127.0.0.1 -U postgres -d restore -v ON_ERROR_STOP=1 "$@"; }

# The policies and grants in the dump name the API's role, which a fresh server does not have.
psql_in -c "create role ironlog_app nologin" >/dev/null
docker cp "$dump" "$name:/tmp/backup.dump"
# --no-owner --no-privileges matches how it was dumped; errors are shown, not hidden.
docker exec "$name" pg_restore -h 127.0.0.1 -U postgres -d restore --no-owner --no-privileges --exit-on-error /tmp/backup.dump

fail=0
checked=0
while IFS=$'\t' read -r table want; do
  [ -n "$table" ] || continue
  schema="${table%%.*}"; rel="${table#*.}"
  checked=$((checked + 1))
  got="$(psql_in -tA -c "select count(*) from \"$schema\".\"$rel\"")"
  if [ "$got" != "$want" ]; then echo "DIFFERENT: $table has $got rows, the manifest says $want"; fail=1; fi
done < "$manifest"
tables="$(grep -c . "$manifest")"
if [ "$checked" != "$tables" ]; then echo "RESTORE CHECK FAILED: checked $checked of $tables tables"; exit 1; fi
if [ "$fail" = 0 ]; then echo "RESTORE OK: $tables tables restored, every row count matches the manifest."; else echo "RESTORE CHECK FAILED"; exit 1; fi

#!/bin/sh
# One nightly backup of the Iron Log database (Phase F). Runs as a Cloud Run Job (scripts/backup-cloud-run.sh), or by hand to a folder.
#
# Writes two files, together:
#   ironlog-<UTC time>.dump       pg_dump custom format, restorable with pg_restore (scripts/restore-check.sh)
#   ironlog-<UTC time>.manifest   one line per table with its row count, so a restore can be checked against it
# To Cloud Storage when BACKUP_BUCKET is set (authenticating as the job's service account), else to BACKUP_OUT_DIR.
#
# Left out on purpose: the contents of auth.session and auth.verification. They hold live session tokens, so a copy of the backup
# must not be a way to sign in as someone. Everything else is kept, including the encrypted Google tokens (useless without the
# BETTER_AUTH_SECRET). It fails loudly, never leaving a small or empty file looking like a good backup.
set -eu

: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL: the UNPOOLED connection string of a role that can read every table (not the pooler: pg_dump needs a real session)}"
if [ -z "${BACKUP_BUCKET:-}" ] && [ -z "${BACKUP_OUT_DIR:-}" ]; then echo "Set BACKUP_BUCKET (Cloud Storage) or BACKUP_OUT_DIR (a folder)." >&2; exit 2; fi
MIN_BYTES="${BACKUP_MIN_BYTES:-20000}"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
dump="$work/ironlog-$stamp.dump"
manifest="$work/ironlog-$stamp.manifest"

echo "Dumping ..."
pg_dump --format=custom --no-owner --no-privileges \
  --exclude-table-data='auth.session' --exclude-table-data='auth.verification' \
  --file "$dump" "$BACKUP_DATABASE_URL"
size="$(wc -c < "$dump" | tr -d ' ')"
if [ "$size" -lt "$MIN_BYTES" ]; then echo "The dump is only $size bytes (expected at least $MIN_BYTES). Not keeping it." >&2; exit 1; fi

# Exact row counts, one line per table: "schema.table<TAB>rows". Sessions are not backed up, so they are not counted.
psql "$BACKUP_DATABASE_URL" -v ON_ERROR_STOP=1 -tA -F "$(printf '\t')" <<'SQL' > "$manifest"
select schemaname || '.' || relname,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname), false, true, '')))[1]::text::bigint
  from pg_stat_user_tables
 where schemaname in ('public', 'auth') and relname not in ('session', 'verification')
 order by 1;
SQL
tables="$(wc -l < "$manifest" | tr -d ' ')"
if [ "$tables" -lt 10 ]; then echo "The manifest lists only $tables tables, which is too few for this database. Not keeping the backup." >&2; exit 1; fi

if [ -n "${BACKUP_OUT_DIR:-}" ]; then
  mkdir -p "$BACKUP_OUT_DIR"
  cp "$dump" "$manifest" "$BACKUP_OUT_DIR/"
  echo "Wrote $BACKUP_OUT_DIR/ironlog-$stamp.dump ($size bytes, $tables tables)"
  exit 0
fi

# Cloud Storage, as the job's own service account: its token comes from the metadata server. Manifest second: a dump with no
# manifest is an incomplete run, a manifest with no dump never happens.
token="$(curl -sf -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
[ -n "$token" ] || { echo "Could not get a Cloud Storage token." >&2; exit 1; }
for f in "$dump" "$manifest"; do
  name="$(basename "$f")"
  curl -sf -X POST -H "Authorization: Bearer $token" --data-binary "@$f" \
    "https://storage.googleapis.com/upload/storage/v1/b/$BACKUP_BUCKET/o?uploadType=media&name=$name" > /dev/null
  echo "Uploaded gs://$BACKUP_BUCKET/$name"
done
echo "Backup done: $size bytes, $tables tables."

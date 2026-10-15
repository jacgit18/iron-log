#!/usr/bin/env bash
# Production database chores, run by hand (docs: deploy-runbook.md, section 8). Nothing is written without --apply, and every write takes
# a backup first. No prompts, so each command runs as one line.
#
# Usage:  scripts/prod-db.sh <command> [--apply]     (or: npm run prod:db -- <command> [--apply])
#   status                      which migrations production has applied ([X]) and which wait ([ ]). Read-only.
#   pending                     prints the waiting migration files; exit 0 when none wait, 3 when some do. Run it before a deploy:
#                               a migration must be applied BEFORE the code that needs it goes live.
#   migrate [--apply]           lists what waits; with --apply: a backup, then dbmate up, then the status again.
#   catalog <source> [--apply]  npm run catalog:import against production (source: fedb): a dry run, or with --apply a backup, then the write.
#   injury-default [--apply]    one-off (ADR 045): npm run keep:injury-prevention against production: a dry run, or with --apply a backup, then
#                               the write (existing accounts keep Injury prevention on). Run right before deploying that change.
#   encrypt-users [--apply]     one-off (ADR 046): npm run encrypt:users against production: a dry run, or with --apply a backup, then the write
#                               (seals the names and emails already stored). The key is read from Secret Manager (iron-log-pii-key) and never
#                               shown. Run it after the deploy that carries the key; then set PII_PLAINTEXT_DONE=true (runbook section 20).
#   reader [--apply]            with --apply: make (or re-key) the read-only role the CI deploy uses to see which migrations production
#                               has, and store its URL in the GitHub secret MIGRATIONS_CHECK_URL (environment production), never shown.
#                               It changes a login, not data, so it takes no backup.
#
# The owner URL is PROD_DATABASE_URL, or else DATABASE_URL_UNPOOLED from .env; it is never printed. Backups run
# scripts/backup-cloud-run.sh run (PROJECT_ID defaults to iron-log-jacgit18). It refuses a database on this machine: that is not production.
set -euo pipefail

cd "$(dirname "$0")/.."
export PROJECT_ID="${PROJECT_ID:-iron-log-jacgit18}"
DBMATE="${DBMATE:-npx dbmate}"                     # overridable for tests
BACKUP="${BACKUP:-scripts/backup-cloud-run.sh}"
CATALOG_IMPORT="${CATALOG_IMPORT:-npm run -s catalog:import --}"
KEEP_INJURY="${KEEP_INJURY:-npm run -s keep:injury-prevention --}"
ENCRYPT_USERS="${ENCRYPT_USERS:-npm run -s encrypt:users --}"
PII_KEY_CMD="${PII_KEY_CMD:-gcloud --project $PROJECT_ID secrets versions access latest --secret iron-log-pii-key}"   # overridable for tests
DB_READER="${DB_READER:-node scripts/db-reader.mjs}"
GH="${GH:-gh}"
READER_SECRET=MIGRATIONS_CHECK_URL                  # read by the deploy workflow's migration check

usage() { sed -n '5,18p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

owner_url() {
  local url="${PROD_DATABASE_URL:-}"
  if [ -z "$url" ] && [ -f .env ]; then url="$(grep '^DATABASE_URL_UNPOOLED=' .env | head -1 | cut -d= -f2- | tr -d "\"'")"; fi
  if [ -z "$url" ]; then echo "No production URL: set DATABASE_URL_UNPOOLED in .env (or PROD_DATABASE_URL)." >&2; exit 2; fi
  case "$url" in
    *@localhost[:/]*|*@127.0.0.1[:/]*|*@\[::1\][:/]*) echo "Refusing: that URL is a database on this machine, not production." >&2; exit 2 ;;
  esac
  printf '%s' "$url"
}

URL=""
dbmate() { DATABASE_URL="$URL" DBMATE_NO_DUMP_SCHEMA=true DBMATE_MIGRATIONS_DIR=db/migrations $DBMATE "$@"; }
# Where production is, without the credentials.
where() { local h="${URL##*@}"; echo "database: ${h%%\?*}"; }
waiting() { dbmate status | sed -n 's/^\[ \] //p'; }
backup() { echo "Backing up production first ($BACKUP run)..."; "$BACKUP" run; }

cmd="${1:-}"; [ -n "$cmd" ] || usage
shift
apply=false
args=()
for a in "$@"; do if [ "$a" = "--apply" ]; then apply=true; else args+=("$a"); fi; done

case "$cmd" in
  status)
    URL="$(owner_url)"; where; dbmate status ;;
  pending)
    URL="$(owner_url)"
    list="$(waiting)"
    if [ -z "$list" ]; then echo "No migrations waiting."; exit 0; fi
    echo "$list"; exit 3 ;;
  migrate)
    URL="$(owner_url)"; where
    list="$(waiting)"
    if [ -z "$list" ]; then echo "No migrations waiting. Nothing to do."; exit 0; fi
    echo "Waiting:"; echo "$list" | sed 's/^/  /'
    if ! $apply; then echo "Dry run: add --apply to back up and apply them."; exit 0; fi
    backup
    dbmate up
    dbmate status ;;
  reader)
    URL="$(owner_url)"; where
    if ! $apply; then
      echo "Dry run: --apply makes (or gives a new password to) the read-only role migrations_reader, which can read schema_migrations"
      echo "and nothing else, and stores its URL as the GitHub secret $READER_SECRET (environment production) without showing it."
      exit 0
    fi
    # From the script into the secret: the URL never reaches the screen or a file, and a failure sets nothing.
    reader_url="$(DATABASE_URL="$URL" $DB_READER)"
    [ -n "$reader_url" ] || { echo "No URL came back; the secret was not changed." >&2; exit 1; }
    printf '%s' "$reader_url" | $GH secret set "$READER_SECRET" --env production
    echo "Done: $READER_SECRET is set. The next deploy asks production itself which migrations wait." ;;
  catalog)
    source="${args[0]:-}"; [ -n "$source" ] || usage
    URL="$(owner_url)"
    if $apply; then backup; DATABASE_URL="$URL" $CATALOG_IMPORT --source "$source" --apply
    else DATABASE_URL="$URL" $CATALOG_IMPORT --source "$source"; fi ;;
  injury-default)
    URL="$(owner_url)"
    if $apply; then backup; DATABASE_URL="$URL" $KEEP_INJURY --apply
    else DATABASE_URL="$URL" $KEEP_INJURY; fi ;;
  encrypt-users)
    URL="$(owner_url)"; where
    # The key goes from Secret Manager into the one command's environment: not printed, not written anywhere.
    key="$($PII_KEY_CMD)"
    [ -n "$key" ] || { echo "No key came back from Secret Manager; nothing was changed." >&2; exit 1; }
    if $apply; then backup; DATABASE_URL="$URL" PII_ENCRYPTION_KEY="$key" $ENCRYPT_USERS --apply
    else DATABASE_URL="$URL" PII_ENCRYPTION_KEY="$key" $ENCRYPT_USERS; fi ;;
  *) usage ;;
esac

#!/usr/bin/env bash
# Production database chores, run by hand (docs: deploy-runbook.md, section 8). Nothing is written without --apply, and every write takes
# a backup first. No prompts, so each command runs as one line.
#
# Usage:  scripts/prod-db.sh <command> [--apply]
#   status                      which migrations production has applied ([X]) and which wait ([ ]). Read-only.
#   pending                     prints the waiting migration files; exit 0 when none wait, 3 when some do. Run it before a deploy:
#                               a migration must be applied BEFORE the code that needs it goes live.
#   migrate [--apply]           lists what waits; with --apply: a backup, then dbmate up, then the status again.
#   catalog <source> [--apply]  npm run catalog:import against production (source: fedb): a dry run, or with --apply a backup, then the write.
#
# The owner URL is PROD_DATABASE_URL, or else DATABASE_URL_UNPOOLED from .env; it is never printed. Backups run
# scripts/backup-cloud-run.sh run (PROJECT_ID defaults to iron-log-jacgit18). It refuses a database on this machine: that is not production.
set -euo pipefail

cd "$(dirname "$0")/.."
export PROJECT_ID="${PROJECT_ID:-iron-log-jacgit18}"
DBMATE="${DBMATE:-npx dbmate}"                     # overridable for tests
BACKUP="${BACKUP:-scripts/backup-cloud-run.sh}"
CATALOG_IMPORT="${CATALOG_IMPORT:-npm run -s catalog:import --}"

usage() { sed -n '4,10p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

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
  catalog)
    source="${args[0]:-}"; [ -n "$source" ] || usage
    URL="$(owner_url)"
    if $apply; then backup; DATABASE_URL="$URL" $CATALOG_IMPORT --source "$source" --apply
    else DATABASE_URL="$URL" $CATALOG_IMPORT --source "$source"; fi ;;
  *) usage ;;
esac

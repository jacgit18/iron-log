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
#   beta-to-free [--apply]      one-off (billing go-live): npm run beta:to-free against production: a dry run that prints how many accounts are on
#                               beta (ids only), or with --apply a backup, then every beta account moves to free so it can subscribe. Run it after
#                               the default-free migration (`migrate --apply`) and before opening billing to everyone.
#   encrypt-users [--apply]     one-off (ADR 046): npm run encrypt:users against production: a dry run, or with --apply a backup, then the write
#                               (seals the names and emails already stored). The key is read from Secret Manager (iron-log-pii-key) and never
#                               shown. Run it after the deploy that carries the key; then set PII_PLAINTEXT_DONE=true (runbook section 20).
#   find-user <email>           read-only: the id, plan, admin flag and dates of the account behind one address (npm run find:user against
#                               production). Names and emails are sealed, so the key is read from Secret Manager into this one command and
#                               never shown; the address and name are not printed either. Takes no backup.
#   store-owner-url [--apply]   with --apply: store production's owner URL (from PROD_DATABASE_URL or the old .env line) in Secret Manager as
#                               iron-log-prod-owner-url, never shown. Afterwards this script fetches it for each run, and you delete the .env line.
#   reader [--apply]            with --apply: make (or re-key) the read-only role the CI deploy uses to see which migrations production
#                               has, and store its URL in the GitHub secret MIGRATIONS_CHECK_URL (environment production), never shown.
#                               It changes a login, not data, so it takes no backup.
#
# The owner URL is PROD_DATABASE_URL, else fetched from Secret Manager (iron-log-prod-owner-url) on demand, else (with a warning) the old
# DATABASE_URL_UNPOOLED line in .env; it is never printed. Backups run
# scripts/backup-cloud-run.sh run (PROJECT_ID defaults to iron-log-jacgit18). It refuses a database on this machine: that is not production.
set -euo pipefail

cd "$(dirname "$0")/.."
export PROJECT_ID="${PROJECT_ID:-iron-log-jacgit18}"
DBMATE="${DBMATE:-npx dbmate}"                     # overridable for tests
BACKUP="${BACKUP:-scripts/backup-cloud-run.sh}"
CATALOG_IMPORT="${CATALOG_IMPORT:-npm run -s catalog:import --}"
KEEP_INJURY="${KEEP_INJURY:-npm run -s keep:injury-prevention --}"
ENCRYPT_USERS="${ENCRYPT_USERS:-npm run -s encrypt:users --}"
BETA_TO_FREE="${BETA_TO_FREE:-npm run -s beta:to-free --}"
FIND_USER="${FIND_USER:-npm run -s find:user --}"
PII_KEY_CMD="${PII_KEY_CMD:-gcloud --project $PROJECT_ID secrets versions access latest --secret iron-log-pii-key}"   # overridable for tests
DB_READER="${DB_READER:-node scripts/db-reader.mjs}"
GH="${GH:-gh}"
READER_SECRET=MIGRATIONS_CHECK_URL                  # read by the deploy workflow's migration check
PROD_URL_SECRET="${PROD_URL_SECRET:-iron-log-prod-owner-url}"   # Secret Manager: production's owner URL (secrets-and-keys-hygiene brief, item 2)
FETCH_URL="${FETCH_URL:-gcloud --quiet --project $PROJECT_ID secrets versions access latest --secret $PROD_URL_SECRET}"   # overridable for tests; --quiet: never an invisible prompt
ENV_FILE="${ENV_FILE:-.env}"                                  # the old place for the owner URL (tests point it elsewhere)
GCLOUD="${GCLOUD:-gcloud}"                                  # overridable for tests

usage() { sed -n '5,/^#$/{/^#$/!p}' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

# Production's owner URL: PROD_DATABASE_URL, else fetched from Secret Manager on demand (never stored on this machine), else, for now, the
# old DATABASE_URL_UNPOOLED line in .env (with a warning: move it with `store-owner-url`, then delete the line).
owner_url() {
  local url="${PROD_DATABASE_URL:-}"
  # stdin closed and stderr hidden: a signed-out gcloud must fail quietly (falling back to .env), not wait on a prompt nobody can see.
  if [ -z "$url" ]; then url="$($FETCH_URL </dev/null 2>/dev/null || true)"; fi
  if [ -z "$url" ] && [ -f "$ENV_FILE" ]; then
    url="$(grep '^DATABASE_URL_UNPOOLED=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d "\"'")"
    if [ -n "$url" ]; then echo "Warning: using the production URL in .env. Move it: scripts/prod-db.sh store-owner-url --apply, then delete the DATABASE_URL_UNPOOLED line from .env." >&2; fi
  fi
  if [ -z "$url" ]; then echo "No production URL: set PROD_DATABASE_URL, or store it in Secret Manager as $PROD_URL_SECRET (scripts/prod-db.sh store-owner-url) and sign in with gcloud." >&2; exit 2; fi
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
  store-owner-url)
    URL="$(owner_url)"; where
    case "$URL" in *-pooler*) echo "That is the pooled URL. Store the unpooled one (no -pooler in the host): dbmate and pg_dump need a real session." >&2; exit 2;; esac
    if ! $apply; then
      echo "Dry run: --apply stores this URL in Secret Manager as $PROD_URL_SECRET without showing it (a new version if it already exists)."
      echo "No service account is granted it: only people with the project's owner rights can read it. Afterwards delete the DATABASE_URL_UNPOOLED"
      echo "line from .env; this script then fetches the URL for each run."
      exit 0
    fi
    $GCLOUD --project "$PROJECT_ID" secrets describe "$PROD_URL_SECRET" >/dev/null 2>&1 || $GCLOUD --project "$PROJECT_ID" secrets create "$PROD_URL_SECRET" --replication-policy=automatic >/dev/null
    printf '%s' "$URL" | $GCLOUD --project "$PROJECT_ID" secrets versions add "$PROD_URL_SECRET" --data-file=- >/dev/null
    echo "Done: $PROD_URL_SECRET is stored. Delete the DATABASE_URL_UNPOOLED line from .env, then try: scripts/prod-db.sh status" ;;
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
  beta-to-free)
    URL="$(owner_url)"; where
    if $apply; then backup; DATABASE_URL="$URL" $BETA_TO_FREE --apply
    else DATABASE_URL="$URL" $BETA_TO_FREE; fi ;;
  encrypt-users)
    URL="$(owner_url)"; where
    # The key goes from Secret Manager into the one command's environment: not printed, not written anywhere.
    key="$($PII_KEY_CMD)"
    [ -n "$key" ] || { echo "No key came back from Secret Manager; nothing was changed." >&2; exit 1; }
    if $apply; then backup; DATABASE_URL="$URL" PII_ENCRYPTION_KEY="$key" $ENCRYPT_USERS --apply
    else DATABASE_URL="$URL" PII_ENCRYPTION_KEY="$key" $ENCRYPT_USERS; fi ;;
  find-user)
    email="${args[0]:-}"; [ -n "$email" ] || usage
    URL="$(owner_url)"; where
    key="$($PII_KEY_CMD)"
    [ -n "$key" ] || { echo "No key came back from Secret Manager; nothing was read." >&2; exit 1; }
    DATABASE_URL="$URL" PII_ENCRYPTION_KEY="$key" $FIND_USER "$email" ;;
  *) usage ;;
esac

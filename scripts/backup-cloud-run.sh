#!/usr/bin/env bash
# Nightly backups of the production database to a private Cloud Storage bucket (Phase F). Neon's free plan keeps only 6 hours of history
# and no scheduled snapshots, so this is the copy that outlives a mistake you notice tomorrow.
#
# Usage:  PROJECT_ID=iron-log-jacgit18 scripts/backup-cloud-run.sh <command>
#   setup    enable the APIs; make the private bucket (files deleted after 23 days, recoverable by an operator for 7 more), the service account and its limited rights
#   secret   store the database URL the job reads (BACKUP_DATABASE_URL in your shell: the UNPOOLED owner URL of the production branch)
#   deploy   build the job image, create or update the job, and schedule it every night (3:15 AM New York)
#   run      run a backup now and wait for it
#   list     show the backups in the bucket
#   fetch    download the newest dump and manifest into ./backups/ (git-ignored), ready for scripts/restore-check.sh
#
# Cost: all inside the free tiers at this size (a dump is well under 1 MB): Cloud Storage's 5 GB in a US region, three scheduler jobs,
# a few seconds of Cloud Run job time a night. The budget alert from the deploy runbook covers it.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log-jacgit18}"
REGION="${REGION:-us-central1}"   # a US region, so the bucket stays in Cloud Storage's always-free tier
JOB="${JOB:-iron-log-backup}"
REPO="${REPO:-iron-log}"
BUCKET="${BUCKET:-${PROJECT_ID}-iron-log-backups}"
SA="iron-log-backup@${PROJECT_ID}.iam.gserviceaccount.com"
SECRET="iron-log-backup-database-url"
# The privacy policy promises that erased data is gone from backups within 30 days. A file the bucket deletes stays recoverable for the
# soft-delete period (an undo for a mistaken delete, readable by project owners only), so the two add up to the promise: 23 + 7 = 30.
# server/legal.test.ts checks that. The soft-delete period is set explicitly, so Google changing its default cannot change the promise.
RETENTION_DAYS="${RETENTION_DAYS:-23}"
SOFT_DELETE_DAYS="${SOFT_DELETE_DAYS:-7}"

gc() { gcloud --project "$PROJECT_ID" "$@"; }

cmd_setup() {
  gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
    cloudscheduler.googleapis.com storage.googleapis.com
  gc iam service-accounts describe "$SA" >/dev/null 2>&1 || gc iam service-accounts create iron-log-backup --display-name "Iron Log nightly backup"
  if ! gc storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
    # Private: uniform access, public access prevented. Files older than the retention are deleted by the bucket itself.
    gc storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access --public-access-prevention \
      --soft-delete-duration "${SOFT_DELETE_DAYS}d"
  fi
  local rules; rules="$(mktemp)"
  printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%s}}]}' "$RETENTION_DAYS" > "$rules"
  gc storage buckets update "gs://$BUCKET" --lifecycle-file "$rules" --soft-delete-duration "${SOFT_DELETE_DAYS}d" >/dev/null
  rm -f "$rules"
  # The job may create files and nothing else: it cannot read, overwrite or delete a backup.
  gc storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" --role roles/storage.objectCreator >/dev/null
  echo "Set up: bucket gs://$BUCKET (kept $RETENTION_DAYS days, then $SOFT_DELETE_DAYS more recoverable by an operator), service account $SA. Next: scripts/backup-cloud-run.sh secret"
}

cmd_secret() {
  : "${BACKUP_DATABASE_URL:?Export BACKUP_DATABASE_URL: the UNPOOLED owner URL of the production branch (pg_dump needs a real session, not the pooler)}"
  case "$BACKUP_DATABASE_URL" in
    *-pooler*) echo "That is the pooled URL. pg_dump needs the unpooled one (no -pooler in the host)." >&2; exit 1;;
    *127.0.0.1*|*localhost*) echo "That points at this machine. Use the Neon production URL." >&2; exit 1;;
  esac
  gc secrets describe "$SECRET" >/dev/null 2>&1 || gc secrets create "$SECRET" --replication-policy=automatic >/dev/null
  printf '%s' "$BACKUP_DATABASE_URL" | gc secrets versions add "$SECRET" --data-file=- >/dev/null
  gc secrets add-iam-policy-binding "$SECRET" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
  echo "Secret stored; only $SA can read it. Next: scripts/backup-cloud-run.sh deploy"
}

cmd_deploy() {
  local image tag
  tag="$(git rev-parse --short HEAD)"
  if [ -n "$(git status --porcelain backup cloudbuild-backup.yaml)" ]; then echo "backup/ has uncommitted changes. Commit first." >&2; exit 1; fi
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/backup:${tag}"
  gc builds submit --config cloudbuild-backup.yaml --substitutions "_IMAGE=${image}" .
  local verb=create
  gc run jobs describe "$JOB" --region "$REGION" >/dev/null 2>&1 && verb=update
  gc run jobs "$verb" "$JOB" --region "$REGION" --image "$image" --service-account "$SA" \
    --set-secrets "BACKUP_DATABASE_URL=${SECRET}:latest" --set-env-vars "BACKUP_BUCKET=${BUCKET}" \
    --max-retries 1 --task-timeout 600 --cpu 1 --memory 512Mi
  # Cloud Scheduler starts it with the same service account, which may start this one job and nothing else.
  gc run jobs add-iam-policy-binding "$JOB" --region "$REGION" --member "serviceAccount:$SA" --role roles/run.invoker >/dev/null
  local uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB}:run"
  local sverb=create
  gc scheduler jobs describe "$JOB" --location "$REGION" >/dev/null 2>&1 && sverb=update
  gc scheduler jobs "$sverb" http "$JOB" --location "$REGION" --schedule "15 3 * * *" --time-zone "America/New_York" \
    --uri "$uri" --http-method POST --oauth-service-account-email "$SA"
  echo "Deployed. A backup runs every night at 3:15 AM New York. Try one now: scripts/backup-cloud-run.sh run"
}

cmd_run() { gc run jobs execute "$JOB" --region "$REGION" --wait; }
cmd_list() { gc storage ls -l "gs://$BUCKET/"; }
cmd_fetch() {
  mkdir -p backups
  local newest; newest="$(gc storage ls "gs://$BUCKET/ironlog-*.dump" | sort | tail -1)"
  [ -n "$newest" ] || { echo "No backups in gs://$BUCKET yet." >&2; exit 1; }
  gc storage cp "$newest" "${newest%.dump}.manifest" backups/
  echo "Downloaded to backups/. Check it restores: scripts/restore-check.sh backups/$(basename "$newest")"
}

case "${1:-}" in
  setup) cmd_setup;; secret) cmd_secret;; deploy) cmd_deploy;; run) cmd_run;; list) cmd_list;; fetch) cmd_fetch;;
  *) sed -n '2,13p' "$0"; exit 2;;
esac

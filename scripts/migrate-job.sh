#!/usr/bin/env bash
# The production migrate job (brief production-migrate-job, option B of ADR 068): a Cloud Run job that applies pending migrations to production with
# the OWNER login, which lives only in Secret Manager. The approved production deploy hands it the commit's migration files through a private
# bucket and starts it; the CI deployer can do those two things and cannot read the owner login or change the job. You run these by hand once;
# after that only .github/workflows/deploy-cloud-run.yml uses the job.
#
# Usage:  PROJECT_ID=iron-log-jacgit18 scripts/migrate-job.sh <command>
#   setup    enable the APIs; make the job's service account, the private bucket, and the account's rights: read the bucket, read the production
#            owner URL (iron-log-prod-owner-url) and the production read-only URL (iron-log-parity-production-url), nothing else
#   deploy   build the job image (as the build-only account), create or update the job. Then run scripts/ci-deploy-setup.sh again: it gives the
#            CI deployer run-only (no overrides) on this job and write on the bucket
#   run      prove the whole path by hand: copies this checkout's db/migrations to the bucket (refused unless you are on main and match
#            origin/main, so an unmerged migration can never be applied) and starts the job. With nothing pending it applies nothing and says so
#   check    print who can read the two secrets, the bucket and who can run the job (should be: the job's account, and the deployer for the
#            bucket and the run right only)
#
# Cost: a few seconds of Cloud Run job time per migrating deploy, a bucket of a few kilobytes. Inside the free tiers.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log-jacgit18}"
REGION="${REGION:-us-central1}"
JOB="${JOB:-iron-log-migrate}"
REPO="${REPO:-iron-log}"
BUCKET="${BUCKET:-${PROJECT_ID}-iron-log-migrations}"
SA="iron-log-migrate@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER="${DEPLOYER_SA:-iron-log-deployer@${PROJECT_ID}.iam.gserviceaccount.com}"
OWNER_SECRET="${OWNER_SECRET:-iron-log-prod-owner-url}"
READER_SECRET="${READER_SECRET:-iron-log-parity-production-url}"

gc() { gcloud --project "$PROJECT_ID" "$@"; }
usage() { sed -n '2,18p' "$0"; exit 2; }

cmd_setup() {
  gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com
  gc iam service-accounts describe "$SA" >/dev/null 2>&1 || gc iam service-accounts create iron-log-migrate --display-name "Iron Log production migrate job"
  if ! gc storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
    # Private: uniform access, public access prevented. It holds migration SQL only (no user data), overwritten on every migrating deploy.
    gc storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
  fi
  gc storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" --role roles/storage.objectViewer >/dev/null
  local s
  for s in "$OWNER_SECRET" "$READER_SECRET"; do
    gc secrets describe "$s" >/dev/null 2>&1 || { echo "Secret $s does not exist. Store it first (owner URL: scripts/prod-db.sh store-owner-url --apply; read-only URL: scripts/parity-job.sh reader production --host <host>)." >&2; exit 1; }
    gc secrets add-iam-policy-binding "$s" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
  done
  echo "Set up: account $SA, bucket gs://$BUCKET. Next: scripts/migrate-job.sh deploy, then scripts/ci-deploy-setup.sh again."
}

cmd_deploy() {
  gc secrets describe "$OWNER_SECRET" >/dev/null 2>&1 || { echo "Missing secret $OWNER_SECRET." >&2; exit 1; }
  gc secrets describe "$READER_SECRET" >/dev/null 2>&1 || { echo "Missing secret $READER_SECRET." >&2; exit 1; }
  # The image is built from this checkout and runs with the production owner login, so it is built only from merged code: on main, matching
  # origin/main, for every file the image contains (the Dockerfile's COPY lines and its lockfile inputs).
  local files=(migrate cloudbuild-migrate.yaml scripts/migrate-run.mjs scripts/migration-guard.mjs scripts/same-database.mjs scripts/lib/db-script.mjs scripts/lib/migration-state.mjs scripts/lib/ssl-mode.mjs package.json package-lock.json)
  [ "$(git branch --show-current)" = main ] || { echo "Build the migrate job from main: it runs with the production owner login, so only merged code may go into it." >&2; exit 1; }
  git fetch -q origin main
  if [ -n "$(git status --porcelain -- "${files[@]}")" ] || [ -n "$(git diff origin/main -- "${files[@]}")" ]; then
    echo "The migrate job's files differ from origin/main (uncommitted or unmerged changes). Pull main first." >&2; exit 1
  fi
  local tag image; tag="$(git rev-parse --short HEAD)"
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/migrate:${tag}"
  # Build as the small build-only account, like the other jobs (audit 2026-10-23, deployer rights); the default Compute account is not used.
  local build_as=() build_sa="${BUILD_SA:-iron-log-build@${PROJECT_ID}.iam.gserviceaccount.com}"
  if gc iam service-accounts describe "$build_sa" >/dev/null 2>&1; then build_as=(--service-account "projects/${PROJECT_ID}/serviceAccounts/${build_sa}"); fi
  gc builds submit --config cloudbuild-migrate.yaml --substitutions "_IMAGE=${image}" ${build_as[@]+"${build_as[@]}"} .
  local verb=create
  gc run jobs describe "$JOB" --region "$REGION" >/dev/null 2>&1 && verb=update
  gc run jobs "$verb" "$JOB" --region "$REGION" --image "$image" --service-account "$SA" \
    --set-secrets "OWNER_DATABASE_URL=${OWNER_SECRET}:latest,READER_DATABASE_URL=${READER_SECRET}:latest" \
    --set-env-vars "MIGRATIONS_BUCKET=${BUCKET}" \
    --max-retries 0 --task-timeout 300 --cpu 1 --memory 512Mi
  echo "Deployed $JOB (image tag $tag). Now run scripts/ci-deploy-setup.sh again (the deployer's run-only right on the job and its write right on the bucket), then scripts/migrate-job.sh check and run."
}

cmd_run() {
  [ "$(git branch --show-current)" = main ] || { echo "Run this from main: it copies this checkout's migrations to the bucket, and only merged ones may be applied." >&2; exit 1; }
  git fetch -q origin main
  [ -z "$(git diff origin/main -- db/migrations)" ] && [ -z "$(git status --porcelain db/migrations)" ] || { echo "db/migrations differs from origin/main. Pull main first." >&2; exit 1; }
  gc storage rsync db/migrations "gs://${BUCKET}/current" --recursive --delete-unmatched-destination-objects
  git rev-parse HEAD | gc storage cp - "gs://${BUCKET}/current/COMMIT"
  gc run jobs execute "$JOB" --region "$REGION" --wait
}

cmd_check() {
  local s
  for s in "$OWNER_SECRET" "$READER_SECRET"; do
    echo "== who can read $s"
    gc secrets get-iam-policy "$s" --format='table(bindings.role,bindings.members)'
  done
  echo "== who can use gs://$BUCKET"
  gc storage buckets get-iam-policy "gs://$BUCKET" --format='table(bindings.role,bindings.members)'
  echo "== who can run $JOB (the deployer should hold roles/run.jobsExecutor, never ...WithOverrides, developer or admin)"
  gc run jobs get-iam-policy "$JOB" --region "$REGION" --format='table(bindings.role,bindings.members)'
  echo "== may $DEPLOYER act as $SA? (should print nothing)"
  gc iam service-accounts get-iam-policy "$SA" --flatten='bindings[].members' --filter="bindings.members:serviceAccount:$DEPLOYER" --format='value(bindings.role)'
}

case "${1:-}" in
  setup) cmd_setup;; deploy) cmd_deploy;; run) cmd_run;; check) cmd_check;;
  *) usage;;
esac

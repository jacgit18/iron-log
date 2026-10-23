#!/usr/bin/env bash
# The environment parity job (plan: env-parity-report-plan, brief: env-parity-report): a Cloud Run job that asks one database which
# migrations it has applied and says whether that matches main. You run these by hand; nothing here is run by CI except `run`'s
# equivalent inside .github/workflows/env-parity.yml (scripts/parity-run.sh).
#
# Usage:  PROJECT_ID=iron-log-jacgit18 scripts/parity-job.sh <command>
#   setup                    enable the APIs, make the job's service account (it may read the three reader secrets and nothing else)
#   reader <env> --host <h>  env is production, staging or qa. With OWNER_DATABASE_URL (the UNPOOLED owner URL of that environment's
#                            database) in your shell: makes the read-only login (scripts/db-reader.mjs: reads schema_migrations, nothing
#                            else) and stores its URL in Secret Manager as iron-log-parity-<env>-url, never showing it. --host is the host
#                            in the URL, typed on purpose to catch a mistyped one. Run it again to rotate the login.
#   deploy                   build the job image, create or update the job with the three secrets, let the CI deployer run it, and give the job's
#                            account the metadata-only secretmanager.viewer role (the secrets-name check lists names, never values)
#   run <env|secrets>        run one environment (or the secrets-name check) now and wait; the result is in the job's logs (console) and the exit code
#   check                    print who can read the three secrets (should be the parity account only) and who can run the job
#
# Cost: a few seconds of Cloud Run job time a day per environment and three secrets, inside the free tiers.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log-jacgit18}"
REGION="${REGION:-us-central1}"
JOB="${JOB:-iron-log-parity}"
REPO="${REPO:-iron-log}"
SA="iron-log-parity@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER="${DEPLOYER_SA:-iron-log-deployer@${PROJECT_ID}.iam.gserviceaccount.com}"
ENVS="production staging qa"

gc() { gcloud --project "$PROJECT_ID" "$@"; }
secret_name() { echo "iron-log-parity-$1-url"; }
usage() { sed -n '2,16p' "$0"; exit 2; }
valid_env() { case "$1" in production|staging|qa) return 0;; *) return 1;; esac; }

cmd_setup() {
  gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
  gc iam service-accounts describe "$SA" >/dev/null 2>&1 || gc iam service-accounts create iron-log-parity --display-name "Iron Log parity job (read-only)"
  echo "Set up: service account $SA. Next: scripts/parity-job.sh reader <production|staging|qa> --host <host> (three times), then deploy."
}

cmd_reader() {
  local env="${1:-}" flag="${2:-}" host="${3:-}"
  valid_env "$env" && [ "$flag" = "--host" ] && [ -n "$host" ] || usage
  : "${OWNER_DATABASE_URL:?Export OWNER_DATABASE_URL: the UNPOOLED owner URL of the $env database}"
  case "$OWNER_DATABASE_URL" in
    *-pooler*) echo "That is the pooled URL. Use the unpooled one (no -pooler in the host)." >&2; exit 1;;
    *127.0.0.1*|*localhost*) echo "That points at this machine. Use the Neon URL of the $env database." >&2; exit 1;;
  esac
  local actual; actual="$(node -e "import('./scripts/lib/db-script.mjs').then(m => console.log(m.connectHost(process.env.OWNER_DATABASE_URL) || ''))")"
  if [ "$actual" != "$(printf '%s' "$host" | tr 'A-Z' 'a-z')" ]; then echo "--host $host does not match the host in OWNER_DATABASE_URL ($actual). Nothing was changed." >&2; exit 1; fi
  echo "Making the read-only login on $actual ($env)."
  local reader_url; reader_url="$(DATABASE_URL="$OWNER_DATABASE_URL" node scripts/db-reader.mjs)"
  local secret; secret="$(secret_name "$env")"
  gc secrets describe "$secret" >/dev/null 2>&1 || gc secrets create "$secret" --replication-policy=automatic >/dev/null
  printf '%s' "$reader_url" | gc secrets versions add "$secret" --data-file=- >/dev/null
  gc secrets add-iam-policy-binding "$secret" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
  echo "Stored as $secret; only $SA can read it (the URL was not shown)."
}

cmd_deploy() {
  local missing=0 e
  for e in $ENVS; do
    gc secrets describe "$(secret_name "$e")" >/dev/null 2>&1 || { echo "Missing secret $(secret_name "$e"): run scripts/parity-job.sh reader $e --host <host>" >&2; missing=1; }
  done
  [ "$missing" = 0 ] || exit 1
  if [ -n "$(git status --porcelain parity cloudbuild-parity.yaml scripts/env-parity.mjs scripts/lib/migration-state.mjs)" ]; then echo "The parity files have uncommitted changes. Commit first." >&2; exit 1; fi
  local tag image; tag="$(git rev-parse --short HEAD)"
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/parity:${tag}"
  # Build as the small build-only account (made by ci-deploy-setup.sh), as deploy-cloud-run.sh does; without it a build runs as the default Compute
  # account, which holds the broad Editor role (audit 2026-10-23, deployer rights). Falls back to the default only while that account does not exist.
  local build_as=() build_sa="${BUILD_SA:-iron-log-build@${PROJECT_ID}.iam.gserviceaccount.com}"
  if gc iam service-accounts describe "$build_sa" >/dev/null 2>&1; then build_as=(--service-account "projects/${PROJECT_ID}/serviceAccounts/${build_sa}"); fi
  gc builds submit --config cloudbuild-parity.yaml --substitutions "_IMAGE=${image}" ${build_as[@]+"${build_as[@]}"} .
  local verb=create
  gc run jobs describe "$JOB" --region "$REGION" >/dev/null 2>&1 && verb=update
  gc run jobs "$verb" "$JOB" --region "$REGION" --image "$image" --service-account "$SA" \
    --set-secrets "PARITY_PRODUCTION_URL=$(secret_name production):latest,PARITY_STAGING_URL=$(secret_name staging):latest,PARITY_QA_URL=$(secret_name qa):latest" \
    --max-retries 0 --task-timeout 120 --cpu 1 --memory 512Mi
  # The CI deployer may start this one job, with the migration list as an argument. This binding is what keeps the report working if its
  # broader Cloud Run rights are narrowed later (secrets-and-keys-hygiene brief, item 4).
  gc run jobs add-iam-policy-binding "$JOB" --region "$REGION" --member "serviceAccount:$DEPLOYER" --role roles/run.jobsExecutorWithOverrides >/dev/null
  # The secrets check lists secret NAMES (never values): roles/secretmanager.viewer is metadata only (it has no secretmanager.versions.access),
  # granted on the project because listing is a project-level call. Confirm with: gcloud iam roles describe roles/secretmanager.viewer
  gc projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" --role roles/secretmanager.viewer --condition=None >/dev/null
  echo "Deployed $JOB. Check the rights: scripts/parity-job.sh check. Try one: scripts/parity-job.sh run production"
}

cmd_run() {
  local env="${1:-}"; { valid_env "$env" || [ "$env" = secrets ]; } || usage
  local list; list="$(ls db/migrations | grep -E '^[0-9]+_.*\.sql$' | sed 's/_.*//' | sort | paste -sd, -)"
  gc run jobs execute "$JOB" --region "$REGION" --args "$env,$list" --wait
}

cmd_check() {
  local e
  for e in $ENVS; do
    echo "== who can read $(secret_name "$e")"
    gc secrets get-iam-policy "$(secret_name "$e")" --format='table(bindings.role,bindings.members)'
  done
  echo "== project roles of $SA (the secretmanager.viewer role is metadata only)"
  gc projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' --filter="bindings.members:serviceAccount:$SA" --format='value(bindings.role)'
  echo "== who can run $JOB"
  gc run jobs get-iam-policy "$JOB" --region "$REGION" --format='table(bindings.role,bindings.members)'
}

case "${1:-}" in
  setup) cmd_setup;; reader) shift; cmd_reader "$@";; deploy) cmd_deploy;; run) shift; cmd_run "$@";; check) cmd_check;;
  *) usage;;
esac

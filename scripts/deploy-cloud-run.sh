#!/usr/bin/env bash
# Deploys Iron Log (the API and the PWA, one container, ADR 010) to Google Cloud Run.
#
# Usage:  PROJECT_ID=iron-log scripts/deploy-cloud-run.sh <command>
#   setup     enable the APIs and create the image repository (once per project)
#   secrets   put the four secrets in Secret Manager from your shell (once, and when one changes); with RESEND_API_KEY exported it also
#             stores the email-code key (optional: without it the email sign-in code stays off, ADR 042)
#   url       print the address the service will have, for the Google console's redirect URI (needs no deploy)
#   (RESEND_OFF=1 on candidate or deploy turns the email sign-in code off: the key is left out and the service stops mapping it)
#   deploy    build the image from the current commit and deploy it at once (100% of traffic; the manual and emergency way)
#   candidate build the image and deploy it as a tagged revision that gets NO traffic; prints its own address (ADR 017)
#   promote   send all traffic to the candidate revision
#   discard   remove the candidate tag (after a failed check; the revision never had traffic)
#   restore   send traffic to the latest revision again (after a rollback pinned it to an older one)
#
# It never touches a database: migrations are run by hand (docs: deploy-runbook.md). It sets max-instances=1 and min-instances=0,
# so spend stays at the free tier, and it needs the budget alert from the runbook in place before the first deploy.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log}"
REGION="${REGION:-us-central1}"   # a Cloud Run free-tier region
SERVICE="${SERVICE:-iron-log}"
REPO="${REPO:-iron-log}"
RUNTIME_SA="${RUNTIME_SA:-iron-log-run}"

gc() { gcloud --project "$PROJECT_ID" "$@"; }
project_number() { gc projects describe "$PROJECT_ID" --format='value(projectNumber)'; }
# Cloud Run's address is deterministic: service, project number, region.
service_url() { echo "https://${SERVICE}-$(project_number).${REGION}.run.app"; }

secret_exists() { gc secrets describe "$1" >/dev/null 2>&1; }
put_secret() { # name, value (from stdin). Adds a version only when the value changed.
  local name="$1" value; value="$(cat)"
  if ! secret_exists "$name"; then gc secrets create "$name" --replication-policy=automatic >/dev/null; fi
  if [ "$(gc secrets versions access latest --secret "$name" 2>/dev/null || true)" != "$value" ]; then
    printf '%s' "$value" | gc secrets versions add "$name" --data-file=- >/dev/null
    echo "  $name: new version stored"
  else
    echo "  $name: unchanged"
  fi
}

# The optional Resend key for the emailed sign-in code (ADR 042). Without it the app has no email option at all.
RESEND_SECRET="iron-log-resend-api-key"

# Whether this deploy passes RESEND_API_KEY to the service. `--set-secrets` REPLACES the service's whole secret list, so a key left
# out here is removed by the deploy, and one added by hand in the console is wiped by the next. Two ways to know it is wanted:
#   - the secret exists in Secret Manager: true on your machine, which may read secrets (`secrets` stores it);
#   - the live service already maps it: the CI deployer cannot read secrets (ci-deploy-setup.sh) but can read the service, so a
#     CI deploy keeps what the last deploy from your machine set up. A first deploy, with no service yet, answers no.
resend_secret_wanted() {
  # The way to turn the email code off: RESEND_OFF=1 leaves the key out, and --set-secrets then removes the mapping from the service.
  # Deleting the secret alone is not enough (the live-service rule below would keep naming it, and Cloud Run rejects a missing secret).
  if [ "${RESEND_OFF:-}" = 1 ]; then return 1; fi
  if secret_exists "$RESEND_SECRET"; then return 0; fi
  gc run services describe "$SERVICE" --region "$REGION" --format=json 2>/dev/null | python3 -c '
import json, sys
try:
    svc = json.load(sys.stdin)
except Exception:
    sys.exit(1)
containers = svc.get("spec", {}).get("template", {}).get("spec", {}).get("containers") or [{}]
env = containers[0].get("env") or []
sys.exit(0 if any(e.get("name") == "RESEND_API_KEY" and e.get("valueFrom", {}).get("secretKeyRef") for e in env) else 1)
'
}

cmd_setup() {
  gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
  gc artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 \
    || gc artifacts repositories create "$REPO" --repository-format=docker --location "$REGION" --description "Iron Log images"
  # The service runs as its own account with only what it needs: reading its four secrets.
  gc iam service-accounts describe "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || gc iam service-accounts create "$RUNTIME_SA" --display-name "Iron Log runtime"
  echo "Set up. Next: scripts/deploy-cloud-run.sh secrets"
}

cmd_secrets() {
  : "${APP_DATABASE_URL:?Export APP_DATABASE_URL: the POOLED Neon URL of the production branch as ironlog_app (not the owner)}"
  : "${GOOGLE_CLIENT_ID:?Export GOOGLE_CLIENT_ID}"
  : "${GOOGLE_CLIENT_SECRET:?Export GOOGLE_CLIENT_SECRET}"
  case "$APP_DATABASE_URL" in
    *127.0.0.1*|*localhost*) echo "APP_DATABASE_URL points at this machine. Use the Neon production URL." >&2; exit 1;;
    postgres://ironlog_app:*|postgresql://ironlog_app:*) ;;
    *) echo "APP_DATABASE_URL must log in as ironlog_app, the restricted role. The owner would bypass row-level security." >&2; exit 1;;
  esac
  echo "Storing secrets in project $PROJECT_ID:"
  printf '%s' "$APP_DATABASE_URL" | put_secret iron-log-app-database-url
  printf '%s' "$GOOGLE_CLIENT_ID" | put_secret iron-log-google-client-id
  printf '%s' "$GOOGLE_CLIENT_SECRET" | put_secret iron-log-google-client-secret
  # A fresh signing secret for production, made here and never shown. An existing one is kept: changing it signs everyone out.
  if ! secret_exists iron-log-auth-secret; then openssl rand -base64 48 | tr -d '\n' | put_secret iron-log-auth-secret; else echo "  iron-log-auth-secret: kept"; fi
  # Optional: the Resend key for the emailed sign-in code. Not exporting it leaves the feature off (or as it already is).
  local secret_names=(iron-log-app-database-url iron-log-google-client-id iron-log-google-client-secret iron-log-auth-secret)
  if [ -n "${RESEND_API_KEY:-}" ]; then
    printf '%s' "$RESEND_API_KEY" | put_secret "$RESEND_SECRET"
    secret_names+=("$RESEND_SECRET")
  else
    echo "  $RESEND_SECRET: not touched (export RESEND_API_KEY to store it)"
  fi
  for s in "${secret_names[@]}"; do
    gc secrets add-iam-policy-binding "$s" --member "serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role roles/secretmanager.secretAccessor >/dev/null
  done
  echo "Done. Next: scripts/deploy-cloud-run.sh deploy"
}

CANDIDATE_TAG="${CANDIDATE_TAG:-candidate}"
# 0 lets the service scale to zero (free when idle, a cold start on the first request). MIN_INSTANCES=1 keeps one warm, for a small monthly cost.

# Builds the image from the current commit; sets $image, $version, $url and $commit for the caller.
build_image() {
  local tag
  version="$(git log -1 --format=%ct)"
  tag="$(git rev-parse --short HEAD)"
  commit="$tag"
  if [ -n "$(git status --porcelain)" ]; then echo "The working tree has uncommitted changes; the image is built from the files on disk, not the commit. Commit or stash first." >&2; exit 1; fi
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:${tag}"
  url="$(service_url)"
  echo "Building $image (version $version) ..."
  # Build as the small build-only account (made by ci-deploy-setup.sh). CI names it in BUILD_SA, because the deployer cannot look
  # accounts up; on your machine it is used when it exists, otherwise the build runs as the project's default account.
  local build_as=() build_sa="${BUILD_SA:-iron-log-build@${PROJECT_ID}.iam.gserviceaccount.com}"
  if [ -n "${BUILD_SA:-}" ] || gc iam service-accounts describe "$build_sa" >/dev/null 2>&1; then build_as=(--service-account "projects/${PROJECT_ID}/serviceAccounts/${build_sa}"); fi
  gc builds submit --config cloudbuild.yaml --substitutions "_IMAGE=${image},_APP_VERSION=${version}" ${build_as[@]+"${build_as[@]}"} .
}

# Deploys $image (COMMIT_SHA records which commit it is; the CI deploy reads it back to see what is live); extra arguments (for example --no-traffic --tag candidate) go straight to `gcloud run deploy`.
deploy_image() {
  # Public access is set when the service is first made and left alone after: changing it needs a far broader permission, which the
  # CI deployer (ci-deploy-setup.sh) deliberately does not have.
  local public=()
  gc run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1 || public=(--allow-unauthenticated)
  local secrets="APP_DATABASE_URL=iron-log-app-database-url:latest,BETTER_AUTH_SECRET=iron-log-auth-secret:latest,GOOGLE_CLIENT_ID=iron-log-google-client-id:latest,GOOGLE_CLIENT_SECRET=iron-log-google-client-secret:latest"
  if resend_secret_wanted; then secrets+=",RESEND_API_KEY=${RESEND_SECRET}:latest"; echo "Email sign-in code: RESEND_API_KEY is passed to the service."; else echo "Email sign-in code: no RESEND_API_KEY, so the feature stays off${RESEND_OFF:+ (RESEND_OFF=1: any mapping is removed)}."; fi
  gc run deploy "$SERVICE" --image "$image" --region "$REGION" \
    --service-account "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    ${public[@]+"${public[@]}"} \
    --max-instances 1 --min-instances "${MIN_INSTANCES:-0}" --cpu 1 --memory 512Mi --concurrency 40 --timeout 120 \
    --update-env-vars "NODE_ENV=production,BASE_URL=${url},COMMIT_SHA=${commit}" \
    --set-secrets "$secrets" \
    "$@"
}

cmd_deploy() {
  local image version url commit
  build_image
  echo "Deploying to $url ..."
  deploy_image
  # A rollback pins traffic to one older revision; without this a later deploy would be ready but get no traffic.
  gc run services update-traffic "$SERVICE" --region "$REGION" --to-latest
  echo
  echo "Live at: $url"
  echo "Check:   curl -s $url/api/health   and   curl -s $url/api/health/db"
}

# The tagged address of the candidate revision, read from the service (Cloud Run builds it from the tag; the tag is not the whole host).
candidate_url() {
  gc run services describe "$SERVICE" --region "$REGION" --format=json \
    | python3 -c 'import json,sys; t=sys.argv[1]; print(next((x["url"] for x in json.load(sys.stdin)["status"].get("traffic", []) if x.get("tag")==t and x.get("url")), ""))' "$CANDIDATE_TAG"
}

cmd_candidate() {
  local image version url commit cand
  build_image
  echo "Deploying $image as '$CANDIDATE_TAG' with no traffic ..."
  deploy_image --no-traffic --tag "$CANDIDATE_TAG"
  cand="$(candidate_url)"
  if [ -z "$cand" ]; then echo "Deployed, but the service shows no address for tag '$CANDIDATE_TAG'." >&2; exit 1; fi
  echo
  echo "Candidate (no traffic): $cand"
  # Machine-readable line for the CI workflow.
  echo "CANDIDATE_URL=$cand"
}

cmd_promote() {
  gc run services describe "$SERVICE" --region "$REGION" >/dev/null
  gc run services update-traffic "$SERVICE" --region "$REGION" --to-tags "${CANDIDATE_TAG}=100"
  # The tag has done its job; its address would otherwise keep serving this revision.
  gc run services update-traffic "$SERVICE" --region "$REGION" --remove-tags "$CANDIDATE_TAG"
  echo "Promoted: all traffic is on the candidate revision."
}

cmd_discard() { gc run services update-traffic "$SERVICE" --region "$REGION" --remove-tags "$CANDIDATE_TAG"; }

cmd_restore() { gc run services update-traffic "$SERVICE" --region "$REGION" --to-latest; }

case "${1:-}" in
  setup) cmd_setup;;
  secrets) cmd_secrets;;
  url) service_url;;
  deploy) cmd_deploy;;
  candidate) cmd_candidate;;
  promote) cmd_promote;;
  discard) cmd_discard;;
  restore) cmd_restore;;
  *) sed -n '2,17p' "$0"; exit 2;;
esac

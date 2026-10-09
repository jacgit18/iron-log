#!/usr/bin/env bash
# Deploys Iron Log (the API and the PWA, one container, ADR 010) to Google Cloud Run.
#
# Usage:  PROJECT_ID=iron-log scripts/deploy-cloud-run.sh <command>
#   setup     enable the APIs and create the image repository (once per project)
#   secrets   put the four secrets in Secret Manager from your shell (once, and when one changes)
#   url       print the address the service will have, for the Google console's redirect URI (needs no deploy)
#   deploy    build the image from the current commit and deploy it
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
  for s in iron-log-app-database-url iron-log-google-client-id iron-log-google-client-secret iron-log-auth-secret; do
    gc secrets add-iam-policy-binding "$s" --member "serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role roles/secretmanager.secretAccessor >/dev/null
  done
  echo "Done. Next: scripts/deploy-cloud-run.sh deploy"
}

cmd_deploy() {
  local tag version image url
  version="$(git log -1 --format=%ct)"
  tag="$(git rev-parse --short HEAD)"
  if [ -n "$(git status --porcelain)" ]; then echo "The working tree has uncommitted changes; the image is built from the files on disk, not the commit. Commit or stash first." >&2; exit 1; fi
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:${tag}"
  url="$(service_url)"
  echo "Building $image (version $version) ..."
  # Build as the small build-only account (made by ci-deploy-setup.sh). CI names it in BUILD_SA, because the deployer cannot look
  # accounts up; on your machine it is used when it exists, otherwise the build runs as the project's default account.
  local build_as=() build_sa="${BUILD_SA:-iron-log-build@${PROJECT_ID}.iam.gserviceaccount.com}"
  if [ -n "${BUILD_SA:-}" ] || gc iam service-accounts describe "$build_sa" >/dev/null 2>&1; then build_as=(--service-account "projects/${PROJECT_ID}/serviceAccounts/${build_sa}"); fi
  gc builds submit --config cloudbuild.yaml --substitutions "_IMAGE=${image},_APP_VERSION=${version}" ${build_as[@]+"${build_as[@]}"} .
  echo "Deploying to $url ..."
  # Public access is set when the service is first made and left alone after: changing it needs a far broader permission, which the
  # CI deployer (ci-deploy-setup.sh) deliberately does not have.
  local public=()
  gc run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1 || public=(--allow-unauthenticated)
  gc run deploy "$SERVICE" --image "$image" --region "$REGION" \
    --service-account "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    ${public[@]+"${public[@]}"} \
    --max-instances 1 --min-instances 0 --cpu 1 --memory 512Mi --concurrency 40 --timeout 120 \
    --update-env-vars "NODE_ENV=production,BASE_URL=${url}" \
    --set-secrets "APP_DATABASE_URL=iron-log-app-database-url:latest,BETTER_AUTH_SECRET=iron-log-auth-secret:latest,GOOGLE_CLIENT_ID=iron-log-google-client-id:latest,GOOGLE_CLIENT_SECRET=iron-log-google-client-secret:latest"
  echo
  echo "Live at: $url"
  echo "Check:   curl -s $url/api/health   and   curl -s $url/api/health/db"
}

case "${1:-}" in
  setup) cmd_setup;;
  secrets) cmd_secrets;;
  url) service_url;;
  deploy) cmd_deploy;;
  *) sed -n '2,12p' "$0"; exit 2;;
esac

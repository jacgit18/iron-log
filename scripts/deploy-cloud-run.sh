#!/usr/bin/env bash
# Deploys Iron Log (the API and the PWA, one container, ADR 010) to Google Cloud Run.
#
# Usage:  PROJECT_ID=iron-log scripts/deploy-cloud-run.sh <command>
#   setup     enable the APIs and create the image repository (once per project)
#   secrets   put the four secrets in Secret Manager from your shell (once, and when one changes); with RESEND_API_KEY exported it also
#             stores the email-code key (optional: without it the email sign-in code stays off, ADR 042)
#             With VAPID_SUBJECT exported (mailto:you@example.com) it also stores the Web Push keys, making the pair once; see push-setup (ADR 044)
#   push-setup  make the Cloud Tasks queue, the invoker account and the permissions for Web Push (once; needs the cloudtasks API)
#   url       print the address the service will have, for the Google console's redirect URI (needs no deploy)
#             The key that seals names and emails in the database (PII_ENCRYPTION_KEY, ADR 046) is made here once and never replaced: a
#             new one could not read what the old one sealed. Back it up (see deploy-runbook.md) before the first deploy that uses it.
#   (RESEND_OFF=1 on candidate or deploy turns the email sign-in code off: the key is left out and the service stops mapping it;
#    PUSH_OFF=1 does the same for Web Push: the keys and the queue settings are removed from the service)
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

# Whether this deploy passes an optional secret to the service. `--set-secrets` REPLACES the service's whole secret list, so a key left
# out here is removed by the deploy, and one added by hand in the console is wiped by the next. Two ways to know it is wanted:
#   - the secret exists in Secret Manager: true on your machine, which may read secrets (`secrets` stores it);
#   - the live service already maps it: the CI deployer cannot read secrets (ci-deploy-setup.sh) but can read the service, so a
#     CI deploy keeps what the last deploy from your machine set up. A first deploy, with no service yet, answers no.
# Args: the secret's name, the environment variable it is mapped to, and the OFF switch (for example RESEND_OFF): set to 1 it is the
# way to turn the feature off. Deleting the secret alone is not enough (the live-service rule would keep naming it, and Cloud Run
# rejects a missing secret).
secret_wanted() {
  local secret="$1" envname="$2" off="$3"
  if [ "${!off:-}" = 1 ]; then return 1; fi
  if secret_exists "$secret"; then return 0; fi
  gc run services describe "$SERVICE" --region "$REGION" --format=json 2>/dev/null | python3 -c '
import json, sys
try:
    svc = json.load(sys.stdin)
except Exception:
    sys.exit(1)
containers = svc.get("spec", {}).get("template", {}).get("spec", {}).get("containers") or [{}]
env = containers[0].get("env") or []
sys.exit(0 if any(e.get("name") == sys.argv[1] and e.get("valueFrom", {}).get("secretKeyRef") for e in env) else 1)
' "$envname"
}
resend_secret_wanted() { secret_wanted "$RESEND_SECRET" RESEND_API_KEY RESEND_OFF; }

# The key that seals names and emails in the database (ADR 046). No OFF switch: rows already sealed need it, and the app would write
# new ones in the clear without it.
PII_SECRET="iron-log-pii-key"
pii_secret_wanted() { secret_wanted "$PII_SECRET" PII_ENCRYPTION_KEY PII_NEVER_OFF; }

# Web Push (ADR 044): three secrets (the VAPID pair and the contact address; the public key and the address are not secret, but a CI
# deploy can only pass what it can name, not read) and a Cloud Tasks queue with an account that signs each task.
VAPID_PUBLIC_SECRET="iron-log-vapid-public-key"
VAPID_PRIVATE_SECRET="iron-log-vapid-private-key"
VAPID_SUBJECT_SECRET="iron-log-vapid-subject"
PUSH_QUEUE_NAME="${PUSH_QUEUE_NAME:-iron-log-push}"
PUSH_INVOKER_SA="${PUSH_INVOKER_SA:-iron-log-push-invoker}"
push_secret_wanted() { secret_wanted "$VAPID_PRIVATE_SECRET" VAPID_PRIVATE_KEY PUSH_OFF; }

cmd_setup() {
  gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
  gc artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 \
    || gc artifacts repositories create "$REPO" --repository-format=docker --location "$REGION" --description "Iron Log images"
  # The service runs as its own account with only what it needs: reading its four secrets.
  gc iam service-accounts describe "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || gc iam service-accounts create "$RUNTIME_SA" --display-name "Iron Log runtime"
  echo "Set up. Next: scripts/deploy-cloud-run.sh secrets"
}

# Web Push's Google side (ADR 044), once: the Cloud Tasks queue (one attempt only, a late "rest over" is worse than none), the account whose
# token signs each task, and what the service's runtime account may do with them. Safe to run again.
cmd_push_setup() {
  local runtime="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" invoker="${PUSH_INVOKER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
  gc services enable cloudtasks.googleapis.com
  gc tasks queues describe "$PUSH_QUEUE_NAME" --location "$REGION" >/dev/null 2>&1 \
    || gc tasks queues create "$PUSH_QUEUE_NAME" --location "$REGION" --max-attempts=1 --max-dispatches-per-second=5
  gc iam service-accounts describe "$invoker" >/dev/null 2>&1 \
    || gc iam service-accounts create "$PUSH_INVOKER_SA" --display-name "Iron Log push invoker"
  # The runtime account puts tasks on the queue, and may name the invoker as the one that signs them. The invoker needs no role: the
  # fire route checks the token itself, and the service is public.
  gc tasks queues add-iam-policy-binding "$PUSH_QUEUE_NAME" --location "$REGION" --member "serviceAccount:$runtime" --role roles/cloudtasks.enqueuer >/dev/null
  gc iam service-accounts add-iam-policy-binding "$invoker" --member "serviceAccount:$runtime" --role roles/iam.serviceAccountUser >/dev/null
  echo "Queue $PUSH_QUEUE_NAME and account $invoker are ready. Next: VAPID_SUBJECT=mailto:you@example.com scripts/deploy-cloud-run.sh secrets, then deploy."
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
  # The key that seals names and emails in the database (ADR 046): 32 random bytes, made once and NEVER replaced. Putting in a new
  # one would leave every sealed name and email unreadable. It is not shown; back it up as the runbook says.
  if ! secret_exists "$PII_SECRET"; then openssl rand -base64 32 | tr -d '\n' | put_secret "$PII_SECRET"; else echo "  $PII_SECRET: kept"; fi
  # Optional: the Resend key for the emailed sign-in code. Not exporting it leaves the feature off (or as it already is).
  local secret_names=(iron-log-app-database-url iron-log-google-client-id iron-log-google-client-secret iron-log-auth-secret "$PII_SECRET")
  if [ -n "${RESEND_API_KEY:-}" ]; then
    printf '%s' "$RESEND_API_KEY" | put_secret "$RESEND_SECRET"
    secret_names+=("$RESEND_SECRET")
  else
    echo "  $RESEND_SECRET: not touched (export RESEND_API_KEY to store it)"
  fi
  # Optional: the Web Push keys. VAPID_SUBJECT (a mailto: address the push services can reach) says to store them. The key pair is made once
  # here and never shown; an existing pair is kept (a new one would orphan every device that already subscribed).
  if [ -n "${VAPID_SUBJECT:-}" ]; then
    case "$VAPID_SUBJECT" in mailto:?*@?*|https://?*) ;; *) echo "VAPID_SUBJECT must be a mailto: or https: address." >&2; exit 1;; esac
    if ! secret_exists "$VAPID_PRIVATE_SECRET"; then
      local keys; keys="$(node "$(dirname "$0")/vapid-keys.mjs")"
      printf '%s' "$keys" | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin)["publicKey"])' | put_secret "$VAPID_PUBLIC_SECRET"
      printf '%s' "$keys" | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin)["privateKey"])' | put_secret "$VAPID_PRIVATE_SECRET"
    else
      echo "  $VAPID_PRIVATE_SECRET: kept"
    fi
    printf '%s' "$VAPID_SUBJECT" | put_secret "$VAPID_SUBJECT_SECRET"
    secret_names+=("$VAPID_PUBLIC_SECRET" "$VAPID_PRIVATE_SECRET" "$VAPID_SUBJECT_SECRET")
  else
    echo "  Web Push keys: not touched (export VAPID_SUBJECT=mailto:you@example.com to store them)"
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
  if pii_secret_wanted; then secrets+=",PII_ENCRYPTION_KEY=${PII_SECRET}:latest"; echo "Database encryption: PII_ENCRYPTION_KEY is passed to the service."; else echo "Database encryption: no key yet, so names and emails are stored as before."; fi
  # Web Push (ADR 044): the keys as secrets, and where the queue and its signing account are (they are named by project, region and the
  # defaults above, so a CI deploy can pass them without looking anything up). PUSH_OFF=1 removes all of it.
  local push_env=() push_remove=()
  if push_secret_wanted; then
    secrets+=",VAPID_PUBLIC_KEY=${VAPID_PUBLIC_SECRET}:latest,VAPID_PRIVATE_KEY=${VAPID_PRIVATE_SECRET}:latest,VAPID_SUBJECT=${VAPID_SUBJECT_SECRET}:latest"
    push_env=(PUSH_QUEUE="projects/${PROJECT_ID}/locations/${REGION}/queues/${PUSH_QUEUE_NAME}" PUSH_INVOKER_EMAIL="${PUSH_INVOKER_SA}@${PROJECT_ID}.iam.gserviceaccount.com")
    echo "Web Push: the VAPID keys and the queue settings are passed to the service."
  else
    if [ "${PUSH_OFF:-}" = 1 ]; then push_remove=(--remove-env-vars PUSH_QUEUE,PUSH_INVOKER_EMAIL); fi
    echo "Web Push: no VAPID keys, so push stays off${PUSH_OFF:+ (PUSH_OFF=1: any settings are removed)}."
  fi
  local env_vars="NODE_ENV=production,BASE_URL=${url},COMMIT_SHA=${commit}"
  for kv in ${push_env[@]+"${push_env[@]}"}; do env_vars+=",${kv}"; done
  gc run deploy "$SERVICE" --image "$image" --region "$REGION" \
    --service-account "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    ${public[@]+"${public[@]}"} \
    --max-instances 1 --min-instances "${MIN_INSTANCES:-0}" --cpu 1 --memory 512Mi --concurrency 40 --timeout 120 \
    --update-env-vars "$env_vars" ${push_remove[@]+"${push_remove[@]}"} \
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
  push-setup) cmd_push_setup;;
  url) service_url;;
  deploy) cmd_deploy;;
  candidate) cmd_candidate;;
  promote) cmd_promote;;
  discard) cmd_discard;;
  restore) cmd_restore;;
  *) sed -n '2,20p' "$0"; exit 2;;
esac

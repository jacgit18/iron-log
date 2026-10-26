#!/usr/bin/env bash
# Deploys Iron Log (the API and the PWA, one container, ADR 010) to Google Cloud Run.
#
# Usage:  PROJECT_ID=iron-log scripts/deploy-cloud-run.sh <command>
#   setup     enable the APIs and create the image repository (once per project)
#   secrets   put the four secrets in Secret Manager from your shell (once, and when one changes); with RESEND_API_KEY exported it also
#             stores the email-code key (optional: without it the email sign-in code stays off, ADR 042)
#             With VAPID_SUBJECT exported (mailto:you@example.com) it also stores the Web Push keys, making the pair once; see push-setup (ADR 044)
#   stripe    put only the four Stripe billing settings in Secret Manager (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY; ADR 065)
#   push-setup  make the Cloud Tasks queue, the invoker account and the permissions for Web Push (once; needs the cloudtasks API)
#   url       print the address people sign in on (the Cloud Run address, or PUBLIC_BASE_URL), for the Google console's redirect URI (needs no deploy)
#             The key that seals names and emails in the database (PII_ENCRYPTION_KEY, ADR 046) is made here once (only with PII_KEY_CREATE=1) and never replaced: a
#             new one could not read what the old one sealed. Back it up (see deploy-runbook.md) before the first deploy that uses it.
#   (RESEND_OFF=1 on candidate or deploy turns the email sign-in code off: the key is left out and the service stops mapping it;
#    PUSH_OFF=1 does the same for Web Push: the keys and the queue settings are removed from the service)
#   deploy    build the image from the current commit and deploy it at once (100% of traffic; the manual and emergency way)
#   candidate build the image and deploy it as a tagged revision that gets NO traffic; prints its own address (ADR 017)
#   promote   send all traffic to the candidate revision
#   discard   remove the candidate tag (after a failed check; the revision never had traffic)
#   restore   send traffic to the latest revision again (after a rollback pinned it to an older one)
#
# IRON_LOG_ENV=staging (ADRs 055 to 058) runs every command above against the staging service instead: service iron-log-staging, runtime
# account iron-log-staging-run, secrets named iron-log-staging-*. It has its own database encryption key (iron-log-staging-pii-key, made by `secrets`; backlog EP2,
# ADR 057 revisited) and shares nothing with production, and it always leaves the email sign-in code and Web Push off. Its database is
# emptied with `scripts/staging-db.mjs reset` before it first runs on this key: rows sealed with production's key cannot be opened with another. The default is
# IRON_LOG_ENV=production, which behaves as before. SERVICE and RUNTIME_SA can still be overridden.
#
# IRON_LOG_ENV=qa (ADR 060) is the same for the QA service: iron-log-qa, runtime account iron-log-qa-run, secrets iron-log-qa-*. Its
# database holds no real users' data, so it has its own encryption key (iron-log-qa-pii-key, made by `secrets`) and shares nothing with
# production or staging; email and Web Push are always off.
#
# PUBLIC_BASE_URL (optional, an https origin with no path, for example https://example.app) is the address people sign in on: it becomes the
# service's BASE_URL on every deploy. Without it BASE_URL is the Cloud Run address, as before. Set it once a custom domain is mapped to the
# service and its address is in the Google client's redirect URIs. PUBLIC_BASE_URL is production's: staging reads STAGING_PUBLIC_BASE_URL and QA
# reads QA_PUBLIC_BASE_URL (ADR 076), each its own variable, so a value left in the shell for one environment can never point another at it, and
# the script refuses PUBLIC_BASE_URL itself for staging and QA.
# Checks of a new revision still use the Cloud Run address, which keeps answering, but only for reads: sign-in and writes work only on BASE_URL
# (the origin guard and Better Auth trust that origin alone). Web Push tasks also go to BASE_URL, so map the domain before setting this.
#
# CLOUDBUILD_CONFIG (default cloudbuild.yaml in the current folder) names the build file; the QA workflow points it at main's copy so a branch's
# own build file cannot push images into the registry that production and staging reuse by commit tag (ADR 060).
#
# It never touches a database: migrations are run by hand (docs: deploy-runbook.md). It sets max-instances=1 and min-instances=0,
# so spend stays at the free tier, and it needs the budget alert from the runbook in place before the first deploy.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log}"
REGION="${REGION:-us-central1}"   # a Cloud Run free-tier region
REPO="${REPO:-iron-log}"
IRON_LOG_ENV="${IRON_LOG_ENV:-production}"
case "$IRON_LOG_ENV" in
  production)
    SECRET_PREFIX="iron-log"; DB_ROLE="ironlog_app"
    SERVICE="${SERVICE:-iron-log}"; RUNTIME_SA="${RUNTIME_SA:-iron-log-run}"
    PII_SECRET="iron-log-pii-key"
    # Production secrets on the staging or QA service would point it at the production database.
    case "$SERVICE" in iron-log-staging*) echo "A staging service ('$SERVICE') needs IRON_LOG_ENV=staging; production secrets must not go to it." >&2; exit 2;; esac
    case "$SERVICE" in iron-log-qa*) echo "A QA service ('$SERVICE') needs IRON_LOG_ENV=qa; production secrets must not go to it." >&2; exit 2;; esac;;
  staging)
    SECRET_PREFIX="iron-log-staging"; DB_ROLE="ironlog_staging"
    SERVICE="${SERVICE:-iron-log-staging}"; RUNTIME_SA="${RUNTIME_SA:-iron-log-staging-run}"
    # Staging must never email or push a real person, whatever secrets exist in the project (ADR 056; until `staging-db.mjs reset` has run it may still hold a copy of production's data).
    RESEND_OFF=1; PUSH_OFF=1
    PII_SECRET="iron-log-staging-pii-key"
    case "$SERVICE" in iron-log-staging*) ;; *) echo "IRON_LOG_ENV=staging must deploy a service named iron-log-staging*, not '$SERVICE'." >&2; exit 2;; esac;;
  qa)
    SECRET_PREFIX="iron-log-qa"; DB_ROLE="ironlog_qa"
    SERVICE="${SERVICE:-iron-log-qa}"; RUNTIME_SA="${RUNTIME_SA:-iron-log-qa-run}"
    PII_SECRET="iron-log-qa-pii-key"
    RESEND_OFF=1; PUSH_OFF=1
    case "$SERVICE" in iron-log-qa*) ;; *) echo "IRON_LOG_ENV=qa must deploy a service named iron-log-qa*, not '$SERVICE'." >&2; exit 2;; esac;;
  *) echo "IRON_LOG_ENV must be production, staging or qa, not '$IRON_LOG_ENV'." >&2; exit 2;;
esac

gc() { gcloud --project "$PROJECT_ID" "$@"; }
project_number() { gc projects describe "$PROJECT_ID" --format='value(projectNumber)'; }
# Cloud Run's address is deterministic: service, project number, region.
service_url() { echo "https://${SERVICE}-$(project_number).${REGION}.run.app"; }
# The address people sign in on (BASE_URL): the Cloud Run address (the first argument, or looked up when there is none) unless this environment's
# variable names a custom domain: PUBLIC_BASE_URL (production), STAGING_PUBLIC_BASE_URL (staging) or QA_PUBLIC_BASE_URL (QA). Each environment
# reads only its own, and PUBLIC_BASE_URL is refused for staging and QA, so a value left in the shell cannot point one at another's domain. The value
# must be a bare https origin: a path, query, fragment, user name, space or newline would make every sign-in redirect and origin check disagree with it.
base_url_var() { case "$IRON_LOG_ENV" in staging) echo STAGING_PUBLIC_BASE_URL;; qa) echo QA_PUBLIC_BASE_URL;; *) echo PUBLIC_BASE_URL;; esac; }
public_base_url() {
  local var u; var="$(base_url_var)"; u="${!var:-}"
  if [ "$IRON_LOG_ENV" != production ] && [ -n "${PUBLIC_BASE_URL:-}" ]; then echo "PUBLIC_BASE_URL is for production only; ${IRON_LOG_ENV} uses ${var}. Unset PUBLIC_BASE_URL for this run." >&2; return 1; fi
  if [ -z "$u" ]; then echo "${1:-$(service_url)}"; return; fi
  # https://, then dot-separated host parts of letters, digits and inner hyphens (no empty part, none starting or ending with a hyphen), then an optional port from 1 to 65535.
  local re='^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:([0-9]{1,5}))?$'
  if ! [[ "$u" =~ $re ]] || { [ -n "${BASH_REMATCH[5]}" ] && { [ "${BASH_REMATCH[5]}" -lt 1 ] || [ "${BASH_REMATCH[5]}" -gt 65535 ]; }; }; then echo "${var} must be an https origin: https://host or https://host:port (port 1 to 65535), a valid host name, with no path, query, fragment, user name or space (got '$u')." >&2; return 1; fi
  # A staging or QA value must be a host of its own environment (staging.… or qa.…): a repository variable that holds production's domain by mistake
  # would point this environment's BASE_URL, its canonical-host redirect and its push tasks at production (review of #533).
  if [ "$IRON_LOG_ENV" != production ]; then
    local host="${u#https://}"; host="${host%%:*}"
    case "$host" in "${IRON_LOG_ENV}".*) ;; *) echo "${var} must be a host that starts with '${IRON_LOG_ENV}.' (for example https://${IRON_LOG_ENV}.example.app), never production's domain (got '$u')." >&2; return 1;; esac
  fi
  echo "$u"
}

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

# Stripe billing (ADR 065): four secrets, each environment with its own (iron-log-stripe-*, iron-log-staging-stripe-*, iron-log-qa-stripe-*): the
# secret key, the webhook signing secret and the two price ids (the price ids are not secret, but a CI deploy can only pass what it can name).
# Optional like Resend: without them the server's billing stays off. STRIPE_OFF=1 removes them from the service.
stripe_secret_wanted() { secret_wanted "${SECRET_PREFIX}-stripe-secret-key" STRIPE_SECRET_KEY STRIPE_OFF; }

# The key that seals names and emails in the database (ADR 046). No OFF switch: rows already sealed need it, and the app would write
# new ones in the clear without it.
# (PII_SECRET is set with the environment above: each environment has its own key.)
# Which secret the live service maps PII_ENCRYPTION_KEY to (the CI deployer cannot read secrets but can read the service). Prints one word:
# `staging` (the secret named in $1), `production` (iron-log-pii-key), `none` (the service maps neither), `notfound` (no such service yet) or
# `error` (the describe failed for another reason, or its output could not be read): an error is never taken to mean "not mapped".
live_pii_state() {
  local json errf rc=0; errf="$(mktemp)"
  json="$(gc run services describe "$SERVICE" --region "$REGION" --format=json 2>"$errf")" || rc=$?
  if [ "$rc" -ne 0 ]; then
    if grep -q -i -E 'NOT_FOUND|not found|cannot find service' "$errf"; then echo notfound; else echo error; fi
    rm -f "$errf"; return 0
  fi
  rm -f "$errf"
  printf '%s' "$json" | python3 -c '
import json, sys
try:
    svc = json.load(sys.stdin)
except Exception:
    print("error"); sys.exit(0)
containers = svc.get("spec", {}).get("template", {}).get("spec", {}).get("containers") or [{}]
names = [(e.get("valueFrom", {}).get("secretKeyRef") or {}).get("name") for e in (containers[0].get("env") or []) if e.get("name") == "PII_ENCRYPTION_KEY"]
print("staging" if sys.argv[1] in names else "production" if "iron-log-pii-key" in names else "none")
' "$1"
}
pii_secret_wanted() {
  # QA always passes its own key (ADR 060). Staging passes its own key (ADR 057 revisited) once it exists: seen by `secrets` on the owner's
  # machine, or already mapped on the live service for a CI deploy (which cannot read secrets). Until then staging keeps production's key, but only
  # when the live service positively maps it (or does not exist yet): a deploy before the owner has run `secrets` then does not point at a
  # missing secret, and a failed describe stops the deploy instead of silently moving staging back to production's key (runbook section 21).
  if [ "$IRON_LOG_ENV" = staging ] && ! secret_exists "$PII_SECRET"; then
    case "$(live_pii_state "$PII_SECRET")" in
      staging) ;;
      production|notfound) PII_SECRET="iron-log-pii-key";;
      *) echo "Cannot tell which database key the live $SERVICE service uses (the describe failed, or it maps no PII_ENCRYPTION_KEY). Not deploying: this could move staging back to production's key." >&2; exit 1;;
    esac
  fi
  if [ "$IRON_LOG_ENV" != production ]; then return 0; fi
  secret_wanted "$PII_SECRET" PII_ENCRYPTION_KEY PII_NEVER_OFF
}

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

# Stores the four Stripe settings (ADR 065) and fills STRIPE_NAMES with their secret names. A missing companion or a value that is not a Stripe
# key is refused; staging and QA take test keys only, because they hold a copy of production's data and must never charge a real card.
STRIPE_NAMES=()
store_stripe_secrets() {
  : "${STRIPE_SECRET_KEY:?Export STRIPE_SECRET_KEY (sk_test_... for staging and QA)}"
  : "${STRIPE_WEBHOOK_SECRET:?Export STRIPE_WEBHOOK_SECRET (the whsec_ signing secret of this environment webhook endpoint)}"
  : "${STRIPE_PRICE_MONTHLY:?Export STRIPE_PRICE_MONTHLY (the price_ id of the monthly price)}"
  : "${STRIPE_PRICE_YEARLY:?Export STRIPE_PRICE_YEARLY (the price_ id of the yearly price)}"
  case "$STRIPE_SECRET_KEY" in sk_test_*|rk_test_*) ;; sk_live_*|rk_live_*)
    if [ "$IRON_LOG_ENV" != production ]; then echo "${IRON_LOG_ENV} takes Stripe test keys only (a live key here would charge real cards from a copy of production data)." >&2; exit 1; fi;;
    *) echo "STRIPE_SECRET_KEY does not look like a Stripe key (sk_test_... or sk_live_...)." >&2; exit 1;; esac
  printf '%s' "$STRIPE_SECRET_KEY" | put_secret "${SECRET_PREFIX}-stripe-secret-key"
  printf '%s' "$STRIPE_WEBHOOK_SECRET" | put_secret "${SECRET_PREFIX}-stripe-webhook-secret"
  printf '%s' "$STRIPE_PRICE_MONTHLY" | put_secret "${SECRET_PREFIX}-stripe-price-monthly"
  printf '%s' "$STRIPE_PRICE_YEARLY" | put_secret "${SECRET_PREFIX}-stripe-price-yearly"
  STRIPE_NAMES=("${SECRET_PREFIX}-stripe-secret-key" "${SECRET_PREFIX}-stripe-webhook-secret" "${SECRET_PREFIX}-stripe-price-monthly" "${SECRET_PREFIX}-stripe-price-yearly")
}

# Only the Stripe settings, for turning billing on or changing a key without the database and Google values `secrets` also needs.
cmd_stripe() {
  store_stripe_secrets
  local s
  for s in "${STRIPE_NAMES[@]}"; do
    gc secrets add-iam-policy-binding "$s" --member "serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role roles/secretmanager.secretAccessor >/dev/null
  done
  echo "Done. Next: deploy (Actions, Deploy to Cloud Run, or scripts/deploy-cloud-run.sh deploy): it passes them to the service."
}

cmd_secrets() {
  : "${APP_DATABASE_URL:?Export APP_DATABASE_URL: the POOLED Neon URL of the ${IRON_LOG_ENV} branch as ${DB_ROLE} (not the owner)}"
  : "${GOOGLE_CLIENT_ID:?Export GOOGLE_CLIENT_ID}"
  : "${GOOGLE_CLIENT_SECRET:?Export GOOGLE_CLIENT_SECRET}"
  case "$APP_DATABASE_URL" in
    *127.0.0.1*|*localhost*) echo "APP_DATABASE_URL points at this machine. Use the Neon ${IRON_LOG_ENV} URL." >&2; exit 1;;
    postgres://${DB_ROLE}:*|postgresql://${DB_ROLE}:*) ;;
    *) echo "APP_DATABASE_URL must log in as ${DB_ROLE}, the restricted role for ${IRON_LOG_ENV}. The owner would bypass row-level security." >&2; exit 1;;
  esac
  # Fails closed: if another environment's client id exists but cannot be read, this one is not told it is fine. Staging must differ from
  # production's client (ADR 057); QA from production's and staging's (ADR 060).
  if [ "$IRON_LOG_ENV" != production ]; then
    local other_secret other_label other_id
    for other_secret in iron-log-google-client-id iron-log-staging-google-client-id; do
      if [ "$IRON_LOG_ENV" = staging ] && [ "$other_secret" = iron-log-staging-google-client-id ]; then continue; fi
      secret_exists "$other_secret" || continue
      other_label="production's"; [ "$other_secret" = iron-log-staging-google-client-id ] && other_label="staging's"
      other_id="$(gc secrets versions access latest --secret "$other_secret")" \
        || { echo "Cannot read $other_secret to check that ${IRON_LOG_ENV} uses its own OAuth client (ADR 057, 060)." >&2; exit 1; }
      if [ "$other_id" = "$GOOGLE_CLIENT_ID" ]; then echo "GOOGLE_CLIENT_ID is ${other_label}. ${IRON_LOG_ENV} needs its own OAuth client (ADR 057, 060)." >&2; exit 1; fi
    done
  fi
  echo "Storing secrets in project $PROJECT_ID:"
  printf '%s' "$APP_DATABASE_URL" | put_secret "${SECRET_PREFIX}-app-database-url"
  printf '%s' "$GOOGLE_CLIENT_ID" | put_secret "${SECRET_PREFIX}-google-client-id"
  printf '%s' "$GOOGLE_CLIENT_SECRET" | put_secret "${SECRET_PREFIX}-google-client-secret"
  # A fresh signing secret, made here and never shown. An existing one is kept: changing it signs everyone out.
  if ! secret_exists "${SECRET_PREFIX}-auth-secret"; then openssl rand -base64 48 | tr -d '\n' | put_secret "${SECRET_PREFIX}-auth-secret"; else echo "  ${SECRET_PREFIX}-auth-secret: kept"; fi
  # The key that seals names and emails in the database (ADR 046): 32 random bytes, NEVER replaced (a new one would leave every sealed name
  # and email unreadable). Made only when asked (PII_KEY_CREATE=1), because the next deploy, CI included, turns encryption on as soon as
  # the secret exists; do that on purpose, after the runbook's backup step (section 20), not as a side effect of changing another secret.
  local pii_names=()
  if [ "$IRON_LOG_ENV" = staging ] || [ "$IRON_LOG_ENV" = qa ]; then
    # Staging and QA hold no real users' data, so each gets its own key (ADR 060; staging since backlog EP2, ADR 057 revisited), made here on
    # the first run and never replaced. Production's key is not read or granted. Empty staging first (`staging-db.mjs reset`): rows sealed
    # with production's key cannot be opened with this one.
    if secret_exists "$PII_SECRET"; then echo "  $PII_SECRET: kept"
    else
      # Rows sealed with production's key cannot be opened with a new one: the owner confirms staging was emptied (`staging-db.mjs reset --apply`) first.
      if [ "$IRON_LOG_ENV" = staging ] && [ "${STAGING_DB_EMPTIED:-}" != 1 ]; then echo "$PII_SECRET does not exist yet. Run 'node scripts/staging-db.mjs reset --host <host> --apply' first, then export STAGING_DB_EMPTIED=1 and run this again (runbook section 21)." >&2; exit 1; fi
      openssl rand -base64 32 | tr -d '\n' | put_secret "$PII_SECRET"
    fi
    pii_names=("$PII_SECRET")
  elif secret_exists "$PII_SECRET"; then echo "  $PII_SECRET: kept"; pii_names=("$PII_SECRET")
  elif [ "${PII_KEY_CREATE:-}" = 1 ]; then openssl rand -base64 32 | tr -d '\n' | put_secret "$PII_SECRET"; pii_names=("$PII_SECRET")
  else echo "  $PII_SECRET: not created (export PII_KEY_CREATE=1 to make it; see runbook section 20)"; fi
  # Optional: the Resend key for the emailed sign-in code. Not exporting it leaves the feature off (or as it already is).
  local secret_names=("${SECRET_PREFIX}-app-database-url" "${SECRET_PREFIX}-google-client-id" "${SECRET_PREFIX}-google-client-secret" "${SECRET_PREFIX}-auth-secret" ${pii_names[@]+"${pii_names[@]}"})
  # Optional: Stripe billing (ADR 065). STRIPE_SECRET_KEY says to store all four (see store_stripe_secrets).
  if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
    store_stripe_secrets
    secret_names+=("${STRIPE_NAMES[@]}")
  else
    echo "  ${SECRET_PREFIX}-stripe-*: not touched (export STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY and STRIPE_PRICE_YEARLY to store them)"
  fi
  if [ "$IRON_LOG_ENV" != production ]; then
    echo "  Resend and Web Push keys: never stored for ${IRON_LOG_ENV} (it sends no email and no push, ADR 056, 060)"
  elif [ -n "${RESEND_API_KEY:-}" ]; then
    printf '%s' "$RESEND_API_KEY" | put_secret "$RESEND_SECRET"
    secret_names+=("$RESEND_SECRET")
  else
    echo "  $RESEND_SECRET: not touched (export RESEND_API_KEY to store it)"
  fi
  # Optional: the Web Push keys. VAPID_SUBJECT (a mailto: address the push services can reach) says to store them. The key pair is made once
  # here and never shown; an existing pair is kept (a new one would orphan every device that already subscribed).
  if [ "$IRON_LOG_ENV" != production ]; then
    :
  elif [ -n "${VAPID_SUBJECT:-}" ]; then
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

# Builds the image from the current commit; sets $image, $version, $url (the Cloud Run address), $base_url (BASE_URL) and $commit for the caller.
build_image() {
  local tag
  version="$(git log -1 --format=%ct)"
  tag="$(git rev-parse --short HEAD)"
  commit="$tag"
  if [ -n "$(git status --porcelain)" ]; then echo "The working tree has uncommitted changes; the image is built from the files on disk, not the commit. Commit or stash first." >&2; exit 1; fi
  image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:${tag}"
  url="$(service_url)"
  base_url="$(public_base_url "$url")" || exit 1
  # Every deploy writes BASE_URL, so one that leaves PUBLIC_BASE_URL out puts a custom domain back to the Cloud Run address: say so (stderr), loudly enough to see in a log.
  local var; var="$(base_url_var)"
  if [ -z "${!var:-}" ] && [ "$IRON_LOG_ENV" = production ]; then echo "Note: PUBLIC_BASE_URL is not set, so BASE_URL becomes the Cloud Run address ($base_url). If production signs in on a custom domain, set PUBLIC_BASE_URL (runbook section 27) or sign-in breaks until a deploy that sets it." >&2
  elif [ -z "${!var:-}" ]; then echo "Note: ${var} is not set, so BASE_URL becomes the Cloud Run address ($base_url). If ${IRON_LOG_ENV} signs in on a custom domain, set ${var} (the repository variable ${IRON_LOG_ENV^^}_BASE_URL in CI) or sign-in breaks until a deploy that sets it." >&2; fi
  # The same commit is one image for both environments (it holds no environment-specific value, ADR 058): when staging has already built it,
  # production deploys that exact image. FORCE_BUILD=1 builds it again.
  if [ "${FORCE_BUILD:-}" != 1 ]; then
    local probe
    if probe="$(gc artifacts docker images describe "$image" 2>&1)"; then
      echo "Image $image already exists (built for this commit); reusing it."
      return 0
    fi
    # Not built yet is the normal case; any other error (permission, network) means the check could not be made, so say so: the build
    # that follows may not be the image staging tested.
    case "$probe" in *NOT_FOUND*|*[Nn]ot\ [Ff]ound*) ;; *) echo "Could not check whether $image exists (${probe%%$'\n'*}); building it." >&2;; esac
  fi
  echo "Building $image (version $version) ..."
  # Build as the small build-only account (made by ci-deploy-setup.sh). CI names it in BUILD_SA, because the deployer cannot look
  # accounts up; on your machine it is used when it exists, otherwise the build runs as the project's default account.
  local build_as=() build_sa="${BUILD_SA:-iron-log-build@${PROJECT_ID}.iam.gserviceaccount.com}"
  if [ -n "${BUILD_SA:-}" ] || gc iam service-accounts describe "$build_sa" >/dev/null 2>&1; then build_as=(--service-account "projects/${PROJECT_ID}/serviceAccounts/${build_sa}"); fi
  gc builds submit --config "${CLOUDBUILD_CONFIG:-cloudbuild.yaml}" --substitutions "_IMAGE=${image},_APP_VERSION=${version}" ${build_as[@]+"${build_as[@]}"} .
}

# Deploys $image (COMMIT_SHA records which commit it is; the CI deploy reads it back to see what is live); extra arguments (for example --no-traffic --tag candidate) go straight to `gcloud run deploy`.
deploy_image() {
  # Public access is set when the service is first made and left alone after: changing it needs a far broader permission, which the
  # CI deployer (ci-deploy-setup.sh) deliberately does not have.
  local public=()
  gc run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1 || public=(--allow-unauthenticated)
  local secrets="APP_DATABASE_URL=${SECRET_PREFIX}-app-database-url:latest,BETTER_AUTH_SECRET=${SECRET_PREFIX}-auth-secret:latest,GOOGLE_CLIENT_ID=${SECRET_PREFIX}-google-client-id:latest,GOOGLE_CLIENT_SECRET=${SECRET_PREFIX}-google-client-secret:latest"
  if resend_secret_wanted; then secrets+=",RESEND_API_KEY=${RESEND_SECRET}:latest"; echo "Email sign-in code: RESEND_API_KEY is passed to the service."; else echo "Email sign-in code: no RESEND_API_KEY, so the feature stays off${RESEND_OFF:+ (RESEND_OFF=1: any mapping is removed)}."; fi
  if pii_secret_wanted; then secrets+=",PII_ENCRYPTION_KEY=${PII_SECRET}:latest"; echo "Database encryption: PII_ENCRYPTION_KEY is passed to the service."; else
    # Production refuses to start without the key (server/auth/piiBootCheck.ts): this revision will exit at boot and, as a candidate, get no traffic.
    echo "Database encryption: no PII_ENCRYPTION_KEY is available ($PII_SECRET does not exist and the live service does not map it). The server refuses to start in production without it, so this revision will fail its start-up check. Make the key first: PII_KEY_CREATE=1 $0 secrets (runbook section 20)." >&2
  fi
  local billing_env=()
  if stripe_secret_wanted; then
    secrets+=",STRIPE_SECRET_KEY=${SECRET_PREFIX}-stripe-secret-key:latest,STRIPE_WEBHOOK_SECRET=${SECRET_PREFIX}-stripe-webhook-secret:latest,STRIPE_PRICE_MONTHLY=${SECRET_PREFIX}-stripe-price-monthly:latest,STRIPE_PRICE_YEARLY=${SECRET_PREFIX}-stripe-price-yearly:latest"
    echo "Billing: the Stripe settings are passed to the service."
    # The server keeps billing off for a live (sk_live_) key unless BILLING_LIVE=1 is set (server/billing.ts), so going live is a deliberate
    # step: export BILLING_LIVE=1 for the production deploy. --update-env-vars keeps it on later deploys, so it is passed once, not every time.
    if [ "${BILLING_LIVE:-}" = 1 ] && [ "$IRON_LOG_ENV" = production ]; then
      billing_env=(BILLING_LIVE=1)
      echo "Billing: BILLING_LIVE=1 is passed, so a live Stripe key turns billing on."
    elif [ "${BILLING_LIVE:-}" = 1 ]; then
      echo "Billing: BILLING_LIVE=1 is ignored for ${IRON_LOG_ENV}, which takes test keys only."
    else
      echo "Billing: a live (sk_live_) key also needs BILLING_LIVE=1 exported for a production deploy, or billing stays off. A test key does not."
    fi
  else
    echo "Billing: no Stripe settings, so billing stays off${STRIPE_OFF:+ (STRIPE_OFF=1: any mapping is removed)}."
  fi
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
  local env_vars="NODE_ENV=production,BASE_URL=${base_url},COMMIT_SHA=${commit}"
  for kv in ${push_env[@]+"${push_env[@]}"} ${billing_env[@]+"${billing_env[@]}"}; do env_vars+=",${kv}"; done
  gc run deploy "$SERVICE" --image "$image" --region "$REGION" \
    --service-account "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    ${public[@]+"${public[@]}"} \
    --max-instances 1 --min-instances "${MIN_INSTANCES:-0}" --cpu 1 --memory 512Mi --concurrency 40 --timeout 120 \
    --update-env-vars "$env_vars" ${push_remove[@]+"${push_remove[@]}"} \
    --set-secrets "$secrets" \
    "$@"
}

cmd_deploy() {
  local image version url base_url commit
  build_image
  echo "Deploying to $url ..."
  if [ "$base_url" != "$url" ]; then echo "Sign-in address (BASE_URL): $base_url"; fi
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
  local image version url base_url commit cand
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
  # Traffic is already switched; failing to drop the tag must not fail the promotion (it would trigger a rollback of a good deploy).
  gc run services update-traffic "$SERVICE" --region "$REGION" --remove-tags "$CANDIDATE_TAG" || echo "::warning::The tag '$CANDIDATE_TAG' could not be removed; traffic is already on the candidate." >&2
  echo "Promoted: all traffic is on the candidate revision."
}

cmd_discard() { gc run services update-traffic "$SERVICE" --region "$REGION" --remove-tags "$CANDIDATE_TAG"; }

cmd_restore() { gc run services update-traffic "$SERVICE" --region "$REGION" --to-latest; }

case "${1:-}" in
  setup) cmd_setup;;
  secrets) cmd_secrets;;
  stripe) cmd_stripe;;
  push-setup) cmd_push_setup;;
  url) public_base_url;;
  deploy) cmd_deploy;;
  candidate) cmd_candidate;;
  promote) cmd_promote;;
  discard) cmd_discard;;
  restore) cmd_restore;;
  *) sed -n '2,21p' "$0"; exit 2;;
esac

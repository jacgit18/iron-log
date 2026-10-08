#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy to Cloud Run without any stored key (Workload Identity Federation).
#
# Usage:  PROJECT_ID=iron-log-jacgit18 GITHUB_REPO=jacgit18/iron-log scripts/ci-deploy-setup.sh
#
# What it makes, and why it is safe:
#   - a workload identity pool and provider that accept a token ONLY from this repository AND only from its main branch;
#   - a service account, iron-log-deployer, that may build, deploy a new revision and move traffic, and act as the app's own runtime
#     account. It cannot read the database, the secrets or the backups, change who may call the service, or touch anything else.
# It prints the three repository variables to set (none is a secret). Safe to run again.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log-jacgit18}"
GITHUB_REPO="${GITHUB_REPO:?Set GITHUB_REPO, for example GITHUB_REPO=jacgit18/iron-log}"
POOL="github-pool"
PROVIDER="github-provider"
SA_NAME="iron-log-deployer"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="iron-log-run@${PROJECT_ID}.iam.gserviceaccount.com"

gc() { gcloud --project "$PROJECT_ID" "$@"; }
NUMBER="$(gc projects describe "$PROJECT_ID" --format='value(projectNumber)')"

gc services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com >/dev/null

gc iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 \
  || gc iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"

gc iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 \
  || gc iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
       --display-name="GitHub" --issuer-uri="https://token.actions.githubusercontent.com" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
       --attribute-condition="assertion.repository == '${GITHUB_REPO}' && assertion.ref == 'refs/heads/main'"

gc iam service-accounts describe "$SA" >/dev/null 2>&1 || gc iam service-accounts create "$SA_NAME" --display-name="Iron Log CI deployer"

# Only tokens from this repository (and, by the provider's condition, its main branch) may act as the deployer.
gc iam service-accounts add-iam-policy-binding "$SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

for role in roles/run.developer roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer roles/artifactregistry.reader; do
  gc projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" --role "$role" --condition=None >/dev/null
done
# Deploying a revision that runs as the app's own account means acting as it.
gc iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser >/dev/null
# Uploading the source for a build: this bucket only.
gc storage buckets add-iam-policy-binding "gs://${PROJECT_ID}_cloudbuild" --member "serviceAccount:$SA" --role roles/storage.admin >/dev/null

cat <<OUT

Done. In GitHub (Settings -> Secrets and variables -> Actions -> Variables) add these three repository VARIABLES, or run the three commands:

  gh variable set GCP_PROJECT_ID --repo ${GITHUB_REPO} --body '${PROJECT_ID}'
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo ${GITHUB_REPO} --body 'projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}'
  gh variable set GCP_DEPLOYER_SERVICE_ACCOUNT --repo ${GITHUB_REPO} --body '${SA}'

Then the next merge to main deploys itself once its tests pass. Optional: Settings -> Environments -> production -> Required reviewers
to approve each deploy by hand.
OUT

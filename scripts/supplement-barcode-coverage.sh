#!/usr/bin/env bash
# Runs the supplement barcode coverage check against the QA environment's USDA key and Open Food Facts contact, fetching both itself (nothing to paste; names and key stay in this terminal).
# Usage: scripts/supplement-barcode-coverage.sh --dsld 10   or   --file bottles.txt     (PROJECT_ID defaults to iron-log-jacgit18; ENV_NAME to qa)
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-iron-log-jacgit18}"; ENV_NAME="${ENV_NAME:-qa}"; REGION="${REGION:-us-central1}"
USDA_API_KEY="$(gcloud --project "$PROJECT_ID" secrets versions access latest --secret "iron-log-${ENV_NAME}-usda-api-key")"
OFF_CONTACT="$(gcloud --project "$PROJECT_ID" run services describe "iron-log-${ENV_NAME}" --region "$REGION" --format=json | python3 -c '
import sys,json
for c in json.load(sys.stdin)["spec"]["template"]["spec"]["containers"]:
    for e in c.get("env",[]):
        if e["name"]=="OFF_CONTACT": print(e.get("value",""))')"
export USDA_API_KEY OFF_CONTACT
cd "$(dirname "$0")/.."
exec npx tsx scripts/supplement-barcode-coverage.ts "$@"

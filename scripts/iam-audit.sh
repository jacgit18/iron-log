#!/usr/bin/env bash
# Read-only audit of who can do what with Iron Log's Cloud Run jobs and secrets (secrets-and-keys-hygiene brief, item 4). It runs `list`,
# `describe` and `get-iam-policy` calls only, prints names and roles (never a secret value), and changes nothing. Run it yourself and paste
# the output into the chat; the report in the project docs is written from it.
#
#   PROJECT_ID=iron-log-jacgit18 scripts/iam-audit.sh
#
# What it shows:
#   1. the project-level roles of each service account Iron Log uses (the CI deployer above all: roles/run.developer at project level likely
#      lets it change or override ANY Cloud Run job, including the backup job that holds production's owner database URL);
#   2. each Cloud Run job and who may run, change or override it;
#   3. who can read each secret (accessor lists), so a secret readable by an account that does not need it stands out.
set -uo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log-jacgit18}"
REGION="${REGION:-us-central1}"
gc() { gcloud --project "$PROJECT_ID" "$@"; }

echo "== 1. project-level roles per service account"
policy="$(gc projects get-iam-policy "$PROJECT_ID" --format=json 2>/dev/null)" || { echo "(could not read the project policy: are you signed in with gcloud?)"; policy="{}"; }
printf '%s' "$policy" | python3 -c '
import json, sys
p = json.load(sys.stdin)
by = {}
for b in p.get("bindings", []):
    for m in b.get("members", []):
        if m.startswith("serviceAccount:") and "iron-log" in m:
            by.setdefault(m, []).append(b["role"])
for m in sorted(by):
    print(m)
    for r in sorted(by[m]): print("    " + r)
if not by: print("(no iron-log service accounts found in the project policy)")
'

echo
echo "== 2. Cloud Run jobs and who can run, change or override each"
for job in $(gc run jobs list --region "$REGION" --format='value(metadata.name)' 2>/dev/null); do
  echo "-- job $job"
  gc run jobs describe "$job" --region "$REGION" --format='value(spec.template.spec.template.spec.serviceAccountName)' 2>/dev/null | sed 's/^/    runs as: /'
  gc run jobs get-iam-policy "$job" --region "$REGION" --format='table(bindings.role,bindings.members)' 2>/dev/null | sed 's/^/    /'
done

echo
echo "== 3. who can read each secret (names and accounts only)"
for s in $(gc secrets list --format='value(name)' 2>/dev/null); do
  echo "-- $s"
  gc secrets get-iam-policy "$s" --format='table(bindings.role,bindings.members)' 2>/dev/null | sed 's/^/    /'
done
echo
echo "Done. Nothing was changed."

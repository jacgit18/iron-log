#!/usr/bin/env bash
# Read-only audit of who can do what with Iron Log's Cloud Run jobs and secrets (secrets-and-keys-hygiene brief, item 4). It runs `list`,
# `describe` and `get-iam-policy` calls only, prints names and roles (never a secret value), and changes nothing. Run it yourself and paste
# the output into the chat; the report in the project docs is written from it.
#
#   PROJECT_ID=iron-log-jacgit18 scripts/iam-audit.sh
#
# What it shows:
#   1. the project-level roles of every service account in the project (Iron Log's own, and Google's defaults such as the compute and Cloud
#      Build accounts, which often hold broad roles; the CI deployer above all: roles/run.developer at project level likely
#      lets it change or override ANY Cloud Run job, including the backup job that holds production's owner database URL);
#   2. each Cloud Run job and who may run, change or override it;
#   3. who may act as each service account (the policy on the account itself): the right that lets someone create or change a job or a
#      revision that runs as it; an empty policy means only people with project-wide rights can;
#   4. who can read each secret (accessor lists), so a secret readable by an account that does not need it stands out.
set -uo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log-jacgit18}"
REGION="${REGION:-us-central1}"
gc() { gcloud --project "$PROJECT_ID" "$@"; }
problems=0
note() { echo "$1"; problems=1; }

echo "== 1. project-level roles per service account"
policy="$(gc projects get-iam-policy "$PROJECT_ID" --format=json 2>/dev/null)" || { note "(could not read the project policy: are you signed in with gcloud, with rights on the project?)"; policy="{}"; }
printf '%s' "$policy" | python3 -c '
import json, sys
p = json.load(sys.stdin)
by = {}
for b in p.get("bindings", []):
    for m in b.get("members", []):
        if m.startswith("serviceAccount:"):
            by.setdefault(m, []).append(b["role"])
for m in sorted(by):
    print(m)
    for r in sorted(by[m]): print("    " + r)
if not by: print("(no service accounts found in the project policy)")
'

echo
echo "== 2. Cloud Run jobs and who can run, change or override each"
if jobs="$(gc run jobs list --region "$REGION" --format='value(metadata.name)' 2>/dev/null)"; then
  [ -n "$jobs" ] || echo "(no Cloud Run jobs in $REGION)"
  for job in $jobs; do
    echo "-- job $job"
    gc run jobs describe "$job" --region "$REGION" --format='value(spec.template.spec.template.spec.serviceAccountName)' 2>/dev/null | sed 's/^/    runs as: /'
    gc run jobs get-iam-policy "$job" --region "$REGION" --format='table(bindings.role,bindings.members)' 2>/dev/null | sed 's/^/    /'
    [ "${PIPESTATUS[0]}" = 0 ] || note "    (could not read the policy of job $job)"
  done
else
  note "(could not list the Cloud Run jobs: signed out, or no rights? this section is MISSING, not empty)"
fi

echo
echo "== 3. who may act as each service account (iam.serviceAccountUser and similar: acting as an account is what lets someone create or change a job or revision that runs as it)"
if accounts="$(gc iam service-accounts list --format='value(email)' 2>/dev/null)"; then
  [ -n "$accounts" ] || echo "(no service accounts in the project)"
  for a in $accounts; do
    echo "-- $a"
    gc iam service-accounts get-iam-policy "$a" --format='table(bindings.role,bindings.members)' 2>/dev/null | sed 's/^/    /'
    [ "${PIPESTATUS[0]}" = 0 ] || note "    (could not read the policy of $a)"
  done
else
  note "(could not list the service accounts: signed out, or no rights? this section is MISSING, not empty)"
fi

echo
echo "== 4. who can read each secret (names and accounts only)"
if secrets="$(gc secrets list --format='value(name)' 2>/dev/null)"; then
  [ -n "$secrets" ] || echo "(no secrets in the project)"
  for s in $secrets; do
    echo "-- $s"
    gc secrets get-iam-policy "$s" --format='table(bindings.role,bindings.members)' 2>/dev/null | sed 's/^/    /'
    [ "${PIPESTATUS[0]}" = 0 ] || note "    (could not read the policy of secret $s)"
  done
else
  note "(could not list the secrets: signed out, or no rights? this section is MISSING, not empty)"
fi
echo
echo
if [ "$problems" = 0 ]; then echo "Done. Nothing was changed."; else echo "INCOMPLETE: a part of the report above is missing (see the lines in parentheses). Fix the sign-in or rights and run it again. Nothing was changed."; exit 1; fi

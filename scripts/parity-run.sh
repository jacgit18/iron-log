#!/usr/bin/env bash
# What .github/workflows/env-parity.yml does once it is signed in to Google: lists main's migrations, starts the parity job once per
# environment with that list, turns each result into a status, writes a table (to the run summary when GITHUB_STEP_SUMMARY is set) and
# exits 1 when anything is red. Kept in a script so it can be tested with a stub `gcloud` (scripts/parityRun.test.js).
#
#   PROJECT_ID=iron-log-jacgit18 scripts/parity-run.sh
#
# Status from the job's exit code (scripts/env-parity.mjs): 0 OK; 3 BEHIND (yellow); 4 AHEAD OF MAIN (red). The extra row `secrets` compares
# secret names with the inventory: 3 UNLISTED (yellow), 4 MISSING (red); anything else, including a job
# that could not start or whose exit code cannot be read, UNKNOWN (red). Never OK by accident. PARITY_STAGING_BEHIND=fail makes staging
# BEHIND red (set it once staging migrates on every merge); production and QA BEHIND stay yellow.
#
# After the migration table a second table says which commit each service is running (the COMMIT_SHA the deploy puts on the revision that has
# the traffic, read the way the deploy's "What is live now" step reads it) and where that commit is against main's tip. Informational: it never
# turns the run yellow or red, because deploys are manual (a merge does not deploy) and QA runs a branch on purpose. It needs the full history of
# main in the checkout (the workflow uses fetch-depth: 0) and read access to the services (the deployer has `viewer`).
set -uo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
JOB="${JOB:-iron-log-parity}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-db/migrations}"
ENVS="${PARITY_ENVS:-production staging qa secrets}"
STAGING_BEHIND="${PARITY_STAGING_BEHIND:-warn}"
COMMIT_SERVICES="${PARITY_COMMIT_SERVICES:-production:iron-log staging:iron-log-staging qa:iron-log-qa}"
OUT="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

expected="$(ls "$MIGRATIONS_DIR" | grep -E '^[0-9]+_.*\.sql$' | sed 's/_.*//' | sort | paste -sd, -)"
if [ -z "$expected" ]; then echo "::error::No migration files found in $MIGRATIONS_DIR: cannot compare anything." >&2; exit 1; fi

# The secrets run gets main's secret inventory as its argument (one base64 string, names and flags only), not the migration list, so the job
# never checks against the copy baked into its image (2026-10-26: an image older than the inventory reported a known secret as UNLISTED).
inventory_arg="$(node "$(dirname "$0")/secret-inventory.mjs" --encode)" || inventory_arg=""
gc() { gcloud --project "$PROJECT_ID" "$@"; }
# The container's exit code from the latest execution's task, or empty when this gcloud does not show it.
exit_code_of() {
  local name="$1"
  gc run jobs executions tasks list --execution "$name" --region "$REGION" --format=json 2>/dev/null | python3 -c '
import json, sys
def find(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "exitCode" and isinstance(v, int): return v
            r = find(v)
            if r is not None: return r
    elif isinstance(o, list):
        for v in o:
            r = find(v)
            if r is not None: return r
try:
    r = find(json.load(sys.stdin))
    print("" if r is None else r)
except Exception:
    print("")
'
}

red=0; yellow=0
{
  echo "### Environment parity (main has $(echo "$expected" | tr ',' '\n' | wc -l | tr -d ' ') migrations)"
  echo
  echo "| Environment | Status | Detail |"
  echo "|---|---|---|"
} >> "$OUT"

for env in $ENVS; do
  # The execution this loop started is read from the execute call's own output, never worked out from "the newest execution" (another run, by
  # hand or a second trigger, could be the newest). Checked against real gcloud (2026-10-23): when the job fails, `--format=value(metadata.name)`
  # prints nothing, but the error text carries both what we need: "Task <execution>-task0 failed with exit code: 4" and "gcloud run jobs
  # executions describe <execution>". So stdout and stderr are read together; the task-list lookup (exit_code_of) is only a fallback.
  out="$(mktemp)"
  args="$env,$expected"; [ "$env" = secrets ] && args="$env,$inventory_arg"
  gc run jobs execute "$JOB" --region "$REGION" --args "$args" --wait --format='value(metadata.name)' > "$out" 2>&1
  rc=$?
  name="$(grep -oE "${JOB}-[a-z0-9]{5}\b" "$out" | tail -1)"
  said="$(grep -oE 'exit code: [0-9]+' "$out" | tail -1 | grep -oE '[0-9]+$')"
  rm -f "$out"
  code=""
  if [ "$rc" = 0 ]; then code=0
  else
    # A failed run: the exit code belongs to the execution this run started, and 0 from a failed run is never read as OK.
    if [ -n "$said" ]; then code="$said"; elif [ -n "$name" ]; then code="$(exit_code_of "$name")"; fi
    [ "$code" = 0 ] && code=""
  fi
  link=""; [ -n "$name" ] && link="[job logs](https://console.cloud.google.com/run/jobs/executions/details/${REGION}/${name}?project=${PROJECT_ID})"
  if [ "$env" = secrets ]; then
    # Not a database: the job compared the names of the secrets in Secret Manager with the inventory (scripts/secret-inventory.mjs).
    case "$code" in
      0) status="OK"; detail="every expected secret exists, and none is unknown to the inventory";;
      3) status="UNLISTED"; detail="a secret the inventory does not know (add it to scripts/secret-inventory.mjs or delete it); names are in the job logs";;
      4) status="MISSING"; detail="a required secret is absent (a deploy would break); names are in the job logs";;
      *) status="UNKNOWN"; detail="could not tell (job failed, could not start, or its result was unreadable)";;
    esac
  else
    case "$code" in
      0) status="OK"; detail="matches main";;
      3) status="BEHIND"; detail="main has migrations this database lacks; names are in the job logs";;
      4) status="AHEAD OF MAIN"; detail="this database has a migration main does not; names are in the job logs";;
      *) status="UNKNOWN"; detail="could not tell (job failed, could not start, or its result was unreadable)";;
    esac
  fi
  [ -n "$link" ] && detail="$detail; $link"
  echo "| $env | $status | $detail |" >> "$OUT"
  case "$status" in
    OK) ;;
    UNLISTED) yellow=1; echo "::warning title=secrets: UNLISTED::$detail";;
    BEHIND)
      if [ "$env" = staging ] && [ "$STAGING_BEHIND" = fail ]; then red=1; echo "::error title=$env is behind main::$detail"
      else yellow=1; echo "::warning title=$env is behind main::$detail"; fi;;
    *) red=1; echo "::error title=$env: $status::$detail";;
  esac
done

# The commit a service is running: the revision with the traffic (not the latest one: a candidate that failed its check is the latest but never
# served anyone), then its COMMIT_SHA setting. Empty when it cannot be read or is not a commit id.
live_commit() {
  local svc="$1" revision sha
  revision="$(gc run services describe "$svc" --region "$REGION" --format=json 2>/dev/null | python3 -c 'import json,sys; t=json.load(sys.stdin)["status"]["traffic"]; print(max(t, key=lambda x: x.get("percent", 0))["revisionName"])' 2>/dev/null)" || return 0
  [ -n "$revision" ] || return 0
  sha="$(gc run revisions describe "$revision" --region "$REGION" --format=json 2>/dev/null | python3 -c 'import json,sys; e=json.load(sys.stdin)["spec"]["containers"][0].get("env", []); print(next((x.get("value", "") for x in e if x["name"] == "COMMIT_SHA"), ""))' 2>/dev/null)" || return 0
  case "$sha" in ''|*[!0-9a-f]*) return 0;; esac
  echo "$sha"
}
tip="$(git rev-parse HEAD 2>/dev/null || true)"
{
  echo
  echo "### Running commit (main's tip is \`${tip:0:7}\`)"
  echo
  echo "| Environment | Service | Commit | Against main |"
  echo "|---|---|---|---|"
} >> "$OUT"
for pair in $COMMIT_SERVICES; do
  env="${pair%%:*}"; svc="${pair#*:}"
  sha="$(live_commit "$svc")"
  if [ -z "$sha" ]; then where="could not read it (no revision, no COMMIT_SHA, or no access)"; short="unknown"; echo "::notice title=$env: running commit unknown::$where"
  else
    short="${sha:0:7}"
    if [ -z "$tip" ] || ! git cat-file -e "${sha}^{commit}" 2>/dev/null; then where="this checkout does not have that commit"
    elif [ "$sha" = "$tip" ]; then where="main's tip"
    elif git merge-base --is-ancestor "$sha" "$tip" 2>/dev/null; then n="$(git rev-list --count "${sha}..${tip}")"; where="$n commit(s) behind main"
    else where="not on main (a branch or pull request)"; fi
  fi
  echo "| $env | $svc | \`$short\` | $where |" >> "$OUT"
done

[ "$red" = 1 ] && exit 1
exit 0

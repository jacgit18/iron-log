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
set -uo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
JOB="${JOB:-iron-log-parity}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-db/migrations}"
ENVS="${PARITY_ENVS:-production staging qa secrets}"
STAGING_BEHIND="${PARITY_STAGING_BEHIND:-warn}"
OUT="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

expected="$(ls "$MIGRATIONS_DIR" | grep -E '^[0-9]+_.*\.sql$' | sed 's/_.*//' | sort | paste -sd, -)"
if [ -z "$expected" ]; then echo "::error::No migration files found in $MIGRATIONS_DIR: cannot compare anything." >&2; exit 1; fi

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
  gc run jobs execute "$JOB" --region "$REGION" --args "$env,$expected" --wait --format='value(metadata.name)' > "$out" 2>&1
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

[ "$red" = 1 ] && exit 1
exit 0

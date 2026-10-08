#!/usr/bin/env bash
# Email alerts for the two things that would otherwise go wrong silently (ADR 013, Phase F): the nightly backup, and the server.
#
# Usage:  PROJECT_ID=iron-log-jacgit18 ALERT_EMAIL=you@example.com scripts/alerts-cloud-run.sh <command>
#   setup    enable Cloud Monitoring, make the email channel, and create the three alert policies that do not exist yet
#   list     show the channel (and whether its address is verified) and the policies
#   verify   email a code to the channel's address:  scripts/alerts-cloud-run.sh verify            (sends it)
#                                                    scripts/alerts-cloud-run.sh verify <code>      (confirms it)
#
# The alerts:
#   1. a nightly backup run failed            (the job's own failed-execution count)
#   2. the backup could not even be started   (Cloud Scheduler logged an error for its job)
#   3. the server answered errors in a burst  (5 or more 5xx responses within 5 minutes)
# Alerting and email are free at this size. Not covered, on purpose: "no backup for a day" (Cloud Monitoring cannot watch a gap that
# long reliably); `scripts/backup-cloud-run.sh list` shows a new pair of files every day, so look now and then.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, for example PROJECT_ID=iron-log-jacgit18}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-iron-log}"
JOB="${JOB:-iron-log-backup}"
CHANNEL_NAME="Iron Log alerts (email)"
BASE="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}"

# The REST API directly: gcloud's monitoring commands are in the alpha component, which prompts to install itself.
api() { curl -sS --fail-with-body -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: ${PROJECT_ID}" -H "Content-Type: application/json" "$@"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }

channel_id() { api "$BASE/notificationChannels" | json "print(next((c['name'] for c in d.get('notificationChannels', []) if c.get('displayName') == '$CHANNEL_NAME'), ''))"; }
policy_exists() { api "$BASE/alertPolicies" | json "print(any(p.get('displayName') == '''$1''' for p in d.get('alertPolicies', [])))"; }

ensure_channel() {
  : "${ALERT_EMAIL:?Set ALERT_EMAIL, the address that should receive the alerts}"
  local id; id="$(channel_id)"
  if [ -n "$id" ]; then echo "$id"; return; fi
  api -X POST "$BASE/notificationChannels" -d "{\"type\":\"email\",\"displayName\":\"$CHANNEL_NAME\",\"labels\":{\"email_address\":\"$ALERT_EMAIL\"}}" | json "print(d['name'])"
}

create_policy() { # displayName, json body
  # DRY_RUN=1 builds and checks each policy without calling Google (how the script is tested).
  if [ -n "${DRY_RUN:-}" ]; then printf '%s' "$2" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['displayName'] == sys.argv[1] and d['notificationChannels'] and d['conditions']; print('  valid: ' + d['displayName'])" "$1"; return; fi
  if [ "$(policy_exists "$1")" = "True" ]; then echo "  already there: $1"; return; fi
  api -X POST "$BASE/alertPolicies" -d "$2" >/dev/null
  echo "  created: $1"
}

cmd_setup() {
  local ch
  if [ -n "${DRY_RUN:-}" ]; then ch="projects/$PROJECT_ID/notificationChannels/0"; else
    gcloud --project "$PROJECT_ID" services enable monitoring.googleapis.com >/dev/null
    ch="$(ensure_channel)"
  fi
  echo "Channel: $ch"

  create_policy "Iron Log: a nightly backup failed" "{
    \"displayName\": \"Iron Log: a nightly backup failed\",
    \"combiner\": \"OR\",
    \"conditions\": [{
      \"displayName\": \"backup job execution failed\",
      \"conditionThreshold\": {
        \"filter\": \"resource.type=\\\"cloud_run_job\\\" AND resource.labels.job_name=\\\"$JOB\\\" AND metric.type=\\\"run.googleapis.com/job/completed_execution_count\\\" AND metric.labels.result=\\\"failed\\\"\",
        \"aggregations\": [{\"alignmentPeriod\": \"300s\", \"perSeriesAligner\": \"ALIGN_DELTA\", \"crossSeriesReducer\": \"REDUCE_SUM\"}],
        \"comparison\": \"COMPARISON_GT\", \"thresholdValue\": 0, \"duration\": \"0s\", \"trigger\": {\"count\": 1}
      }
    }],
    \"notificationChannels\": [\"$ch\"],
    \"alertStrategy\": {\"autoClose\": \"86400s\"},
    \"documentation\": {\"mimeType\": \"text/markdown\", \"content\": \"The nightly database backup failed. Your data is safe in Neon, but there is no new copy outside it. See why: \`gcloud run jobs executions list --job $JOB --region $REGION --project $PROJECT_ID\`, then \`gcloud run jobs executions describe <name>\`. Run one by hand: \`PROJECT_ID=$PROJECT_ID scripts/backup-cloud-run.sh run\`.\"}
  }"

  create_policy "Iron Log: the backup could not be started" "{
    \"displayName\": \"Iron Log: the backup could not be started\",
    \"combiner\": \"OR\",
    \"conditions\": [{
      \"displayName\": \"Cloud Scheduler logged an error for the backup job\",
      \"conditionMatchedLog\": {\"filter\": \"resource.type=\\\"cloud_scheduler_job\\\" AND resource.labels.job_id=\\\"$JOB\\\" AND severity>=ERROR\"}
    }],
    \"notificationChannels\": [\"$ch\"],
    \"alertStrategy\": {\"notificationRateLimit\": {\"period\": \"3600s\"}, \"autoClose\": \"86400s\"},
    \"documentation\": {\"mimeType\": \"text/markdown\", \"content\": \"Cloud Scheduler could not start the nightly backup job, so tonight there is no backup. Check the job and its permissions: \`gcloud scheduler jobs describe $JOB --location $REGION --project $PROJECT_ID\`. Run one by hand: \`PROJECT_ID=$PROJECT_ID scripts/backup-cloud-run.sh run\`.\"}
  }"

  create_policy "Iron Log: server errors" "{
    \"displayName\": \"Iron Log: server errors\",
    \"combiner\": \"OR\",
    \"conditions\": [{
      \"displayName\": \"5 or more 5xx answers in 5 minutes\",
      \"conditionThreshold\": {
        \"filter\": \"resource.type=\\\"cloud_run_revision\\\" AND resource.labels.service_name=\\\"$SERVICE\\\" AND metric.type=\\\"run.googleapis.com/request_count\\\" AND metric.labels.response_code_class=\\\"5xx\\\"\",
        \"aggregations\": [{\"alignmentPeriod\": \"300s\", \"perSeriesAligner\": \"ALIGN_DELTA\", \"crossSeriesReducer\": \"REDUCE_SUM\"}],
        \"comparison\": \"COMPARISON_GT\", \"thresholdValue\": 4, \"duration\": \"0s\", \"trigger\": {\"count\": 1}
      }
    }],
    \"notificationChannels\": [\"$ch\"],
    \"alertStrategy\": {\"autoClose\": \"3600s\"},
    \"documentation\": {\"mimeType\": \"text/markdown\", \"content\": \"Iron Log answered several server errors within five minutes. Look at the log: \`gcloud run services logs read $SERVICE --project $PROJECT_ID --region $REGION --limit 50\`. If a deploy caused it, roll back: \`gcloud run services update-traffic $SERVICE --project $PROJECT_ID --region $REGION --to-revisions <previous>=100\`.\"}
  }"
  echo "Done. Check that the address is verified: scripts/alerts-cloud-run.sh list"
}

cmd_list() {
  echo "Channel:"
  api "$BASE/notificationChannels" | json "[print('  %s  %s  verification=%s' % (c['displayName'], c.get('labels', {}).get('email_address', '?'), c.get('verificationStatus', '?'))) for c in d.get('notificationChannels', [])] or print('  none')"
  echo "Policies:"
  api "$BASE/alertPolicies" | json "[print('  %s  enabled=%s' % (p['displayName'], p.get('enabled', True))) for p in d.get('alertPolicies', [])] or print('  none')"
}

cmd_verify() {
  local id; id="$(channel_id)"; [ -n "$id" ] || { echo "No channel yet: run setup first." >&2; exit 1; }
  if [ -z "${1:-}" ]; then
    api -X POST "https://monitoring.googleapis.com/v3/${id}:sendVerificationCode" -d '{}' >/dev/null
    echo "A code was emailed. Confirm it with: scripts/alerts-cloud-run.sh verify <code>"
  else
    api -X POST "https://monitoring.googleapis.com/v3/${id}:verify" -d "{\"code\":\"$1\"}" >/dev/null
    echo "Verified."
  fi
}

case "${1:-}" in
  setup) cmd_setup;; list) cmd_list;; verify) shift; cmd_verify "${1:-}";;
  *) sed -n '2,15p' "$0"; exit 2;;
esac

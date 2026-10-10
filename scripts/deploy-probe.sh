#!/usr/bin/env bash
# Measures whether a deploy drops requests (ADR 017, backlog "Deploy safeguards" step 4). Start it before a deploy starts and leave it
# running until the deploy has finished; it asks the service once a second and prints one line per request, then a summary.
#
# Usage:  scripts/deploy-probe.sh <base-url> [seconds]     (default 600; Ctrl-C ends it early and still prints the summary)
#   scripts/deploy-probe.sh https://iron-log-947510572244.us-central1.run.app 600
#
# It only reads /api/health and /api/health/db, which are public. A "drop" is any answer that is not 200 (000 means no answer within 30 s).
# Slow answers (over 3 s) are counted separately: a cold start shows up as slow, not as a failure.
set -uo pipefail

base="${1:?Usage: deploy-probe.sh <base-url> [seconds]}"
seconds="${2:-600}"
total=0 bad=0 slow=0 slowest=0
summary() {
  echo
  echo "Requests: $total   not 200: $bad   slower than 3 s: $slow   slowest: ${slowest} s"
  if [ "$bad" = 0 ]; then echo "No dropped requests measured."; else echo "Dropped requests measured: see the lines marked DROP above."; fi
}
trap 'summary; exit 0' INT TERM

end=$((SECONDS + seconds))
while [ "$SECONDS" -lt "$end" ]; do
  for path in /api/health /api/health/db; do
    out="$(curl -s -m 30 -o /dev/null -w '%{http_code} %{time_total}' "$base$path" || true)"
    code="${out%% *}"; secs="${out##* }"
    [ -n "$code" ] || { code=000; secs=30; }
    total=$((total + 1)); mark=""
    if [ "$code" != 200 ]; then bad=$((bad + 1)); mark="  DROP"; fi
    if awk "BEGIN{exit !($secs > 3)}"; then slow=$((slow + 1)); mark="$mark  slow"; fi
    if awk "BEGIN{exit !($secs > $slowest)}"; then slowest="$secs"; fi
    printf '%s %s %s %ss%s\n' "$(date +%H:%M:%S)" "$code" "$path" "$secs" "$mark"
  done
  sleep 1
done
summary

#!/usr/bin/env bash
# The two checks the CI deploy (.github/workflows/deploy-cloud-run.yml) makes around scripts/deploy-cloud-run.sh. Kept as a script so
# they can be tested without GitHub.
#
#   pending-migrations <deployed-sha> [head]   print the migration files added since the commit that is live; empty means none waiting.
#                                              Exit 0 with nothing printed, exit 3 when some are waiting, exit 2 if the commit is unknown.
#   smoke <base-url>                            check that a fresh deploy answers correctly; exit 1 if it does not (the workflow then rolls back).
#                                              SMOKE_ATTEMPTS (default 8) and SMOKE_SLEEP seconds (default 10) allow for a cold start.
set -euo pipefail

cmd_pending_migrations() {
  local deployed="${1:?Usage: ci-deploy.sh pending-migrations <deployed-sha> [head]}" head="${2:-HEAD}"
  if ! git cat-file -e "${deployed}^{commit}" 2>/dev/null; then echo "The live revision's commit ($deployed) is not in this checkout." >&2; exit 2; fi
  local added
  added="$(git diff --name-only --diff-filter=AM "$deployed" "$head" -- db/migrations)"
  if [ -n "$added" ]; then printf '%s\n' "$added"; exit 3; fi
}

# One request: prints nothing, returns the HTTP status.
status() { curl -s -m 30 -o /dev/null -w '%{http_code}' "$@" || true; }

cmd_smoke() {
  local base="${1:?Usage: ci-deploy.sh smoke <base-url>}" attempts="${SMOKE_ATTEMPTS:-8}" pause="${SMOKE_SLEEP:-10}" n=0
  while [ "$n" -lt "$attempts" ]; do
    n=$((n + 1))
    local health db page me
    health="$(status "$base/api/health")"
    db="$(status "$base/api/health/db")"
    page="$(status "$base/privacy.html")"
    me="$(status "$base/api/me")"
    # The API is up, its database login works, the app's own files are served, and an anonymous caller is refused.
    if [ "$health" = 200 ] && [ "$db" = 200 ] && [ "$page" = 200 ] && [ "$me" = 401 ]; then
      echo "Smoke test passed (attempt $n): health $health, database $db, app $page, anonymous /api/me $me."
      return 0
    fi
    echo "Attempt $n of $attempts: health $health, database $db, app $page, anonymous /api/me $me (want 200, 200, 200, 401)."
    [ "$n" -lt "$attempts" ] && sleep "$pause"
  done
  echo "Smoke test failed." >&2
  return 1
}

case "${1:-}" in
  pending-migrations) shift; cmd_pending_migrations "$@";;
  smoke) shift; cmd_smoke "$@";;
  *) sed -n '2,10p' "$0"; exit 2;;
esac

#!/usr/bin/env bash
# Sets up a fresh clone: dependencies, git hooks, the browser the tests and Lighthouse use, and the local database.
# Safe to run again. What it cannot do for you (sign-ins, secrets) is printed at the end. See SETUP.md.
set -u
cd "$(dirname "$0")/.."

ok() { printf '  ok   %s\n' "$1"; }
todo() { printf '  TODO %s\n' "$1"; TODOS=$((TODOS + 1)); }
TODOS=0

echo "Tools"
command -v git >/dev/null && ok "git" || todo "install git"
if command -v node >/dev/null; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] && ok "node $(node -v)" || todo "node 22 or newer is needed (found $(node -v))"
else todo "install node 22 or newer"; fi
command -v gh >/dev/null && ok "gh (GitHub CLI)" || todo "install the GitHub CLI (gh): PRs are opened with it"
command -v docker >/dev/null && ok "docker" || todo "install Docker (only for the local database and e2e:sync / db:check)"

echo "Dependencies"
DEPS=0
npm ci && { ok "npm ci"; DEPS=1; } || todo "npm ci failed; the hooks and browser steps are skipped until it passes"

echo "Git hooks"
if [ "$DEPS" -eq 1 ]; then
  node scripts/install-hooks.mjs && ok "pre-push runs npm run check (SKIP_CHECK=1 git push to skip once)" || todo "install-hooks failed"
else todo "skipped (dependencies are not installed)"; fi

echo "Browser for e2e and Lighthouse"
# The project's own Playwright (node_modules), never whatever npx would fetch: its browser build has to match the pinned version.
if [ "$DEPS" -eq 1 ] && [ -x node_modules/.bin/playwright ]; then
  node_modules/.bin/playwright install chromium && ok "playwright chromium" || todo "playwright install failed (on Linux you may need: node_modules/.bin/playwright install-deps chromium)"
else todo "skipped (dependencies are not installed)"; fi

echo "Local database"
if command -v docker >/dev/null; then
  if (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null; then ok "something is answering on 127.0.0.1:5433 (taken to be the local database)"
  elif npm run db:start >/dev/null 2>&1; then ok "postgres on 127.0.0.1:5433"
  else todo "database did not start: docker compose up -d --force-recreate --wait db"; fi
fi

echo "Sign-ins and files this script cannot create"
gh auth status >/dev/null 2>&1 && ok "gh signed in" || todo "gh auth login"
[ -f .env ] && ok ".env present" || todo "copy .env.example to .env and fill it (only for the API, migrations and deploys)"

echo
if [ "$TODOS" -eq 0 ]; then echo "Ready. Try: npm run check -- --list"; else echo "$TODOS thing(s) left, listed as TODO above."; fi
exit 0

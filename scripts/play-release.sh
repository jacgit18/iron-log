#!/usr/bin/env bash
# Builds the Google Play bundle for the Android wrapper (a Trusted Web Activity; android/README.md, ops/play-release-runbook.md) in one command:
# raises the version, fetches the upload-key password from Secret Manager, runs Bubblewrap, and checks what it made. Run it by hand on your machine.
#
# Usage:  scripts/play-release.sh <command>      (or: npm run play:release -- <command>)
#   build [--code N]  raise appVersionCode by one (or set it to N), set appVersion and appVersionName to match, then `bubblewrap update --skipVersionUpgrade`
#                     and `bubblewrap build` in android/ with the passwords supplied. Writes app-release-bundle.aab (upload to Play) and
#                     app-release-signed.apk (sideload to test). If anything fails, twa-manifest.json is put back as it was.
#   check             says whether the stored password can be read and how long it is, never what it is. Changes nothing.
#   store-password    asks for the keystore password (hidden, with a length check) and stores it in Secret Manager as the secret named below
#                     (a new version if it exists). Once, and again if the password ever changes.
#
# The password: BUBBLEWRAP_KEYSTORE_PASSWORD from your shell if set, else Secret Manager ($SECRET in project $PROJECT_ID, signed in with gcloud),
# else a hidden prompt. The key password is the same one (alias android). It is passed to Bubblewrap through its environment for that one run
# and never printed or written to a file. The keystore file itself (android/android.keystore) stays on this machine and is gitignored: back it up.
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ID="${PROJECT_ID:-iron-log-jacgit18}"
SECRET="${PLAY_KEYSTORE_SECRET:-iron-log-play-upload-keystore-password}"
ANDROID_DIR="${ANDROID_DIR:-android}"          # overridable for tests
BUBBLEWRAP="${BUBBLEWRAP:-bubblewrap}"
GCLOUD="${GCLOUD:-gcloud}"
MANIFEST="$ANDROID_DIR/twa-manifest.json"

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' >&2; exit 2; }
die() { echo "play-release: $*" >&2; exit 1; }

# The stored password, or nothing. stdin closed and stderr hidden: a signed-out gcloud must fail quietly, not wait on a prompt nobody can see.
stored_password() { $GCLOUD --project "$PROJECT_ID" secrets versions access latest --secret "$SECRET" </dev/null 2>/dev/null || true; }

get_password() {
  local pw="${BUBBLEWRAP_KEYSTORE_PASSWORD:-}"
  [ -n "$pw" ] || pw="$(stored_password)"
  if [ -z "$pw" ]; then
    echo "No stored password ($SECRET in $PROJECT_ID; sign in with 'gcloud auth login', or run 'store-password' once). Asking instead." >&2
    read -rsp "Keystore password (hidden): " pw >&2; echo >&2
    echo "Got ${#pw} characters." >&2
  fi
  [ -n "$pw" ] || die "no password"
  printf '%s' "$pw"
}

cmd_check() {
  local pw; pw="$(stored_password)"
  [ -n "$pw" ] || die "cannot read $SECRET in $PROJECT_ID (not stored yet, or gcloud is signed out or lacks access). Run: scripts/play-release.sh store-password"
  echo "OK: $SECRET is readable (${#pw} characters)."
}

cmd_store_password() {
  local pw
  read -rsp "Keystore password (hidden; the key uses the same one): " pw; echo
  echo "Got ${#pw} characters."
  [ -n "$pw" ] || die "empty password, nothing stored"
  if $GCLOUD --project "$PROJECT_ID" secrets describe "$SECRET" >/dev/null 2>&1; then
    printf '%s' "$pw" | $GCLOUD --project "$PROJECT_ID" secrets versions add "$SECRET" --data-file=-
  else
    printf '%s' "$pw" | $GCLOUD --project "$PROJECT_ID" secrets create "$SECRET" --replication-policy=automatic --data-file=-
  fi
  echo "Stored as $SECRET in $PROJECT_ID. Only project owners can read it unless you grant more."
}

manifest_code() { grep -oE '"appVersionCode": *[0-9]+' "$MANIFEST" | grep -oE '[0-9]+$'; }

cmd_build() {
  local code=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --code) code="${2:?--code needs a number}"; shift 2 ;;
      *) usage ;;
    esac
  done
  [ -f "$MANIFEST" ] || die "$MANIFEST not found"
  [ -f "$ANDROID_DIR/android.keystore" ] || die "$ANDROID_DIR/android.keystore not found (the upload key; restore it from your backup)"
  command -v "$BUBBLEWRAP" >/dev/null || die "bubblewrap is not installed (npm i -g @bubblewrap/cli, on this machine, not in the repo)"
  case "$(git branch --show-current 2>/dev/null)" in
    main|master) echo "Note: you are on main. Version bump edits $MANIFEST; make a branch (c-android-wrapper-vN) before committing it." >&2 ;;
  esac

  local old new
  old="$(manifest_code)"; [ -n "$old" ] || die "no appVersionCode in $MANIFEST"
  new="${code:-$((old + 1))}"
  case "$new" in ''|*[!0-9]*) die "version code must be a whole number, got '$new'" ;; esac
  [ "$new" -ge 1 ] || die "version code must be 1 or more"

  # Globals, not locals: the EXIT trap runs after this function has returned.
  ok=false; backup="$(mktemp)"; stamp="$(mktemp)"
  cp "$MANIFEST" "$backup"
  restore() { if [ "$ok" != true ]; then cp "$backup" "$MANIFEST"; echo "Build did not finish: $MANIFEST put back to version code $old_code." >&2; fi; rm -f "$backup" "$stamp"; }
  old_code="$old"
  trap restore EXIT

  # Fetch before editing anything, so a missing password costs nothing.
  local pw; pw="$(get_password)"

  sed -i -E "s/(\"appVersionCode\": *)[0-9]+/\1$new/; s/(\"appVersionName\": *)\"[^\"]*\"/\1\"$new\"/; s/(\"appVersion\": *)\"[^\"]*\"/\1\"$new\"/" "$MANIFEST"
  [ "$(manifest_code)" = "$new" ] && grep -qE "\"appVersionName\": *\"$new\"" "$MANIFEST" && grep -qE "\"appVersion\": *\"$new\"" "$MANIFEST" || die "could not set the version in $MANIFEST"
  echo "Version code $old -> $new."

  touch "$stamp"
  (
    cd "$ANDROID_DIR"
    export BUBBLEWRAP_KEYSTORE_PASSWORD="$pw" BUBBLEWRAP_KEY_PASSWORD="$pw"
    "$BUBBLEWRAP" update --skipVersionUpgrade
    "$BUBBLEWRAP" build
  )

  local got
  got="$(grep -oE 'versionCode +[0-9]+' "$ANDROID_DIR/app/build.gradle" | grep -oE '[0-9]+$' | head -1)"
  [ "$got" = "$new" ] || die "build.gradle says versionCode '$got', expected $new; do not upload"
  for f in app-release-bundle.aab app-release-signed.apk; do
    [ "$ANDROID_DIR/$f" -nt "$stamp" ] || die "$f was not written by this build; do not upload"
  done

  # Bubblewrap has rewritten other fields before (navigationColor, signingKey.path, minSdkVersion); say so if it did it again.
  local other; other="$(diff "$backup" "$MANIFEST" | grep -E '^[<>]' | grep -v 'appVersion' || true)"
  if [ -n "$other" ]; then echo "WARNING: Bubblewrap also changed these lines in $MANIFEST; read them before you upload:" >&2; echo "$other" >&2; fi
  local min; min="$(grep -oE '"minSdkVersion": *[0-9]+' "$MANIFEST" | grep -oE '[0-9]+$' || true)"
  [ "${min:-0}" -ge 24 ] || echo "WARNING: minSdkVersion is '${min:-missing}'; the build needs 24 or higher." >&2

  ok=true
  echo
  echo "Built version $new:"
  ls -l "$ANDROID_DIR/app-release-bundle.aab" "$ANDROID_DIR/app-release-signed.apk"
  echo
  echo "Next: sideload the .apk and check sign-in, the Today and Daily shortcuts and no Billing in Settings; upload the .aab in Play Console"
  echo "(Test and release, Closed testing, Create new release); then commit $MANIFEST on a branch."
}

cmd="${1:-}"; [ -n "$cmd" ] || usage
shift
case "$cmd" in
  build) cmd_build "$@" ;;
  check) cmd_check ;;
  store-password) cmd_store_password ;;
  *) usage ;;
esac

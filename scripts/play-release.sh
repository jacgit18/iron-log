#!/usr/bin/env bash
# Builds the Google Play bundle for the Android wrapper (a Trusted Web Activity; android/README.md, ops/play-release-runbook.md) and sends it to a
# Play track through the Google Play Developer API, with no Play Console clicks. Run it by hand on your machine.
#
# Usage:  scripts/play-release.sh <command>      (or: npm run play:release -- <command>)
#   build [--code N]  raise appVersionCode by one (or set it to N), set appVersion and appVersionName to match, then `bubblewrap update --skipVersionUpgrade`
#                     and `bubblewrap build` in android/ with the passwords supplied. Writes app-release-bundle.aab (upload to Play) and
#                     app-release-signed.apk (sideload to test). If anything fails, twa-manifest.json is put back as it was.
#   upload [--track T] [--notes TEXT | --notes-file F] [--draft] [--yes]
#                     send android/app-release-bundle.aab to track T (or $PLAY_TRACK) with release notes, then commit it for Google's review. Shows what it
#                     will send and asks first (--yes skips the question; required when there is no terminal). --draft leaves it a draft in Play
#                     Console instead of rolling it out. Refuses a bundle whose version code is not the manifest's. Sideload-test the .apk first.
#   release [--code N] [upload options]   build, then upload (checks the track and the sign-in first, so a typo costs no build)
#   tracks            lists the app's tracks and their latest releases (read-only): the way to find your closed test's track name.
#   check             says whether the stored password can be read and how long it is, never what it is. Changes nothing.
#   store-password    asks for the keystore password (hidden, with a length check) and stores it in Secret Manager as the secret named below
#                     (a new version if it exists). Once, and again if the password ever changes.
#
# The password: BUBBLEWRAP_KEYSTORE_PASSWORD from your shell if set, else Secret Manager ($SECRET in project $PROJECT_ID, signed in with gcloud),
# else a hidden prompt. The key password is the same one (alias android). It is passed to Bubblewrap through its environment for that one run
# and never printed or written to a file. The keystore file itself (android/android.keystore) stays on this machine and is gitignored: back it up.
#
# The Play API: PLAY_SERVICE_ACCOUNT (the email of a service account invited in Play Console with release rights) and your gcloud sign-in, which must be
# allowed to create tokens for it (roles/iam.serviceAccountTokenCreator). A short-lived token is made for each run; there is no key file. PLAY_ACCESS_TOKEN
# (a token you made yourself) wins if set. The token goes to curl through its config on stdin, never on the command line. One-time setup:
# ops/play-release-runbook.md, "Releasing through the API".
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ID="${PROJECT_ID:-iron-log-jacgit18}"
SECRET="${PLAY_KEYSTORE_SECRET:-iron-log-play-upload-keystore-password}"
ANDROID_DIR="${ANDROID_DIR:-android}"          # overridable for tests
BUBBLEWRAP="${BUBBLEWRAP:-bubblewrap}"
GCLOUD="${GCLOUD:-gcloud}"
CURL="${CURL:-curl}"                            # overridable for tests
NODE="${NODE:-node}"
PLAY_API="${PLAY_API:-https://androidpublisher.googleapis.com}"
PLAY_SERVICE_ACCOUNT="${PLAY_SERVICE_ACCOUNT:-}"
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
  if [ -n "$code" ] && [ "$new" -le "$old" ]; then echo "Note: version code $new is not above the manifest's current $old. Play rejects a code it has already seen, so use one higher than your last upload." >&2; fi

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

  ok=true; rm -f "$backup" "$stamp"; trap - EXIT
  echo
  echo "Built version $new:"
  ls -l "$ANDROID_DIR/app-release-bundle.aab" "$ANDROID_DIR/app-release-signed.apk"
  echo
  echo "Next: sideload the .apk and check sign-in, the Today and Daily shortcuts and no Billing in Settings; then"
  echo "scripts/play-release.sh upload --track <track> (or upload in Play Console); then commit $MANIFEST on a branch."
}

# ---- Play API --------------------------------------------------------------------------------------------------------------------------------

# json_get a.b: one value from JSON on stdin ("" when missing or not JSON).
json_get() { $NODE -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=process.argv[1].split(".").reduce((o,k)=>o[k],JSON.parse(s));if(v!==undefined&&v!==null)process.stdout.write(String(v))}catch{}})' "$1"; }

package_id() { grep -oE '"packageId": *"[^"]+"' "$MANIFEST" | sed -E 's/.*: *"([^"]+)"/\1/'; }

# A token for the Play API: PLAY_ACCESS_TOKEN, else one made for the service account from your gcloud sign-in (IAM Credentials API).
play_token() {
  if [ -n "${PLAY_ACCESS_TOKEN:-}" ]; then printf '%s' "$PLAY_ACCESS_TOKEN"; return; fi
  [ -n "$PLAY_SERVICE_ACCOUNT" ] || die "set PLAY_SERVICE_ACCOUNT to the service account's email (one-time setup: ops/play-release-runbook.md, 'Releasing through the API')"
  local user resp tok
  user="$($GCLOUD auth print-access-token </dev/null 2>/dev/null || true)"
  [ -n "$user" ] || die "gcloud is signed out: run 'gcloud auth login'"
  resp="$(printf 'header = "Authorization: Bearer %s"\n' "$user" | $CURL -sS -X POST -K - -H 'Content-Type: application/json' \
    -d '{"scope":["https://www.googleapis.com/auth/androidpublisher"]}' \
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/$PLAY_SERVICE_ACCOUNT:generateAccessToken" || true)"
  tok="$(printf '%s' "$resp" | json_get accessToken)"
  [ -n "$tok" ] || die "could not get a token for $PLAY_SERVICE_ACCOUNT: $(printf '%s' "$resp" | json_get error.message). Your account needs roles/iam.serviceAccountTokenCreator on it, and the IAM Credentials API enabled."
  printf '%s' "$tok"
}

# api METHOD URL [curl args]: prints the JSON answer; dies with Google's own message on a non-2xx. The token reaches curl on stdin, not argv.
api() {
  local method="$1" url="$2"; shift 2
  local out status body
  out="$(printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | $CURL -sS -X "$method" -K - -w $'\n%{http_code}' "$@" "$url")" || die "request failed: $method ${url%%\?*}"
  status="${out##*$'\n'}"; body="${out%$'\n'*}"
  case "$status" in
    2??) printf '%s' "$body" ;;
    *) die "Google answered $status for $method ${url%%\?*}: $(printf '%s' "$body" | json_get error.message)" ;;
  esac
}

# An edit that is not committed changes nothing in Play, but delete it so none are left open after a failure.
cleanup_edit() { if [ -n "${EDIT_ID:-}" ]; then ( api DELETE "$EDIT_URL/$EDIT_ID" ) >/dev/null 2>&1 || true; fi; }

open_edit() {
  TOKEN="$(play_token)"
  PKG="$(package_id)"; [ -n "$PKG" ] || die "no packageId in $MANIFEST"
  EDIT_URL="$PLAY_API/androidpublisher/v3/applications/$PKG/edits"
  EDIT_ID="$(api POST "$EDIT_URL" -H 'Content-Type: application/json' -d '{}' | json_get id)"
  [ -n "$EDIT_ID" ] || die "Google gave no edit id"
  trap cleanup_edit EXIT
}

cmd_tracks() {
  open_edit
  echo "Tracks of $PKG (track name, then each release's status and version codes):"
  api GET "$EDIT_URL/$EDIT_ID/tracks" | $NODE -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const t of (JSON.parse(s).tracks||[]))console.log(`  ${t.track}\t`+((t.releases||[]).map(r=>`${r.status} ${(r.versionCodes||[]).join(",")}`).join("; ")||"(no releases)"))})'
}

cmd_upload() {
  local track="${PLAY_TRACK:-}" notes="" notes_file="" status=completed yes=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --track) track="${2:?--track needs a name}"; shift 2 ;;
      --notes) notes="${2:?--notes needs text}"; shift 2 ;;
      --notes-file) notes_file="${2:?--notes-file needs a path}"; shift 2 ;;
      --draft) status=draft; shift ;;
      --yes) yes=true; shift ;;
      *) usage ;;
    esac
  done
  [ -n "$track" ] || die "no track: pass --track NAME or set PLAY_TRACK. Run 'tracks' to see the names (a closed test is 'alpha' unless you named it)."
  local aab="$ANDROID_DIR/app-release-bundle.aab" code
  [ -f "$aab" ] || die "$aab not found: run 'build' first"
  code="$(manifest_code)"; [ -n "$code" ] || die "no appVersionCode in $MANIFEST"
  if [ -n "$notes_file" ]; then [ -f "$notes_file" ] || die "$notes_file not found"; notes="$(cat "$notes_file")"; fi
  [ -n "$notes" ] || notes="Loadbearer app update (version $code)."
  [ "${#notes}" -le 500 ] || die "release notes are ${#notes} characters; Play allows 500"

  echo "About to send to Google Play:"
  echo "  app:     $(package_id)"
  echo "  bundle:  $aab ($(du -h "$aab" | cut -f1), modified $(date -r "$aab" '+%Y-%m-%d %H:%M'))"
  echo "  version: $code"
  echo "  track:   $track ($status)"
  echo "  notes:   $notes"
  if [ "$yes" != true ]; then
    [ -t 0 ] || die "no terminal to ask on: pass --yes to send without asking"
    local answer; read -rp "Send it? Sideload-test the .apk first if you have not. [y/N] " answer
    case "$answer" in y|Y|yes) ;; *) die "cancelled; nothing was sent" ;; esac
  fi

  open_edit
  local up got body
  up="$(api POST "${PLAY_API}/upload/androidpublisher/v3/applications/$PKG/edits/$EDIT_ID/bundles?uploadType=media" \
    -H 'Content-Type: application/octet-stream' --max-time 900 --data-binary @"$aab")"
  got="$(printf '%s' "$up" | json_get versionCode)"
  [ "$got" = "$code" ] || die "Google read versionCode '$got' from the bundle but the manifest says $code; nothing was released (the edit is discarded). Rebuild with 'build'."
  body="$($NODE -e 'const [track,status,code,notes,lang]=process.argv.slice(1);console.log(JSON.stringify({track,releases:[{name:code,versionCodes:[code],status,releaseNotes:[{language:lang,text:notes}]}]}))' "$track" "$status" "$code" "$notes" "${PLAY_NOTES_LANG:-en-US}")"
  api PUT "$EDIT_URL/$EDIT_ID/tracks/$track" -H 'Content-Type: application/json' -d "$body" >/dev/null
  api POST "$EDIT_URL/$EDIT_ID:commit" -d '' >/dev/null
  EDIT_ID=""; trap - EXIT
  echo "Sent version $code to the '$track' track ($status). Google reviews it next; Play Console, Publishing overview, shows where it is."
}

cmd_release() {
  local build_args=() upload_args=() track="${PLAY_TRACK:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --code) build_args+=(--code "${2:?--code needs a number}"); shift 2 ;;
      --track) track="${2:?--track needs a name}"; upload_args+=(--track "$track"); shift 2 ;;
      *) upload_args+=("$1"); shift ;;
    esac
  done
  # Fail before the build, not after it, when the upload could not work anyway.
  [ -n "$track" ] || die "no track: pass --track NAME or set PLAY_TRACK (run 'tracks' to see the names)"
  TOKEN="$(play_token)"; unset TOKEN
  cmd_build ${build_args[@]+"${build_args[@]}"}
  cmd_upload ${upload_args[@]+"${upload_args[@]}"}
}

cmd="${1:-}"; [ -n "$cmd" ] || usage
shift
case "$cmd" in
  build) cmd_build "$@" ;;
  upload) cmd_upload "$@" ;;
  release) cmd_release "$@" ;;
  tracks) cmd_tracks ;;
  check) cmd_check ;;
  store-password) cmd_store_password ;;
  *) usage ;;
esac

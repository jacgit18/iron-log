# Android app (Trusted Web Activity)

The Google Play build is a thin Android shell around `https://loadbearer.app` (ADR 078, `PLAY-STORE-READINESS.md` in the project docs). This folder holds only its config; there is no build tooling in the repo and no package was added. Billing: none. The app sells and links nothing (Stripe stays on the web, ADR 065 point 8), so `features` is empty: do not turn on `playBilling`.

## What is here

- `twa-manifest.json`: Bubblewrap config ([field list](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)). `packageId` is `app.loadbearer` (chosen 2026-10-27 by delegation from the owner, who may veto it before the first Play upload; it is permanent once the app is published). Colors, start URL, icons and name match the web manifest (`vite.config.js`); `scripts/twaManifest.test.js` checks that they stay in step. `minSdkVersion` is 24: Bubblewrap's default of 21 fails the build because `androidbrowserhelper` 2.7.4 needs API 24 (first build, 2026-10-28). The file is what the first Play upload was built from (version code 1); `bubblewrap init` rewrites it with its own defaults, so read the diff afterwards (it once set `navigationColor` to black, `signingKey.path` to an absolute path and `minSdkVersion` back to 21).
- `/.well-known/assetlinks.json` is served by the API (`server/assetLinks.ts`) from two Cloud Run variables, so no file lives here: `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated, `AA:BB:...`, 32 bytes). Unset or malformed gives a 404.

## Owner steps (in this order)

1. Package name: `app.loadbearer` (already in `packageId`). If the owner vetoes it, change it before the first upload in `twa-manifest.json`, `scripts/twaManifest.test.js` and step 4; after that it cannot change.
2. Build the bundle with Bubblewrap ([Chrome quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)): `npm i -g @bubblewrap/cli` (on your machine, not in this repo), `bubblewrap init --manifest=https://loadbearer.app/manifest.webmanifest` (re-apply this file's values), then `bubblewrap build`. It produces an `.aab` for Play and a signed `.apk` for a device. Check the generated `build.gradle` has `targetSdk` 36 or higher (Play requirement, readiness row 3). PWABuilder (pwabuilder.com) makes the same package from the site if you prefer a web tool. Run Bubblewrap inside `android/`; the repo's `.gitignore` keeps what it writes there (`*.keystore`, `*.jks`, `*.aab`, `*.apk`, `app/`, `.gradle/`, `build/`, `local.properties`, Gradle files) out of version control, but back the keystore and its passwords up somewhere safe yourself: losing the upload key is a Play support case. `twa-manifest.json` and this README stay tracked.
3. Create the app in Play Console and upload the `.aab` to a closed test track with Play App Signing on. The 14-day, 12-tester clock starts once testers opt in.
4. In Play Console, App integrity (App signing), copy the **SHA-256 certificate fingerprint of the app signing key** (not the upload key). Set `ANDROID_PACKAGE_NAME=app.loadbearer` (the route stays env-driven: unset gives a 404) and `ANDROID_SHA256_CERT_FINGERPRINTS` on the production Cloud Run service (add the upload key's fingerprint too if you sideload test builds); the names are in `ops/secrets-urls-and-domain-change.md`. They are read on every request, so no deploy is needed, and the deploy script leaves variables it does not set alone.
5. Verify: open `https://loadbearer.app/.well-known/assetlinks.json` (200, `application/json`), then ask Google: `https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://loadbearer.app&relation=delegate_permission/common.handle_all_urls&target.android_app.package_name=<package>&target.android_app.certificate.sha256_fingerprint=<fingerprint>` must answer `"linked": true`. Then install from the closed track on a phone: no address bar means the check passed.
6. Real-phone checks that are still `not run`: the `android-app://` referrer hides Plans, push inside the app, Lighthouse of the shipped wrapper.

## Shipping a wrapper update

Only the wrapper needs a Play release. Website and API changes go out with the normal deploy (`deploy-cloud-run.yml`) and reach Android users on their next launch, with no Play review. A wrapper change is the icon, launcher name, colors, shortcuts, notification delegation, `minSdkVersion` or `targetSdkVersion`, or a Bubblewrap or library version; changes to the web manifest's name, colors or icons do not reach installed apps without one. Billing stays hidden in the app by the web code (`inAndroidApp()`), so a web deploy never needs a Play release to keep it hidden.

1. Raise `appVersionCode` in `twa-manifest.json` (Play rejects a code it has seen). Keep `minSdkVersion` at 24 or higher.
2. In `android/`: `bubblewrap update --skipVersionUpgrade && bubblewrap build`, typing the keystore and key passwords yourself (alias `android`). It writes `app-release-bundle.aab` (upload this) and `app-release-signed.apk` (sideload to test; `*.idsig` is ignored).
3. Test the `.apk` on a phone: signs in, the Today and Daily shortcuts work, Settings has no Billing section.
4. Upload the `.aab` to a new release in Play Console; production releases are reviewed by Google.
5. Check `https://loadbearer.app/.well-known/assetlinks.json` still lists the Play signing fingerprint.

Not automated, on purpose (a few releases a year at most). The plan for a manually triggered CI job is in the project backlog ("Automate the Play wrapper release"). Runbook with the gotchas (a pinned Cloud Run revision after `gcloud run services update`, the cached asset-links check): `ops/play-release-runbook.md` in the project docs.

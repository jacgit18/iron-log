# Android app (Trusted Web Activity)

The Google Play build is a thin Android shell around `https://loadbearer.app` (ADR 078, `PLAY-STORE-READINESS.md` in the project docs). This folder holds only its config; there is no build tooling in the repo and no package was added. Billing: none. The app sells and links nothing (Stripe stays on the web, ADR 065 point 8), so `features` is empty: do not turn on `playBilling`.

## What is here

- `twa-manifest.json`: Bubblewrap config ([field list](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)). `packageId` is a **placeholder (`com.example.changeme`) the owner must replace**; it is permanent once the app is published. Colors, start URL, icons and name match the web manifest (`vite.config.js`); `scripts/twaManifest.test.js` checks that they stay in step.
- `/.well-known/assetlinks.json` is served by the API (`server/assetLinks.ts`) from two Cloud Run variables, so no file lives here: `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated, `AA:BB:...`, 32 bytes). Unset or malformed gives a 404.

## Owner steps (in this order)

1. Choose the package name (reverse domain, for example `app.loadbearer.twa`; letters, digits, underscores, dots). Put it in `packageId` here (and update `scripts/twaManifest.test.js`) and in step 4.
2. Build the bundle with Bubblewrap ([Chrome quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)): `npm i -g @bubblewrap/cli` (on your machine, not in this repo), `bubblewrap init --manifest=https://loadbearer.app/manifest.webmanifest` (re-apply this file's values), then `bubblewrap build`. It produces an `.aab` for Play and a signed `.apk` for a device. Check the generated `build.gradle` has `targetSdk` 36 or higher (Play requirement, readiness row 3). PWABuilder (pwabuilder.com) makes the same package from the site if you prefer a web tool. Keep the keystore and its passwords out of git.
3. Create the app in Play Console and upload the `.aab` to a closed test track with Play App Signing on. The 14-day, 12-tester clock starts once testers opt in.
4. In Play Console, App integrity (App signing), copy the **SHA-256 certificate fingerprint of the app signing key** (not the upload key). Set `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_CERT_FINGERPRINTS` on the production Cloud Run service (add the upload key's fingerprint too if you sideload test builds); the names are in `ops/secrets-urls-and-domain-change.md`. They are read on every request, so no deploy is needed, and the deploy script leaves variables it does not set alone.
5. Verify: open `https://loadbearer.app/.well-known/assetlinks.json` (200, `application/json`), then ask Google: `https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://loadbearer.app&relation=delegate_permission/common.handle_all_urls&target.android_app.package_name=<package>&target.android_app.certificate.sha256_fingerprint=<fingerprint>` must answer `"linked": true`. Then install from the closed track on a phone: no address bar means the check passed.
6. Real-phone checks that are still `not run`: the `android-app://` referrer hides Plans, push inside the app, Lighthouse of the shipped wrapper.

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { AREAS } from './scripts/coverage-areas.mjs';

const base = process.env.BASE_PATH || '/';

// Preload the title's font (Barlow Condensed 700, Latin). Fonts are otherwise only requested once the app
// has rendered, so on a first visit the title is drawn in a much wider fallback font, the header wraps, and
// the page jumps when the font arrives (layout shift up to 0.55 at some widths on Slow 4G; ~0.04 with this).
// Only this one file: preloading the other weights too cost ~250 ms more first paint for no further gain.
function preloadTitleFont() {
  return {
    name: 'preload-title-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) => Object.keys(ctx.bundle || {})
        .filter(f => /barlow-condensed-latin-700-normal-[\w-]+\.woff2$/.test(f))
        .map(f => ({ tag: 'link', attrs: { rel: 'preload', href: base + f, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' })),
    },
  };
}

// Inline the entry stylesheet (about 14 KB gzipped) into index.html. A linked stylesheet blocks the first paint and costs a second round trip
// (Lighthouse mobile: render-blocking, about 0.3 s on Slow 4G); inlined, the first paint needs only the page and the script. The
// service worker precaches index.html, so repeat and offline visits lose nothing. The file itself stays in the build: the tabs loaded later
// list it as a dependency and would fail with "Unable to preload CSS" (and their screen would not open) if it were gone.
function inlineEntryCss() {
  return {
    name: 'inline-entry-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) => html.replace(/<link rel="stylesheet"[^>]*href="[^"]*\/(assets\/index-[\w-]+\.css)"[^>]*>/, (tag, file) => {
        const asset = ctx.bundle?.[file];
        if (!asset || asset.type !== 'asset') return tag;
        return `<style>${String(asset.source).replace(/<\/style/gi, '<\\/style')}</style>`;
      }),
    },
  };
}

// Fails the build when a script, stylesheet or the page refers to a built file (assets/<name>.js or .css) that is not in the output.
// A lazy chunk lists the stylesheets it needs; when the entry stylesheet was left out of the build, the sign-in code failed at run time with
// "Unable to preload CSS" and no check that runs without the API noticed. Now that is a build error, with the names.
function checkReferencedAssets() {
  let outDir = 'dist';
  return {
    name: 'check-referenced-assets',
    apply: 'build',
    configResolved: config => { outDir = join(config.root, config.build.outDir); },
    closeBundle() {
      const dir = join(outDir, 'assets');
      if (!existsSync(dir)) return;
      const have = new Set(readdirSync(dir));
      const missing = new Set();
      const scan = file => { for (const [, name] of readFileSync(file, 'utf8').matchAll(/assets\/([\w.-]+\.(?:js|css))\b/g)) if (!have.has(name)) missing.add(name); };
      for (const f of have) if (/\.(js|css)$/.test(f)) scan(join(dir, f));
      if (existsSync(join(outDir, 'index.html'))) scan(join(outDir, 'index.html'));
      if (missing.size) throw new Error(`The build refers to files that are not in it: ${[...missing].join(', ')}`);
    },
  };
}

// The server answers /delete-account with public/delete-account.html (server/app.ts). The dev and preview servers would hand out the
// app's index.html for that extensionless path, so they map it to the same file and the e2e test reaches the address Google Play links to.
function deleteAccountPage() {
  const rewrite = (req, _res, next) => { if (/^\/delete-account(\?|$)/.test(req.url)) req.url = req.url.replace('/delete-account', '/delete-account.html'); next(); };
  return {
    name: 'delete-account-page',
    configureServer: server => { server.middlewares.use(rewrite); },
    configurePreviewServer: server => { server.middlewares.use(rewrite); },
  };
}

// The dev and preview servers answer any unknown path with the app's index.html, so a request for
// /.well-known/ai-catalog.json (Lighthouse's agentic audit) got HTML and failed as malformed. There's no such
// file, so say so with a 404, the same as GitHub Pages does. The same goes for a built file under /assets/ that is not in dist: the
// production server answers 404 there, but the preview server answered 200 with the page, which hid a missing stylesheet from every
// local test (the e2e fixture now fails a test on any /assets/ 404).
function noWellKnownFallback() {
  const notFound = (req, res, next) => { if (req.url.startsWith('/.well-known/')) { res.statusCode = 404; res.end(); } else next(); };
  const missingAsset = dist => (req, res, next) => {
    let path;
    try { path = decodeURIComponent(req.url.split('?')[0]); } catch { res.statusCode = 404; res.end(); return; } // a malformed escape is not a file
    const at = path.indexOf('/assets/');
    if (at >= 0 && !path.includes('..') && !existsSync(join(dist, path.slice(at)))) { res.statusCode = 404; res.end(); } else next();
  };
  return {
    name: 'no-well-known-fallback',
    configureServer: server => { server.middlewares.use(notFound); },
    configurePreviewServer: server => { server.middlewares.use(notFound); server.middlewares.use(missingAsset(resolve(server.config.root, server.config.build.outDir))); }, // the build folder this server serves, which --outDir can change
  };
}

// BASE_PATH lets the same build run at a sub-path (e.g. /iron-log/ on GitHub Pages).
// The version the app sends with every API request (ADR 003, FM-03) is the unix time, in seconds, of the commit it was built
// from, so the API can refuse builds older than MIN_CLIENT_VERSION. APP_VERSION sets it where there is no git history (the
// Docker build passes it in); with neither it is "dev".
const commitTime = () => {
  try { return execSync('git log -1 --format=%ct', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
};
const appVersion = [process.env.APP_VERSION, commitTime()].find(v => v && /^\d{1,12}$/.test(v)) || 'dev';

// Playwright's specs in e2e/, e2e-sync/ and e2e-accounts/ are run by `npm run e2e` and `npm run e2e:sync`, not Vitest.
// .claude/worktrees holds agents' copies of the repo.
const SKIP = ['**/node_modules/**', 'e2e/**', 'e2e-sync/**', 'e2e-accounts/**', '.claude/**'];

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // The API runs on its own port in development; the app calls it on its own origin, as it will in production (ADR 010).
  // The proxy keeps the browser's Host header, as production's single origin does, so the API's Origin check (originGuard) sees a same-origin page.
  server: { proxy: { '/api': { target: process.env.API_ORIGIN || 'http://localhost:3001', changeOrigin: false } } },
  test: {
    // `npm run coverage` (scripts/coverage-report.mjs). Vitest 5's v8 provider reports a file that no test loads as 0 statements / 100%,
    // so the totals cover loaded files only; the report script lists the unloaded ones next to them and --check caps them.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx,js,jsx}', 'server/**/*.{ts,js}'],
      exclude: ['**/*.test.*', '**/*.d.ts', 'src/test/**', 'server/test/**'],
      reporter: ['json-summary'],
      reportsDirectory: 'coverage',
      // ADR 069: a floor per logic area, from scripts/coverage-areas.mjs (the same list holds each area's cap on files no test loads).
      thresholds: Object.fromEntries(Object.entries(AREAS).filter(([, a]) => a.floor).map(([k, a]) => [`${k}/**`, a.floor])),
    },
    // Two projects so the server tests, which start a Postgres container each, get a 30 s limit instead of Vitest's 5 s: on a busy machine
    // (several sessions' checks at once) a slow start is not a failure. Everything else keeps the default. A server test file is any
    // *.test.* under server/; the app project takes the rest.
    projects: [
      { extends: true, test: { name: 'server', include: ['server/**/*.test.{js,jsx,ts,tsx}'], exclude: SKIP, testTimeout: 30_000, globalSetup: ['server/test/globalSetup.ts'] } },
      { extends: true, test: { name: 'app', include: ['**/*.test.{js,jsx,ts,tsx}'], exclude: [...SKIP, 'server/**'] } },
    ],
  },
  plugins: [
    react(),
    preloadTitleFont(),
    deleteAccountPage(),
    inlineEntryCss(),
    noWellKnownFallback(),
    checkReferencedAssets(),
    VitePWA({
      // A new version is applied only when the app is idle (see UpdateBanner, ADR 018); otherwise a banner offers it, so an update never interrupts a workout.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['logo.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Loadbearer',
        short_name: 'Loadbearer',
        description: 'A weekly workout board with A/B program rotation, phase-based targets, timers and a muscle map.',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#1E2326',
        background_color: '#EEF0EC',
        categories: ['health', 'fitness', 'sports'],
        // Long-press the home-screen icon (Android). Both open the app on a tab; the store reads ?open= (lib/viewState.ts).
        shortcuts: [
          { name: "Today's workout", short_name: 'Today', url: './?open=board', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Daily log', short_name: 'Daily', url: './?open=daily', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Our own worker (src/sw.ts) instead of a generated one, to receive Web Push (ADR 044). It keeps everything the generated one did:
      // the precache, the offline page fallback (with /api left to the server), the landing-image cache and the update handshake.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Everything the app needs, including the Excel reader and fonts, is cached so it works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The iOS splash images are only fetched by iPhone Safari at install time, so they stay out of the offline cache.
        globIgnores: ['splash/**'],
      },
    }),
  ],
});

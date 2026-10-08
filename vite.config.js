import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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

// The dev and preview servers answer any unknown path with the app's index.html, so a request for
// /.well-known/ai-catalog.json (Lighthouse's agentic audit) got HTML and failed as malformed. There's no such
// file, so say so with a 404, the same as GitHub Pages does.
function noWellKnownFallback() {
  const notFound = (req, res, next) => { if (req.url.startsWith('/.well-known/')) { res.statusCode = 404; res.end(); } else next(); };
  return {
    name: 'no-well-known-fallback',
    configureServer: server => { server.middlewares.use(notFound); },
    configurePreviewServer: server => { server.middlewares.use(notFound); },
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

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // The API runs on its own port in development; the app calls it on its own origin, as it will in production (ADR 010).
  // The proxy keeps the browser's Host header, as production's single origin does, so the API's Origin check (originGuard) sees a same-origin page.
  server: { proxy: { '/api': { target: process.env.API_ORIGIN || 'http://localhost:3001', changeOrigin: false } } },
  // Playwright's specs in e2e/ and e2e-sync/ are run by `npm run e2e` and `npm run e2e:sync`, not Vitest.
  test: { exclude: ['**/node_modules/**', 'e2e/**', 'e2e-sync/**'] },
  plugins: [
    react(),
    preloadTitleFont(),
    noWellKnownFallback(),
    VitePWA({
      // Updates wait for you: a banner offers to reload, so a new version never interrupts a workout.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['logo.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Iron Log',
        short_name: 'Iron Log',
        description: 'A weekly workout board with A/B program rotation, phase-based targets, timers and a muscle map.',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#1F5E5B',
        background_color: '#EEF0EC',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs, including the Excel reader and fonts, is cached so it works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // The API shares the origin (ADR 010). A page load of an /api path, such as the sign-in callback, must reach the
        // server, not be answered with the app by the service worker.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});

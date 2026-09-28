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

// BASE_PATH lets the same build run at a sub-path (e.g. /iron-log/ on GitHub Pages).
export default defineConfig({
  base,
  plugins: [
    react(),
    preloadTitleFont(),
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
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});

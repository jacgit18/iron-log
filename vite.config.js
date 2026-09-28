import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the same build run at a sub-path (e.g. /iron-log/ on GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
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

/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow passes
// the repository name in; local dev falls back to the current repo name.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'TravelPlanner';
const base = `/${repo}/`;

export default defineConfig({
  base,
  plugins: [
    react(),
    // Installable app that opens offline. The service worker precaches only the app's own files
    // (HTML, JS, CSS, icons). It has no runtime caching rules, so requests to other sites (GitHub,
    // Cloudflare, Google Maps, map tiles, place search, exchange rates) are never cached: offline they fail
    // and the app shows what's saved on the device.
    VitePWA({
      registerType: 'prompt', // a new version waits until you tap "Update available"
      injectRegister: false,  // registered from the app (src/pwa.ts)
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-64.png'],
      manifest: {
        name: 'Trip Planner',
        short_name: 'Trips',
        description: 'Plan a trip day by day: stays, flights, transport, things to do and places to eat.',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        orientation: 'any',
        theme_color: '#ffffff',      // light; dark mode uses the <meta name="theme-color" media=…> tags in index.html
        background_color: '#f7f8fa',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [], // nothing from other sites is cached
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  test: { include: ['src/**/*.test.ts', 'email-worker/src/**/*.test.ts'] },
});

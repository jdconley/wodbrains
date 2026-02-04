import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:8787';
const proxyShareRoutes = process.env.VITE_PROXY_SHARE_ROUTES === '1';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'WOD Brains',
        short_name: 'WOD Brains',
        description: 'WOD Brains magically builds a smart timer from any workout.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    // In local dev, the API lives on the Worker (Wrangler) server.
    // Proxy all /api requests to keep the SPA single-origin.
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        ws: true,
      },
      ...(proxyShareRoutes
        ? {
            // Optional: proxy share/OG routes to the Worker so "View Source" reflects
            // server-side meta tag injection during local development.
            '/w': { target: apiOrigin, changeOrigin: true },
            '/r': { target: apiOrigin, changeOrigin: true },
            '/og': { target: apiOrigin, changeOrigin: true },
          }
        : {}),
    },
  },
  build: {
    // Worker serves from apps/worker/public via Static Assets.
    outDir: '../worker/public',
    emptyOutDir: true,
  },
});

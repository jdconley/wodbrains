import { defineConfig } from 'vite';

const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:8787';
const proxyShareRoutes = process.env.VITE_PROXY_SHARE_ROUTES === '1';

export default defineConfig({
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

import { defineConfig } from 'vite';

const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:8787';

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
    },
  },
  build: {
    // Worker serves from apps/worker/public via Static Assets.
    outDir: '../worker/public',
    emptyOutDir: true,
  },
});

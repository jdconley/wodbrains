import { defineConfig } from '@playwright/test';

const workerPort = Number(process.env.E2E_WORKER_PORT ?? 8788);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);
const workerOrigin = `http://localhost:${workerPort}`;
const webOrigin = `http://localhost:${webPort}`;
const workerHealthUrl = `${workerOrigin}/api/ping`;

if (process.env.CI) {
  console.log('[playwright] CI webServer config', {
    workerPort,
    webPort,
    workerOrigin,
    workerHealthUrl,
    webOrigin,
  });
}

export default defineConfig({
  testDir: 'apps/web/e2e',
  // README screenshot/video generation specs are intentionally slow and have side effects
  // (writing to `docs/`). Keep them out of the normal E2E suite.
  testIgnore: ['**/readme-*.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        `echo "[playwright] starting worker webServer (migrate + wrangler dev) on ${workerOrigin}" && ` +
        `pnpm --filter worker db:migrate:local && ` +
        `echo "[playwright] worker DB migrated; starting wrangler dev..." && ` +
        `pnpm --filter worker exec wrangler dev --local --port ${workerPort} --var STUB_PARSE:1`,
      url: workerHealthUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `echo "[playwright] starting web webServer (vite) on ${webOrigin}" && pnpm --filter web dev -- --port ${webPort}`,
      url: webOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_ORIGIN: workerOrigin,
      },
    },
  ],
});

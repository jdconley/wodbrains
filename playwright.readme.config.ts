import { defineConfig } from '@playwright/test';

const workerPort = Number(process.env.E2E_WORKER_PORT ?? 8788);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);
const workerOrigin = `http://localhost:${workerPort}`;
const webOrigin = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: 'apps/web/e2e',
  testMatch: ['**/readme-*.spec.ts'],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        `pnpm --filter worker db:migrate:local && ` +
        `pnpm --filter worker exec wrangler dev --local --port ${workerPort} --var STUB_PARSE:1`,
      url: workerOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter web dev -- --port ${webPort}`,
      url: webOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_ORIGIN: workerOrigin,
      },
    },
  ],
});

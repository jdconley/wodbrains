import { defineConfig } from '@playwright/test';

// CI sometimes binds dev servers differently across IPv4/IPv6.
// Use explicit hosts per server to avoid readiness checks hanging.
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const workerHost = process.env.E2E_WORKER_HOST ?? '127.0.0.1';
// In GitHub Actions, prefer an explicit IPv4 host for the Vite server.
// (Some runners resolve `localhost` in ways that don't match Vite's bind address.)
const webHost = process.env.E2E_WEB_HOST ?? (isGitHubActions ? '127.0.0.1' : 'localhost');
const webListenHost = process.env.E2E_WEB_LISTEN_HOST ?? webHost;
const workerPort = Number(process.env.E2E_WORKER_PORT ?? 8788);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);
const workerOrigin = `http://${workerHost}:${workerPort}`;
const webOrigin = `http://${webHost}:${webPort}`;
const workerHealthUrl = `${workerOrigin}/api/ping`;
// Reusing an existing server can make E2E tests flaky (e.g. when `pnpm dev` is already
// running on the E2E ports but without `STUB_PARSE=1`). Keep reuse opt-in.
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === '1';

export default defineConfig({
  testDir: 'apps/web/e2e',
  // README screenshot/video generation specs are intentionally slow and have side effects
  // (writing to `docs/`). Keep them out of the normal E2E suite.
  testIgnore: ['**/readme-*.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // In GitHub Actions, serve the SPA from the worker itself to avoid Vite
    // host/resolution issues in CI. The workflow builds the web app before tests,
    // so the worker's assets binding can serve the compiled SPA.
    baseURL: isGitHubActions ? workerOrigin : webOrigin,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: isGitHubActions
    ? [
        {
          command:
            `pnpm --filter worker db:migrate:local && ` +
            `pnpm --filter worker exec wrangler dev --local --ip ${workerHost} --port ${workerPort} --var STUB_PARSE:1`,
          url: workerHealthUrl,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : [
        {
          command:
            `pnpm --filter worker db:migrate:local && ` +
            `pnpm --filter worker exec wrangler dev --local --ip ${workerHost} --port ${workerPort} --var STUB_PARSE:1`,
          url: workerHealthUrl,
          reuseExistingServer,
          timeout: 120_000,
        },
        {
          command:
            // NOTE: use `pnpm exec vite` instead of `pnpm run dev -- ...` so Vite receives
            // flags directly (some runners treat `--` as an arg terminator).
            `pnpm --filter web exec vite --host ${webListenHost} --port ${webPort} --strictPort`,
          url: webOrigin,
          reuseExistingServer,
          timeout: 120_000,
          env: {
            VITE_API_ORIGIN: workerOrigin,
          },
        },
      ],
});

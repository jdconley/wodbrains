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

if (process.env.CI) {
  console.log('[playwright] CI webServer config', {
    workerHost,
    webHost,
    webListenHost,
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
    // In GitHub Actions, serve the SPA from the worker itself to avoid Vite
    // host/resolution issues in CI. The workflow builds the web app before tests,
    // so the worker's assets binding can serve the compiled SPA.
    baseURL: isGitHubActions ? workerOrigin : webOrigin,
    trace: 'retain-on-failure',
  },
  webServer: isGitHubActions
    ? [
        {
          command:
            `echo "[playwright] starting worker webServer (migrate + wrangler dev) on ${workerOrigin}" >&2 && ` +
            `pnpm --filter worker db:migrate:local && ` +
            `echo "[playwright] worker DB migrated; starting wrangler dev..." >&2 && ` +
            `pnpm --filter worker exec wrangler dev --local --ip ${workerHost} --port ${workerPort} --var STUB_PARSE:1`,
          // When serving the SPA from the worker, wait on the same origin used for tests.
          url: workerOrigin,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : [
        {
          command:
            `echo "[playwright] starting worker webServer (migrate + wrangler dev) on ${workerOrigin}" >&2 && ` +
            `pnpm --filter worker db:migrate:local && ` +
            `echo "[playwright] worker DB migrated; starting wrangler dev..." >&2 && ` +
            `pnpm --filter worker exec wrangler dev --local --ip ${workerHost} --port ${workerPort} --var STUB_PARSE:1`,
          url: workerHealthUrl,
          reuseExistingServer: !process.env.CI,
          // Make it obvious in CI logs which server is hanging.
          timeout: 45_000,
        },
        {
          command:
            `echo "[playwright] starting web webServer (vite) on ${webOrigin}" >&2 && ` +
            `pnpm --filter web dev -- --host ${webListenHost} --port ${webPort} --strictPort`,
          url: webOrigin,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            VITE_API_ORIGIN: workerOrigin,
          },
        },
      ],
});

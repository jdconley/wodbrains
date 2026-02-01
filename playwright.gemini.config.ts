import { defineConfig } from '@playwright/test';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
const apiVar = apiKey ? ` --var GOOGLE_GENERATIVE_AI_API_KEY:${apiKey}` : '';

export default defineConfig({
  testDir: 'apps/web/e2e-live',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'pnpm --filter web build && pnpm --filter worker db:migrate:local && pnpm --filter worker exec wrangler dev --local --port 8787 --var STUB_PARSE:0' +
      apiVar,
    url: 'http://localhost:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

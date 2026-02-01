---
name: run-live-evals
description: Run Wodbrains worker parse evals and live Gemini tests locally using Wrangler `.dev.vars` keys. Use when you need to run `parse.evals.test.ts` / `parse.gemini.test.ts` against the real model (RUN_LIVE_AI_TESTS=1).
---

# Run live evals (worker)

## What this runs

- `apps/worker/test/parse.evals.test.ts` (the eval manifest / fixtures)
- `apps/worker/test/parse.gemini.test.ts` (text + URL + image live parsing)

These are “live” because they call the real Gemini API using `GOOGLE_GENERATIVE_AI_API_KEY`.

## Prereqs

- Ensure `apps/worker/.dev.vars` exists and contains `GOOGLE_GENERATIVE_AI_API_KEY=...`
- Do not commit `.dev.vars` (it contains secrets)

## Run

From repo root:

```bash
pnpm test:live-evals
```

Equivalent manual command:

```bash
set -a && . "apps/worker/.dev.vars" && set +a && RUN_LIVE_AI_TESTS=1 \
  pnpm --filter worker test -- test/parse.evals.test.ts test/parse.gemini.test.ts
```

## Common gotchas

- **Tests “skipped”**: live suites are gated on `RUN_LIVE_AI_TESTS=1` and a present API key.
- **Workers runtime env**: in `@cloudflare/vitest-pool-workers` tests, prefer `cloudflare:test` `env` bindings for gates instead of relying on `process.env`.

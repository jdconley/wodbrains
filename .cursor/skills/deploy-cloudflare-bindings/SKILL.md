---
name: deploy-cloudflare-bindings
description: Update deploy CI when adding Cloudflare bindings (R2/D1/DO/assets) or new wrangler config env vars. Use when deploy.yml fails after adding a new Worker binding or when introducing new required env in wrangler.jsonc generation.
---

# Deploy Cloudflare Bindings (CI + Prod)

This repo generates `apps/worker/wrangler.jsonc` from env vars via `scripts/generate-wrangler-config.mjs`, and CI runs with `WRANGLER_GEN_STRICT=1`. Adding new Worker bindings often requires **updating CI secrets/env** and **creating the Cloudflare resource** (e.g., an R2 bucket) before deployment.

## When you add a new binding (checklist)

### 1) Update the wrangler config generator

- Add the new binding to `scripts/generate-wrangler-config.mjs` so `pnpm wrangler:gen` produces the correct `apps/worker/wrangler.jsonc`.
- If the generator needs new env vars, add them using `requiredEnv()` if it must be present in CI, or `optionalEnv() ?? <default>` when a safe default exists.

Example (R2 bucket):
- New env var: `CLOUDFLARE_R2_BUCKET_<NAME>`
- New wrangler section: `r2_buckets: [{ binding: '<BINDING_NAME>', bucket_name: <env> }]`

### 2) Add required secrets/env vars to GitHub Actions

If CI uses `WRANGLER_GEN_STRICT=1`, missing env vars will fail the workflow during tests or pre-deploy.

- Add a GitHub Secret for each new required env var, e.g.:
  - `CLOUDFLARE_R2_BUCKET_OG_IMAGES = <bucket_name>`

### 3) Update `.github/workflows/deploy.yml`

In this repo, `deploy.yml` must pass all `wrangler:gen` env vars in **two places**:

- **Run tests** step (tests may call `pnpm wrangler:gen` indirectly)
- **Generate wrangler.jsonc** step (regenerate strictly after tests, before migrations/deploy)

Add the new env var(s) to both steps:

```yaml
env:
  WRANGLER_GEN_STRICT: '1'
  CLOUDFLARE_D1_DATABASE_ID: ${{ secrets.CLOUDFLARE_D1_DATABASE_ID }}
  CLOUDFLARE_ZONE_NAME: ${{ secrets.CLOUDFLARE_ZONE_NAME }}
  CLOUDFLARE_ROUTE_WODBRAINS: ${{ secrets.CLOUDFLARE_ROUTE_WODBRAINS }}
  CLOUDFLARE_ROUTE_WWW: ${{ secrets.CLOUDFLARE_ROUTE_WWW }}
  CLOUDFLARE_R2_BUCKET_OG_IMAGES: ${{ secrets.CLOUDFLARE_R2_BUCKET_OG_IMAGES }}
```

### 4) Create the Cloudflare resource in production

Create the backing resource in the target account **before** deploying.

Example (R2 bucket):

```bash
pnpm --filter worker exec wrangler r2 bucket create <bucket_name>
```

Notes:
- This is a one-time operation per bucket name.
- Bucket names are global *within your Cloudflare account* (not global across all users).

### 5) Deploy + migrate (if needed)

If you added D1 migrations:

```bash
pnpm --filter worker db:migrate:remote
```

Then deploy:

```bash
pnpm --filter worker deploy
```

## Common gotcha

### “CI deploy fails after adding a binding”

Root causes are usually:
- The Cloudflare resource (bucket/kv) doesn’t exist yet in prod, **or**
- `WRANGLER_GEN_STRICT=1` is enabled but the new `CLOUDFLARE_*` env var was not provided in CI (tests step and/or strict regeneration step).

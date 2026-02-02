## Local development

### Install

```bash
pnpm install
```

### Environment variables (`dotenvx`)

Package `package.json` scripts are executed through `dotenvx`, which loads env files when present.

- **Package scripts** load (in order): `<package>/.env.local`, `<package>/.env`, then the workspace root `.env.local`, `.env`
- The workspace root `wrangler:gen` script is also run through `dotenvx` (loads `.env.local`, then `.env`)

Note: if a referenced file doesn’t exist, `dotenvx` will print `[MISSING_ENV_FILE]` lines but continue running.

### Apply local D1 migrations

```bash
pnpm --filter worker db:migrate:local
```

Note: `apps/worker/wrangler.jsonc` is **generated locally** (it is gitignored). The worker scripts will auto-generate it, but you must set the required Cloudflare env vars first (see below).

### Build the SPA into the Worker assets directory

```bash
pnpm --filter web build
```

### Run the Worker locally (serves SPA + API + Durable Objects)

```bash
pnpm --filter worker dev --local --port 8787
```

Optional: copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` and fill in:

- `BETTER_AUTH_SECRET`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `MIGRATE_TOKEN` (admin viewer access)
- `GITHUB_ISSUES_TOKEN` (GitHub issue creation)
- `GITHUB_ISSUES_REPO` (e.g. `owner/repo`)
- `GITHUB_ISSUES_LABELS` (optional, comma-separated)

### Parse feedback viewer (admin)

Open the admin viewer at:

```
https://wodbrains.com/admin/parse-feedback?token=YOUR_TOKEN
```

Use the same `MIGRATE_TOKEN` value configured for the Worker.

### Required Cloudflare env vars (local + CI)

These are used to generate `apps/worker/wrangler.jsonc` via `pnpm wrangler:gen`:

- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_ZONE_NAME`
- `CLOUDFLARE_ROUTE_WODBRAINS` (e.g. `wodbrains.com`)
- `CLOUDFLARE_ROUTE_WWW` (e.g. `www.wodbrains.com`)

## Tests

```bash
pnpm exec vitest run
pnpm --filter worker test
pnpm --filter web test
```

## Deployment (Cloudflare)

Prereqs:

- `pnpm --filter web build`
- `wrangler login`

### GitHub Actions secrets (deploy.yml)

The production deploy workflow expects these GitHub Secrets to exist:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_ZONE_NAME`
- `CLOUDFLARE_ROUTE_WODBRAINS`
- `CLOUDFLARE_ROUTE_WWW`
- `BETTER_AUTH_SECRET`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `MIGRATE_TOKEN` (admin viewer)
- `GITHUB_ISSUES_TOKEN` (optional)
- `GITHUB_ISSUES_REPO` (optional)
- `GITHUB_ISSUES_LABELS` (optional)

1. Create the D1 database (first time only):

```bash
pnpm --filter worker exec wrangler d1 create wodbrains
```

Copy the returned `database_id` into your environment as `CLOUDFLARE_D1_DATABASE_ID`.

2. Apply migrations:

```bash
pnpm --filter worker db:migrate:remote
```

3. Configure secrets:

```bash
pnpm --filter worker exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter worker exec wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
```

4. Deploy:

```bash
pnpm --filter worker run deploy
```

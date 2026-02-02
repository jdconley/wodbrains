---
name: debug-ci-workflows
description: Debug failing GitHub Actions workflows (especially deploy + Playwright E2E) in this repo. Use when CI fails in tests, webServer readiness hangs, or Playwright can't launch browsers.
---

# Debug CI Workflows (GitHub Actions + Playwright) — WOD Brains

This skill captures the proven workflow for quickly diagnosing and fixing failing `deploy.yml` runs in this repo.

## Fast Triage (from CI)

1. List recent runs:

```bash
gh run list --workflow deploy.yml --limit 10
```

2. Inspect the failing run:

```bash
gh run view <run_id> --log-failed
gh run view <run_id> --json status,conclusion,url,displayTitle
```

3. Classify the failure:

- **Playwright browser missing**
  - Symptom: `browserType.launch: Executable doesn't exist at ...`
  - Fix: install Playwright browsers during CI (see “Fix Patterns”).
- **Playwright webServer readiness hang**
  - Symptom: `Error: Timed out waiting <ms> from config.webServer.`
  - Fix: treat it as “server didn’t start” or “URL not reachable from runner” (see “webServer Debugging”).
- **dotenvx missing env file warnings**
  - Symptom: many `[MISSING_ENV_FILE]` lines.
  - Usually noisy but non-fatal; focus on the first real error after them.

## Local Reproduction (CI-like)

### Option A: Reproduce in a Linux Playwright container (recommended)

This avoids macOS networking differences and matches CI more closely.

```bash
docker run --rm -v "$PWD":/repo -w /repo mcr.microsoft.com/playwright:v1.58.0-jammy \
  bash -lc '
    corepack enable &&
    corepack prepare pnpm@10.28.1 --activate &&
    CI=true pnpm install --frozen-lockfile --prefer-offline &&
    GITHUB_ACTIONS=true CI=true pnpm -r --workspace-concurrency=1 test
  '
```

Gotchas:

- If pnpm errors with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, set `CI=true` (as above).
- Avoid copying `node_modules` between platforms; native deps like `workerd` can break (install inside the container).

### Option B: Reproduce with `act` (workflow-level)

Useful when you need the exact workflow steps/secrets behavior.

- If secrets contain `*` and you use zsh, quote them to avoid glob expansion:

```bash
act -W .github/workflows/deploy.yml -j deploy \
  -s 'CLOUDFLARE_ROUTE_WODBRAINS=example.com/*' \
  -s 'CLOUDFLARE_ROUTE_WWW=www.example.com/*'
```

## Playwright webServer Debugging

When CI fails with `Timed out waiting ... from config.webServer`:

1. Ensure **each server binds** to a host/port that the readiness URL can reach.
2. Prefer a **health endpoint** for readiness (`/api/ping`) rather than `/`.
3. If the hang is only in CI, consider a **CI-specific server strategy**:
   - In this repo, CI builds the web app before tests.
   - The worker can serve the built SPA from `apps/worker/public/`.
   - Serving E2E from the worker origin avoids separate Vite dev-server flakiness in CI.

Local tip:

- Don’t run two Playwright suites simultaneously; they will collide on fixed ports.
- To avoid collisions, override ports:

```bash
E2E_WORKER_PORT=8790 E2E_WEB_PORT=5176 pnpm --filter web test
```

## Fix Patterns (the ones that actually worked)

### Install Playwright browsers in CI

GitHub Actions runners do **not** guarantee Playwright browsers are preinstalled.

Add a workflow step after dependencies install:

```yaml
- name: Install Playwright browsers
  run: pnpm exec playwright install --with-deps chromium
```

### Keep E2E stable in CI

If a Vite dev server is unreliable in CI:

- Run E2E against the **worker-served** built app in CI (`baseURL` pointing at the worker origin), while keeping local dev/E2E using Vite for a better dev experience.

## Verify the Fix (don’t stop early)

1. Commit minimal change(s).
2. Push.
3. Watch the run to completion:

```bash
gh run list --workflow deploy.yml --limit 1
gh run watch <run_id> --exit-status
```

4. If the fix required temporary debug logging, remove it and re-verify with another green run.

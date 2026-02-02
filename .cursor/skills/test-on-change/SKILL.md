---
name: test-on-change
description: Always create and run tests affected by changes, including Playwright for UI changes. Use when modifying Wodbrains features or UI.
---

# Test On Change

## When to Use

- Any feature or UI change in Wodbrains
- New functionality that affects runtime behavior
- Changes that touch timer/run flow, core logic, or API usage

## Core Rules

1. Always create tests for the changes you make (unit + UI when relevant).
2. Always run the affected tests before finishing.
3. If tests require Playwright, run it explicitly and resolve failures.
4. Treat this skill as an augmentation of existing testing conventions, not a replacement.

## Unit Test Workflow (Core)

Use Vitest for `packages/core` changes:

```bash
pnpm -C packages/core test
```

## UI/E2E Test Workflow (Playwright)

Playwright tests live in `apps/web/e2e` and use the root config:

```bash
pnpm run test:e2e
```

### Important Gotchas

- Playwright starts **worker + Vite** on dedicated ports by default:
  - Worker: `8788` via `E2E_WORKER_PORT`
  - Vite: `5174` via `E2E_WEB_PORT`
- This lets you keep your dev servers on `8787` / `5173` running.
- Override ports if needed:
  - `E2E_WORKER_PORT=8790 E2E_WEB_PORT=5176 pnpm run test:e2e`
- Vite proxies `/api` to `VITE_API_ORIGIN`, which Playwright sets to the worker port.

### If startup fails due to port conflicts (kill leftover processes)

Sometimes Playwright fails during webServer startup with errors like `EADDRINUSE` / “port is already in use”. This can also leave the dev servers running even though the test run exited. When that happens:

1. Identify the ports in use (defaults: `5174` + `8788`, or your `E2E_WEB_PORT` / `E2E_WORKER_PORT` overrides).
2. Find the listening process PID(s) and kill them.
3. Re-run `pnpm run test:e2e`.

On macOS/Linux:

```bash
# Find which process is listening on the port
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:8788 -sTCP:LISTEN

# Then terminate the PID(s) shown (try TERM first, then KILL if needed)
kill <PID>
kill -9 <PID>
```

### Stub Parse Behavior

The Playwright webServer runs the worker with `STUB_PARSE=1`, which always returns a fixed “for time” workout definition. UI tests that depend on specific workout shapes must align with this stub output (e.g., rounds-for-time).

## UI Test Patterns

When starting a run from the definition page, use the same flow as existing tests:

```ts
await page.locator('#startCountdown').click();
await expect(page).toHaveURL(/\/r\/[^?]+/);
await expect(page.locator('#timerValue')).toBeVisible();
await expect(page.locator('#startOverlay')).toBeVisible();
```

### Keeping Playwright fast (timer/run tests)

Rules:

- Keep **one slower test** that validates real production behavior for shared runs (the real **10s** countdown).
- Make all other run tests **fast-start** by scheduling the `start` event ~1s out via API, instead of waiting for the 10s overlay.

Preferred helper:

- Use `apps/web/e2e/helpers/run.ts` → `fastStartRun(page, { delayMs?: number })`

Example:

```ts
await page.locator('#startCountdown').click();
await expect(page).toHaveURL(/\/r\/[^?]+/);
await expect(page.locator('#startOverlay')).toBeVisible();

// Avoid waiting for the real 10s countdown in most tests:
await fastStartRun(page, { delayMs: 1000 });
await expect(page.locator('#pause')).toBeEnabled();
```

### One “real countdown” test

Maintain a single E2E that clicks `#startOverlay` and asserts the real countdown window. This test is allowed to be slower and should cover:

- leader + participant contexts
- countdown overlay appears on both
- overlay hides after ~10s (tolerant bounds for CI)

### Avoid long waits caused by blocking overlays

If an overlay is purely visual (e.g. rep celebration), it should not block clicks for seconds in tests or UX.

Guideline:

- Prefer **`pointer-events: none`** on visual celebration overlays, even while active, so tests don’t need `waitForTimeout(2600)`.

### Web Share API tests

To test share buttons quickly and deterministically, stub `navigator.share`:

```ts
await page.addInitScript(() => {
  (navigator as any).share = async (data: any) => {
    (window as any).__lastShare = data;
  };
});

await page.locator('#startShareBtn').click();
const share = await page.evaluate(() => (window as any).__lastShare);
expect(share.text.startsWith('Workout at the same time with friends')).toBe(true);
```

## Example Run (Core + Playwright)

```bash
pnpm -C packages/core test && pnpm -w exec playwright test --config /Users/jd/src/wodbrains/playwright.config.ts
```

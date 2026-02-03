import { expect, type Page } from '@playwright/test';

type FastStartOptions = {
  delayMs?: number;
};

export async function fastStartRun(page: Page, opts?: FastStartOptions) {
  const delayMs = Math.max(100, Math.floor(opts?.delayMs ?? 1000));
  const runId = page.url().match(/\/r\/([^?]+)/)?.[1];
  expect(runId).toBeTruthy();

  const snapshot = await page.evaluate(
    async ({ runId: id }) => {
      const res = await fetch(`/api/runs/${id}`, { credentials: 'include' });
      const json = await res.json();
      return json as { serverNowMonoMs?: number };
    },
    { runId },
  );

  const serverNowMonoMs = snapshot.serverNowMonoMs ?? 0;
  expect(serverNowMonoMs).toBeGreaterThan(0);
  const atMs = Math.round(serverNowMonoMs + delayMs);

  await page.evaluate(
    async ({ runId: id, atMs: startAtMs }) => {
      await fetch(`/api/runs/${id}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'start', atMs: startAtMs }),
      });
    },
    { runId, atMs },
  );

  // Once running, leader controls appear.
  await expect(page.locator('#pause')).toBeEnabled({ timeout: 15000 });
}

type StartRunFromDefinitionOptions = {
  /** Total time to wait per attempt for /r/:id navigation. */
  timeoutMs?: number;
  /** Retry count if starting a run fails transiently. */
  attempts?: number;
};

export async function startRunFromDefinition(page: Page, opts?: StartRunFromDefinitionOptions) {
  const timeoutMs = Math.max(5000, Math.floor(opts?.timeoutMs ?? 15_000));
  const attempts = Math.max(1, Math.floor(opts?.attempts ?? 3));

  const startBtn = page.locator('#startCountdown');
  await expect(startBtn).toBeVisible();

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await startBtn.click();
      await expect(page).toHaveURL(/\/r\/[^?]+/, { timeout: timeoutMs });
      await expect(page.locator('#timerValue')).toBeVisible({ timeout: timeoutMs });
      return;
    } catch (e) {
      lastErr = e;
      if (attempt >= attempts) break;
      // Give the app a moment to recover (e.g. transient proxy / worker errors).
      await page.waitForTimeout(350);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Failed to start run from definition');
}

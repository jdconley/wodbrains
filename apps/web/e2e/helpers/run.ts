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

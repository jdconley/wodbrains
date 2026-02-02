import { expect, test, type Page } from '@playwright/test';
import { LATEST_DATA_VERSION } from '@wodbrains/core';
import { fastStartRun } from './helpers/run';

const parseTimerMs = (value: string): number => {
  const text = value.trim();
  const [minsPart, rest] = text.split(':');
  if (!rest) return 0;
  const [secsPart, tenthsPart] = rest.split('.');
  const mins = Number.parseInt(minsPart ?? '0', 10);
  const secs = Number.parseInt(secsPart ?? '0', 10);
  const tenths = Number.parseInt(tenthsPart ?? '0', 10);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || !Number.isFinite(tenths)) return 0;
  return (mins * 60 + secs) * 1000 + tenths * 100;
};

const readTimerMs = async (page: Page) => {
  const text = (await page.locator('#timerValue').textContent()) ?? '0:00.0';
  return parseTimerMs(text);
};

test('break overlay advances to next segment', async ({ page }) => {
  const timerPlan = {
    id: 'break-plan',
    schemaVersion: LATEST_DATA_VERSION,
    title: 'Break Test',
    root: {
      type: 'sequence',
      blockId: 'root',
      label: 'Workout',
      segments: [
        { type: 'timer', blockId: 'prep', label: 'Prep', mode: 'countdown', durationMs: 1000 },
        { type: 'timer', blockId: 'break', label: 'Break', mode: 'countup' },
        { type: 'timer', blockId: 'go', label: 'Go', mode: 'countdown', durationMs: 8000 },
      ],
    },
  };

  await page.goto('/');
  // Runs require an authenticated (anonymous) session cookie.
  await page.evaluate(async () => {
    const res = await fetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  });
  const runId = await page.evaluate(async (plan) => {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timerPlan: plan }),
    });
    if (!res.ok) throw new Error(`create run failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { runId?: string };
    if (!json.runId) throw new Error('Run id missing');
    return json.runId;
  }, timerPlan);

  await page.goto(`/r/${encodeURIComponent(runId)}?timeScale=2`);
  await expect(page.locator('#timerValue')).toBeVisible();
  await fastStartRun(page, { delayMs: 500 });

  const breakOverlay = page.locator('#breakOverlay');
  const continueBtn = page.locator('#breakContinue');

  await expect(breakOverlay).toBeVisible({ timeout: 10000 });
  await expect(continueBtn).toBeEnabled();

  await continueBtn.click();
  await expect(breakOverlay).toBeHidden();

  const t1 = await readTimerMs(page);
  await page.waitForTimeout(200);
  const t2 = await readTimerMs(page);
  expect(t2).toBeLessThan(t1);
});

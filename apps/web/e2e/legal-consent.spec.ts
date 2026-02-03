import { expect, test } from '@playwright/test';
import { LATEST_DATA_VERSION } from '@wodbrains/core';

test('first generate requires click-through legal consent', async ({ page }) => {
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 burpees');
  await page.locator('#generate').click();

  const accept = page.locator('#legalAccept');
  await expect(accept).toBeVisible();
  await expect(accept).toBeDisabled();

  await page.locator('#legalAgreeCheck').check();
  await expect(accept).toBeEnabled();

  await accept.click();

  await expect(page).toHaveURL(/\/w\//);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();

  // Acceptance persists for subsequent generates.
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 burpees');
  await page.locator('#generate').click();
  await expect(page.locator('#legalAccept')).toHaveCount(0);
  await expect(page).toHaveURL(/\/w\//);
});

test('viewing a run requires click-through legal consent', async ({ page }) => {
  const timerPlan = {
    id: 'legal-run-plan',
    schemaVersion: LATEST_DATA_VERSION,
    title: 'Legal Run Test',
    root: {
      type: 'sequence',
      blockId: 'root',
      label: 'Workout',
      segments: [
        { type: 'timer', blockId: 'prep', label: 'Prep', mode: 'countdown', durationMs: 2000 },
      ],
    },
  };

  await page.goto('/');
  // Runs require an authenticated (anonymous) session cookie.
  const runId = await page.evaluate(async (plan) => {
    await fetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timerPlan: plan }),
    });
    if (!res.ok) throw new Error(`create run failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { runId?: string };
    if (!json.runId) throw new Error('runId missing');
    return json.runId;
  }, timerPlan);

  await page.goto(`/r/${encodeURIComponent(runId)}`);
  await expect(page.locator('#legalAccept')).toBeVisible();

  await page.locator('#legalAgreeCheck').check();
  await page.locator('#legalAccept').click();

  await expect(page.locator('#timerValue')).toBeVisible();
});

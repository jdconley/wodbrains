import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fastStartRun } from './helpers/run';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

const evalWorkout = `3 Sets
Each Set is a 3 Min AMRAP
(As Many Rounds and Reps As Possible in 3 Minutes)

9 Dumbbell Hang Power Clean
6 Air Squat
3 Burpee
Rest 1 Minute Between Sets`;

test('readme screenshots', async ({ browser }) => {
  test.setTimeout(120_000);
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

  const portraitContext = await browser.newContext({ viewport: PORTRAIT });
  const page = await portraitContext.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/');
  await page.locator('#input').fill(evalWorkout);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'import.png'), fullPage: true });

  await page.locator('#generate').click();
  await expect(page).toHaveURL(/\/w\//);
  const definitionRouteUrl = new URL(page.url());
  const definitionParts = definitionRouteUrl.pathname.split('/').filter(Boolean);
  const definitionId = definitionParts[1];
  if (definitionParts[2] === 'edit' && definitionId) {
    await page.goto(`/w/${definitionId}`);
    await expect(page).toHaveURL(/\/w\/[^/]+$/);
  }
  await expect(page.locator('#builderTree')).toContainText('repeat');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'definition.png'), fullPage: true });

  await page.locator('#startCountdown').click();
  await expect(page).toHaveURL(/\/r\/[^?]+/);
  await expect(page.locator('#timerValue')).toBeVisible();
  await expect(page.locator('#startOverlay')).toBeVisible();
  await fastStartRun(page, { delayMs: 1000 });
  await page.setViewportSize(LANDSCAPE);
  await expect(page.locator('#pause')).toBeEnabled();
  await page.waitForTimeout(4500);
  await expect(page.locator('#tapHint')).not.toHaveClass(/visible/);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'run-landscape.png'), fullPage: true });

  await portraitContext.close();

  const leaderContext = await browser.newContext({ viewport: LANDSCAPE });
  const participantContext = await browser.newContext({ viewport: LANDSCAPE });
  const leader = await leaderContext.newPage();
  const participant = await participantContext.newPage();

  await leader.emulateMedia({ reducedMotion: 'reduce' });
  await participant.emulateMedia({ reducedMotion: 'reduce' });

  await leader.goto('/');
  await leader.locator('#input').fill('For time: 50 burpees');
  await leader.locator('#generate').click();
  await expect(leader).toHaveURL(/\/w\//);

  const definitionUrl = new URL(leader.url());
  const leaderDefinitionId = definitionUrl.pathname.split('/').pop();
  expect(leaderDefinitionId).toBeTruthy();

  const runId = await leader.evaluate(async (definitionIdValue) => {
    const defRes = await fetch(`/api/definitions/${definitionIdValue}`, {
      credentials: 'include',
    });
    const def = (await defRes.json()) as { timerPlan?: unknown };
    const runRes = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timerPlan: def.timerPlan, definitionId: definitionIdValue }),
    });
    const created = (await runRes.json()) as { runId: string };
    return created.runId;
  }, leaderDefinitionId);

  const origin = definitionUrl.origin;
  const runUrl = `${origin}/r/${encodeURIComponent(runId)}`;

  await leader.goto(runUrl);
  await expect(leader.locator('#timerValue')).toBeVisible();
  await participant.goto(runUrl);
  await expect(participant.locator('#timerValue')).toBeVisible();

  await expect(participant.locator('#runCornerLine')).toContainText('Participant');
  await expect(leader.locator('#runCornerLine')).toContainText('Leader');
  await expect(leader.locator('#runCornerLine')).toContainText('2 online');

  await fastStartRun(leader, { delayMs: 1000 });
  await expect(leader.locator('#pause')).toBeEnabled();
  await expect(participant.locator('#pause')).toHaveCount(0);

  await leader.waitForTimeout(4500);
  await expect(leader.locator('#tapHint')).not.toHaveClass(/visible/);
  await expect(participant.locator('#tapHint')).not.toHaveClass(/visible/);
  await leader.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'multiplayer-leader.png'),
    fullPage: true,
  });
  await participant.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'multiplayer-participant.png'),
    fullPage: true,
  });

  await leaderContext.close();
  await participantContext.close();
});

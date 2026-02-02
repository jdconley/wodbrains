import { expect, test, type Page } from '@playwright/test';
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

test('leader and participant stay in sync', async ({ browser }) => {
  const leaderContext = await browser.newContext();
  const participantContext = await browser.newContext();
  const leader = await leaderContext.newPage();

  await leader.goto('/');
  await leader.locator('#input').fill('For time: 50 burpees');
  await leader.locator('#generate').click();
  await expect(leader).toHaveURL(/\/w\//);

  const definitionUrl = new URL(leader.url());
  const definitionId = definitionUrl.pathname.split('/').pop();
  expect(definitionId).toBeTruthy();

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
  }, definitionId);

  const origin = definitionUrl.origin;
  const runUrl = `${origin}/r/${encodeURIComponent(runId)}`;
  const leaderUrl = `${runUrl}?timeScale=10`;

  await leader.goto(leaderUrl);
  await expect(leader.locator('#timerValue')).toBeVisible();
  await expect(leader.locator('#runCornerLine')).not.toContainText('Leader');

  const participant = await participantContext.newPage();
  await participant.goto(runUrl);
  await expect(participant.locator('#timerValue')).toBeVisible();

  await expect(participant.locator('#runCornerLine')).toContainText('Participant');
  await expect(leader.locator('#runCornerLine')).toContainText('Leader');
  await expect(leader.locator('#runCornerLine')).toContainText('2 online');

  const leaderScale = leader.locator('#runCornerScale');
  await expect(leaderScale).toHaveText('x 10');

  const participantScale = participant.locator('#runCornerScale');
  await expect(participantScale).toHaveText('x 10');

  // Participant navigates away (SPA navigation) -> leader should update online count promptly.
  await participant.evaluate(() => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(leader.locator('#runCornerLine')).toHaveText('', { timeout: 5000 });

  // Participant returns to run.
  await participant.goto(runUrl);
  await expect(participant.locator('#timerValue')).toBeVisible();
  await expect(leader.locator('#runCornerLine')).toContainText('2 online');

  await fastStartRun(leader, { delayMs: 1000 });

  await expect(leader.locator('#pause')).toBeEnabled();
  await expect(participant.locator('#pause')).toHaveCount(0);

  await leader.waitForTimeout(500);
  const [leaderMs, participantMs] = await Promise.all([
    readTimerMs(leader),
    readTimerMs(participant),
  ]);
  expect(Math.abs(leaderMs - participantMs)).toBeLessThan(1500);

  // Leader pauses -> participant should see "Paused by the Leader"
  await leader.locator('#pause').click();
  await expect(participant.locator('[data-testid="leader-note"]')).toHaveText(
    'Paused by the Leader',
  );

  // Leader ends -> participant should see "Ended by the Leader"
  await leader.locator('#pause').click(); // resume
  await leader.locator('#pause').click(); // pause again to show stop
  await leader.locator('[data-action="stop"]').click();
  await expect(participant.locator('[data-testid="leader-note"]')).toHaveText(
    'Ended by the Leader',
  );
});

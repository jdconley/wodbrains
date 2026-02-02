import { expect, test } from '@playwright/test';

test('run sharing: real 10s countdown (production behavior)', async ({ browser }) => {
  const leaderContext = await browser.newContext();
  const participantContext = await browser.newContext();
  const leader = await leaderContext.newPage();

  // Create a definition via UI (uses stub parse in Playwright webServer)
  await leader.goto('/');
  await leader.locator('#input').fill('For time: 50 burpees');
  await leader.locator('#generate').click();
  await expect(leader).toHaveURL(/\/w\//);

  // Start run (definition page creates run, run page is idle)
  await leader.locator('#startCountdown').click();
  await expect(leader).toHaveURL(/\/r\/[^?]+/);

  const runUrl = leader.url();
  const participant = await participantContext.newPage();
  await participant.goto(runUrl);

  await expect(leader.locator('#runCornerLine')).toContainText('Leader');
  await expect(participant.locator('#runCornerLine')).toContainText('Participant');
  await expect(leader.locator('#runCornerLine')).toContainText('2 online');

  // Click start overlay -> schedule start at now + 10s (real behavior)
  const overlay = leader.locator('#startOverlay');
  await expect(overlay).toBeVisible();
  await overlay.click();

  const countdownLeader = leader.locator('#countdownOverlay');
  const countdownParticipant = participant.locator('#countdownOverlay');

  await expect(countdownLeader).toHaveClass(/active/);
  await expect(countdownParticipant).toHaveClass(/active/);

  const t0 = Date.now();
  await expect(countdownLeader).not.toHaveClass(/active/, { timeout: 20_000 });
  const dt = Date.now() - t0;

  // Countdown is 10s, plus ~0.8s "GO" flash; allow wide tolerance for CI.
  expect(dt).toBeGreaterThan(9000);
  expect(dt).toBeLessThan(16000);
});

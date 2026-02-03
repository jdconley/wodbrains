import { expect, test } from '@playwright/test';
import { fastStartRun, startRunFromDefinition } from './helpers/run';
import { expectPillLabelButton, expectPillLabelButtonFlatOnHover } from './helpers/button-styles';
import { seedLegalAcceptance } from './helpers/legal';

const parseTimerMs = (value: string | null) => {
  if (!value) return 0;
  const [minsPart, rest] = value.trim().split(':');
  if (!rest) return 0;
  const [secsPart, tenthsPart] = rest.split('.');
  const mins = Number.parseInt(minsPart ?? '0', 10);
  const secs = Number.parseInt(secsPart ?? '0', 10);
  const tenths = Number.parseInt(tenthsPart ?? '0', 10);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || !Number.isFinite(tenths)) return 0;
  return (mins * 60 + secs) * 1000 + tenths * 100;
};

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

test('import text -> generate -> start -> run controls', async ({ page }) => {
  await page.goto('/');

  await page.locator('#input').fill('5 rounds for time: 5 push-ups, 10 sit-ups, 15 squats');
  const generateBtn = page.locator('#generate');
  await expectPillLabelButton(generateBtn);
  await expectPillLabelButtonFlatOnHover(generateBtn);
  await generateBtn.click();

  await expect(page).toHaveURL(/\/w\//);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();
  await expect(page.locator('[data-testid="builder-node"]').first()).toBeVisible();
  await startRunFromDefinition(page);

  const timer = page.locator('#timerValue');
  const pause = page.locator('#pause');
  const tapSurface = page.locator('#tapSurface');

  await expect(timer).toBeVisible();
  await expect(page.locator('#startOverlay')).toBeVisible();
  await fastStartRun(page);

  // Tap anywhere advances (safe no-op assertion; just ensure it doesn't throw)
  await tapSurface.click();

  // Pause freezes the timer
  await pause.click();
  // Wait for the UI to reflect the paused state (button switches to Resume).
  // Without this, the timer can advance a tick or two while the pause event round-trips.
  await expect(pause).toHaveAttribute('title', 'Resume');
  const t1 = parseTimerMs(await timer.textContent());
  await page.waitForTimeout(600);
  const t2 = parseTimerMs(await timer.textContent());
  expect(Math.abs(t2 - t1)).toBeLessThanOrEqual(100);

  // Resume makes the timer tick again
  await pause.click();
  await expect(pause).toHaveAttribute('title', 'Pause');
  await page.waitForTimeout(600);
  const t3 = parseTimerMs(await timer.textContent());
  expect(t3).toBeGreaterThan(t2);
});

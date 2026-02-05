import { expect, test, type Page } from '@playwright/test';
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

const dragSelect = async (page: Page, selector: string) => {
  const target = page.locator(selector);
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  const { x, y, width, height } = box;
  await page.mouse.move(x + 4, y + height / 2);
  await page.mouse.down();
  await page.mouse.move(x + width - 4, y + height / 2);
  await page.mouse.up();
};

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

test.describe('Rep celebration overlay', () => {
  test('tap shows celebration overlay with rep number and split time', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 50 burpees');
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//);

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // Tap to count a rep
    await page.locator('#tapSurface').click();

    // Celebration overlay should appear
    const celebration = page.locator('[data-testid="rep-celebration"]');
    await expect(celebration).toHaveClass(/active/);

    // Check content
    const repNumber = page.locator('#repCelebrationNumber');
    await expect(repNumber).toHaveText('1');

    const splitTime = page.locator('#repCelebrationSplit');
    await expect(splitTime).toContainText('+');
  });

  test('multiple taps show incrementing rep numbers', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 100 wall balls');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // First tap
    await page.locator('#tapSurface').click();
    await expect(page.locator('#repCelebrationNumber')).toHaveText('1');

    // Second tap
    await page.locator('#tapSurface').click();
    await expect(page.locator('#repCelebrationNumber')).toHaveText('2');
  });
});

test.describe('Stop and Reset buttons', () => {
  test('pausing shows stop and reset buttons', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 20 thrusters');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // Pause the timer
    await page.locator('#pause').click();

    // Control buttons should appear
    const resetBtn = page.locator('[data-action="reset"]');
    const stopBtn = page.locator('[data-action="stop"]');
    const resumeBtn = page.locator('.TimerControlBtn--resume');

    await expect(resetBtn).toBeVisible();
    await expect(stopBtn).toBeVisible();
    await expect(resumeBtn).toBeVisible();
  });

  test('resume button resumes the timer', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 15 pull-ups');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    const timer = page.locator('#timerValue');

    // Pause
    await page.locator('#pause').click();
    // Wait for paused UI state before sampling the timer to avoid flakiness where the
    // pause click is processed slightly after the timer sample (especially in CI).
    await expect(page.locator('.TimerControlBtn--resume')).toBeVisible();
    const t1 = parseTimerMs(await timer.textContent());
    await page.waitForTimeout(500);
    const t2 = parseTimerMs(await timer.textContent());
    expect(Math.abs(t2 - t1)).toBeLessThanOrEqual(100); // Timer should be frozen

    // Resume via the resume button
    await page.locator('.TimerControlBtn--resume').click();
    await page.waitForTimeout(500);
    const t3 = parseTimerMs(await timer.textContent());
    expect(t3).toBeGreaterThan(t2); // Timer should be running
  });

  test('stop button shows finish summary', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 10 deadlifts');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await page.locator('#startOverlay').click();
    await expect(page.locator('#pause')).toBeEnabled({ timeout: 15000 });

    // Count some reps
    await page.locator('#tapSurface').click();
    await page.waitForTimeout(300);
    await page.locator('#tapSurface').click();

    // Pause and stop
    await page.locator('#pause').click();
    await page.locator('[data-action="stop"]').click();

    // Finish overlay should appear
    const finishOverlay = page.locator('[data-testid="finish-overlay"]');
    await expect(finishOverlay).toBeVisible();

    // Check stats
    await expect(page.locator('#finishReps')).toHaveText('2');
    await expect(page.locator('#finishTime')).toContainText(':');
  });

  test('reset button creates new run in idle state', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 5 box jumps');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    // Extract just the run ID from the URL (without autostart param)
    const originalRunId = page.url().match(/\/r\/([^?]+)/)?.[1];
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // Pause and reset
    await page.locator('#pause').click();
    await page.locator('[data-action="reset"]').click();

    // Should navigate to a new run URL (without autostart)
    await page.waitForURL((url) => url.pathname !== `/r/${originalRunId}`);
    const newRunId = page.url().match(/\/r\/([^?]+)/)?.[1];
    expect(newRunId).not.toBe(originalRunId);

    // Should show start overlay (idle state)
    const startOverlay = page.locator('#startOverlay');
    await expect(startOverlay).toBeVisible();
  });
});

test.describe('Finish summary overlay', () => {
  test('done button navigates back to home', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 10 cleans');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // Pause and stop to show finish overlay
    await page.locator('#pause').click();
    await page.locator('[data-action="stop"]').click();

    const finishOverlay = page.locator('[data-testid="finish-overlay"]');
    await expect(finishOverlay).toBeVisible();

    // Click done
    const doneBtn = page.locator('#finishDone');
    await expectPillLabelButton(doneBtn);
    await expectPillLabelButtonFlatOnHover(doneBtn);
    await doneBtn.click();

    // Should navigate to home
    await expect(page).toHaveURL('/');
  });

  test('finish summary shows split list when reps counted', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 20 kettlebell swings');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // Count 3 reps
    await page.locator('#tapSurface').click();
    await page.waitForTimeout(300);
    await page.locator('#tapSurface').click();
    await page.waitForTimeout(300);
    await page.locator('#tapSurface').click();

    // Pause and stop
    await page.locator('#pause').click();
    await page.locator('[data-action="stop"]').click();

    // Check splits in finish overlay
    const finishOverlay = page.locator('[data-testid="finish-overlay"]');
    await expect(finishOverlay).toBeVisible();

    await expect(page.locator('#finishReps')).toHaveText('3');

    const splitRows = page.locator('.RunFinishSplitRow');
    await expect(splitRows).toHaveCount(3);
  });
});

test.describe('Run view selection behavior', () => {
  test('timer and buttons are not selectable, finish time is selectable', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 12 push-ups');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    await dragSelect(page, '#timerValue');
    const timerSelection = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(timerSelection).toBe('');

    await page.locator('#pause').click();
    await page.locator('[data-action="stop"]').click();
    const finishOverlay = page.locator('[data-testid="finish-overlay"]');
    await expect(finishOverlay).toBeVisible();

    await dragSelect(page, '#finishTime');
    const finishSelection = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(finishSelection).toContain(':');

    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await dragSelect(page, '#finishDone');
    const buttonSelection = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(buttonSelection).toBe('');
  });
});

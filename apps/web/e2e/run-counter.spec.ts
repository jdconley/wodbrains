import { expect, test } from '@playwright/test';
import { fastStartRun, startRunFromDefinition } from './helpers/run';
import { expectSquareIconButton } from './helpers/button-styles';
import { seedLegalAcceptance } from './helpers/legal';

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

test.describe('Timer rep counter', () => {
  test('for-time workout: tap shows celebration and rep counter visible when paused', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 50 burpees');
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//);

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // For-time workouts don't show round counters (only interval timers do)
    const roundCounter = page.locator('.TimerMetaText');
    await expect(roundCounter).toHaveCount(0);
    await expect(page.locator('#timerValue')).toHaveCSS('white-space', 'nowrap');

    // Tap to count rep - celebration overlay appears
    await page.locator('#tapSurface').click();
    const celebration = page.locator('[data-testid="rep-celebration"]');
    await expect(celebration).toHaveClass(/active/);
    await expect(page.locator('#repCelebrationNumber')).toHaveText('1');

    // Wait for celebration to clear, then pause to see persistent rep counter
    await expect(celebration).not.toHaveClass(/active/, { timeout: 4000 });

    const repCounter = page.locator('[data-testid="rep-counter"]');
    await expect(repCounter).toBeVisible();
    await expect(repCounter.first()).toContainText('1');

    const splitDisplay = page.locator('[data-testid="split-time"]');
    await expect(splitDisplay).toBeVisible();
    await expect(splitDisplay).toContainText('+');

    // Pause should show header actions (share + edit) for controller.
    // (Header is hidden while running.)
    await page.locator('#pause').click();
    await expect(page.locator('#runHeaderShare')).toBeVisible();
    await expect(page.locator('#runHeaderEdit')).toBeVisible();
  });

  test('stub parse: rounds for time counts reps via celebration', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('5 rounds: 30 sec work, 10 sec rest');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // For-time workouts don't show round counters (only interval timers do)
    const roundCounter = page.locator('.TimerMetaText');
    await expect(roundCounter).toHaveCount(0);

    // Tap twice, checking celebration shows correct count
    await page.locator('#tapSurface').click();
    await expect(page.locator('#repCelebrationNumber')).toHaveText('1');

    await page.locator('#tapSurface').click();
    await expect(page.locator('#repCelebrationNumber')).toHaveText('2');

    const repCounter = page.locator('[data-testid="rep-counter"]');
    await expect(repCounter).toBeVisible();
    await expect(repCounter.first()).toContainText('2');

    const splitDisplay = page.locator('[data-testid="split-time"]');
    await expect(splitDisplay).toBeVisible();
  });

  test('timer value stays on one line', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 10 push-ups');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#timerValue')).toHaveCSS('white-space', 'nowrap');
  });

  test('celebration split time shows non-zero value and matches timer display', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 50 burpees');
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//);

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    // Wait for timer to advance so elapsed time is non-zero
    await page.waitForTimeout(500);

    // Tap to record a rep - celebration overlay appears
    await page.locator('#tapSurface').click();
    const celebration = page.locator('[data-testid="rep-celebration"]');
    await expect(celebration).toHaveClass(/active/);
    await expect(page.locator('#repCelebrationNumber')).toHaveText('1');

    // Verify celebration split time shows non-zero value (not +0:00.0)
    const celebrationSplit = page.locator('#repCelebrationSplit');
    await expect(celebrationSplit).toBeVisible();
    const celebrationSplitText = await celebrationSplit.textContent();
    expect(celebrationSplitText).toMatch(/^\+/); // Should start with +
    expect(celebrationSplitText).not.toBe('+0:00.0'); // Should not be zero

    // Wait for celebration to end
    await expect(celebration).not.toHaveClass(/active/, { timeout: 4000 });

    // Verify timer display shows the same split time
    const splitDisplay = page.locator('[data-testid="split-time"]');
    await expect(splitDisplay).toBeVisible();
    const splitDisplayText = await splitDisplay.textContent();
    expect(splitDisplayText).toBe(celebrationSplitText); // Should match celebration value
  });
});

test.describe('Split log', () => {
  test('tap records split and opens overlay while running', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 100 double-unders');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    await page.waitForTimeout(500);
    await page.locator('#tapSurface').click();
    await page.waitForTimeout(150);
    await page.locator('#tapSurface').click();

    const splitDisplay = page.locator('[data-testid="split-time"]');
    await expect(splitDisplay).toBeVisible();

    await splitDisplay.click();
    const splitOverlay = page.locator('[data-testid="split-overlay"]');
    await expect(splitOverlay).toBeVisible();
    await expectSquareIconButton(page.locator('#splitClose'));

    const splitItems = page.locator('[data-testid="split-item"]');
    await expect(splitItems).toHaveCount(2);
  });

  test('split overlay closes on backdrop tap while running', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('For time: 30 snatches');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);

    await page.locator('#tapSurface').click();

    await page.locator('[data-testid="split-time"]').click();

    const splitOverlay = page.locator('[data-testid="split-overlay"]');
    await expect(splitOverlay).toBeVisible();

    await splitOverlay.click({ position: { x: 10, y: 10 } });
    await expect(splitOverlay).not.toBeVisible();
  });
});

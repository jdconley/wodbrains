import { expect, test } from '@playwright/test';
import { seedLegalAcceptance } from './helpers/legal';
import { fastStartRun, startRunFromDefinition } from './helpers/run';

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
  await page.addInitScript(() => {
    let isFullscreen = false;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => (isFullscreen ? document.documentElement : null),
    });
    document.documentElement.requestFullscreen = async () => {
      isFullscreen = true;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      isFullscreen = false;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });
});

test('fullscreen toggle on start overlay does not start the run', async ({ page }) => {
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 push-ups');
  await page.locator('#generate').click();

  await startRunFromDefinition(page);
  await expect(page.locator('#startOverlay')).toBeVisible();

  const overlayBtn = page.locator('#runOverlayFullscreenBtn');
  await expect(overlayBtn).toBeVisible();
  await overlayBtn.click();

  await expect(overlayBtn).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await expect(page.locator('#startOverlay')).toBeVisible();
  await expect(page.locator('#countdownOverlay')).not.toHaveClass(/active/);
});

test('fullscreen button auto-hides while running and reappears on pause / mouse move', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 push-ups');
  await page.locator('#generate').click();

  await startRunFromDefinition(page);
  await expect(page.locator('#startOverlay')).toBeVisible();

  // Enter fullscreen from the start overlay
  const overlayBtn = page.locator('#runOverlayFullscreenBtn');
  await overlayBtn.click();
  await expect(overlayBtn).toHaveAttribute('aria-pressed', 'true');

  // Start running quickly (avoid waiting for real countdown)
  await fastStartRun(page, { delayMs: 300 });
  const runShell = page.locator('#runShell');
  await expect(runShell).toHaveClass(/running/);

  const floatingBtn = page.locator('#runFullscreenBtn');
  await expect(floatingBtn).not.toHaveClass(/\bhidden\b/);

  // Auto-hide after a few seconds while fullscreen + running
  await expect(floatingBtn).toHaveClass(/\bautohide\b/, { timeout: 8000 });

  // Pausing should make the button visible again
  await page.locator('#pause').click();
  await expect(runShell).not.toHaveClass(/running/);
  await expect(floatingBtn).not.toHaveClass(/\bautohide\b/);

  // Resuming should allow auto-hide again, and mouse move should bring it back
  await page.locator('#pause').click();
  await expect(runShell).toHaveClass(/running/);
  await expect(floatingBtn).toHaveClass(/\bautohide\b/, { timeout: 8000 });

  await page.mouse.move(24, 24);
  await expect(floatingBtn).not.toHaveClass(/\bautohide\b/);
});

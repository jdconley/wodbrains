import { expect, test } from '@playwright/test';
import { seedLegalAcceptance } from './helpers/legal';
import { fastStartRun, startRunFromDefinition } from './helpers/run';

test.describe('fullscreen supported', () => {
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

    const header = page.locator('#appHeader');
    const floatingBtn = page.locator('#runFullscreenBtn');
    const muteBtn = page.locator('#runMuteBtn');
    await expect(floatingBtn).not.toHaveClass(/\bhidden\b/);
    await expect(muteBtn).not.toHaveClass(/\bhidden\b/);
    await expect(header).not.toHaveClass(/\bautohide\b/);

    // Auto-hide after a few seconds while fullscreen + running
    await expect(floatingBtn).toHaveClass(/\bautohide\b/, { timeout: 8000 });
    await expect(muteBtn).toHaveClass(/\bautohide\b/, { timeout: 8000 });
    await expect(header).toHaveClass(/\bautohide\b/, { timeout: 8000 });

    // Pausing should make the button visible again
    await page.locator('#pause').click();
    await expect(runShell).not.toHaveClass(/running/);
    await expect(floatingBtn).not.toHaveClass(/\bautohide\b/);
    await expect(muteBtn).not.toHaveClass(/\bautohide\b/);
    await expect(header).not.toHaveClass(/\bautohide\b/);

    // Resuming should allow auto-hide again, and mouse move should bring it back
    await page.locator('#pause').click();
    await expect(runShell).toHaveClass(/running/);
    await expect(floatingBtn).toHaveClass(/\bautohide\b/, { timeout: 8000 });
    await expect(muteBtn).toHaveClass(/\bautohide\b/, { timeout: 8000 });

    await page.mouse.move(24, 24);
    await expect(floatingBtn).not.toHaveClass(/\bautohide\b/);
    await expect(muteBtn).not.toHaveClass(/\bautohide\b/);
    await expect(header).not.toHaveClass(/\bautohide\b/);
  });
});

test.describe('fullscreen unsupported install flow', () => {
  test.beforeEach(async ({ page }) => {
    await seedLegalAcceptance(page);
    await page.addInitScript(() => {
      (Element.prototype as any).requestFullscreen = undefined;
      (Element.prototype as any).webkitRequestFullscreen = undefined;
      (Element.prototype as any).msRequestFullscreen = undefined;
    });
  });

  test('shows install overlay after second tap', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        configurable: true,
      });
    });
    await page.goto('/');
    await page.locator('#input').fill('For time: 10 push-ups');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();

    const overlayBtn = page.locator('#runOverlayFullscreenBtn');
    await overlayBtn.click();
    await expect(page.locator('.Toast')).toContainText('Install WOD Brains for fullscreen');

    await overlayBtn.click();
    await expect(page.locator('#installOverlay')).not.toHaveClass(/\bhidden\b/);
    await expect(page.locator('#installIosSection')).not.toHaveClass(/\bhidden\b/);
  });

  test('uses Android install prompt when available', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        configurable: true,
      });
    });
    await page.addInitScript(() => {
      (window as any).__promptCalls = 0;
      window.addEventListener('load', () => {
        const event = new Event('beforeinstallprompt') as any;
        event.prompt = async () => {
          (window as any).__promptCalls += 1;
        };
        event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
        window.dispatchEvent(event);
      });
    });

    await page.goto('/');
    await page.locator('#input').fill('For time: 10 push-ups');
    await page.locator('#generate').click();

    await startRunFromDefinition(page);
    await expect(page.locator('#startOverlay')).toBeVisible();

    const overlayBtn = page.locator('#runOverlayFullscreenBtn');
    await overlayBtn.click();
    await expect(page.locator('.Toast')).toContainText('Install WOD Brains for fullscreen');

    await overlayBtn.click();
    await expect(page.locator('#installOverlay')).toHaveClass(/\bhidden\b/);
    const promptCalls = await page.evaluate(() => (window as any).__promptCalls);
    expect(promptCalls).toBe(1);
  });
});

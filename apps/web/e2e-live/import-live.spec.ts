import path from 'node:path';
import { expect, test } from '@playwright/test';

const hasApiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

test.describe('live parse (Gemini)', () => {
  test.skip(!hasApiKey, 'GOOGLE_GENERATIVE_AI_API_KEY is required for live parse tests');

  test('parse CrossFit URL text', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('https://www.crossfit.com/250103');
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//, { timeout: 60_000 });
    await expect(page.locator('#timerOverlay')).toBeVisible({ timeout: 60_000 });
  });

  test('parse screenshot image', async ({ page }) => {
    await page.goto('/');
    const imagePath = path.resolve(
      __dirname,
      '../../../test-assets/Screenshot 2026-01-25 at 8.28.33\u202fPM.png',
    );
    await page.locator('#fileInput').setInputFiles(imagePath);
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//, { timeout: 60_000 });
    await expect(page.locator('#timerOverlay')).toBeVisible({ timeout: 60_000 });
  });
});

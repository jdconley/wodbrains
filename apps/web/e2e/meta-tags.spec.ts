import { expect, test } from '@playwright/test';

test.describe('Meta tags', () => {
  test('homepage includes OG and Twitter tags', async ({ page }) => {
    await page.goto('/');
    const ogTitle = page.locator('meta[property="og:title"]');
    const ogDescription = page.locator('meta[property="og:description"]');
    const twitterTitle = page.locator('meta[name="twitter:title"]');

    await expect(ogTitle).toHaveAttribute('content', /WOD Brains/);
    await expect(ogDescription).toHaveAttribute('content', /workout/);
    await expect(twitterTitle).toHaveAttribute('content', /WOD Brains/);
    await expect(page).toHaveTitle(/WOD Brains/);
  });
});

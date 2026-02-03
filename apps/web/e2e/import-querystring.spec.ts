import { expect, test } from '@playwright/test';
import { seedLegalAcceptance } from './helpers/legal';

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

test('auto-generate from q querystring', async ({ page }) => {
  await page.goto('/?q=For%20time%3A%2050%20burpees');

  await expect(page).toHaveURL(/\/w\//);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();
  await expect(page.locator('[data-testid="builder-node"]').first()).toBeVisible();
});

test('auto-generate from img querystring', async ({ page }) => {
  await page.goto('/?img=https%3A%2F%2Fexample.com%2Fworkout.png');

  await expect(page).toHaveURL(/\/w\//);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();
  await expect(page.locator('[data-testid="builder-node"]').first()).toBeVisible();
});

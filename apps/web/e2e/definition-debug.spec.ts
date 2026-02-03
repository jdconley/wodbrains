import { expect, test } from '@playwright/test';
import { seedLegalAcceptance } from './helpers/legal';

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

test('definition debug page shows stored sources + origin', async ({ page }) => {
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 burpees');
  await page.locator('#generate').click();
  await expect(page).toHaveURL(/\/w\//);

  const match = page.url().match(/\/w\/([^?/#]+)/);
  expect(match?.[1]).toBeTruthy();
  const definitionId = match?.[1];
  expect(definitionId).toBeTruthy();

  await page.goto(`/w/${encodeURIComponent(definitionId!)}/debug`);

  await expect(page.locator('.DebugSectionTitle', { hasText: 'Summary' })).toBeVisible();
  await expect(
    page.locator('.DebugSectionTitle', { hasText: 'Stored sources (definition)' }),
  ).toBeVisible();
  await expect(
    page.locator('.DebugSectionTitle', { hasText: 'Origin (definition_origins)' }),
  ).toBeVisible();

  // Stub parse stores multiple sources; the debug page should surface them.
  await expect(page.locator('.DebugSourceTitle').first()).toContainText('Example');

  // Raw JSON should include the definitionId.
  await expect(page.locator('#debugJson')).toContainText(definitionId!);
});

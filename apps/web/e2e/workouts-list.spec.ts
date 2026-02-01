import { expect, test } from '@playwright/test';

test('workouts list shows generated workout and opens it', async ({ page }) => {
  await page.goto('/');
  await page.locator('#input').fill('5 rounds for time: 5 push-ups, 10 sit-ups, 15 squats');
  await page.locator('#generate').click();

  await expect(page).toHaveURL(/\/w\//);
  const definitionUrl = new URL(page.url());
  const definitionId = definitionUrl.pathname.replace('/w/', '');
  const definitionsResponse = await page.request.get('/api/definitions?take=1');
  const definitionsJson = (await definitionsResponse.json()) as {
    items: Array<{ definitionId: string }>;
  };
  expect(definitionsJson.items[0]?.definitionId).toBe(definitionId);

  await page.goto('/workouts');
  const row = page.locator('.RecentItem').first();
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS('border-radius', '0px');

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/w/${definitionId}$`));
});

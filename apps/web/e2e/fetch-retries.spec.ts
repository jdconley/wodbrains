import { expect, test } from '@playwright/test';

test('retries transient parse failures and shows connection pill', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/parse', async (route) => {
    attempts += 1;
    if (attempts < 3) {
      await route.fulfill({
        status: 503,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'server_error', message: 'temporary failure' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.locator('#input').fill('For time: 50 burpees');
  await page.locator('#generate').click();

  const pill = page.locator('.ConnectionPill');
  await expect(pill).toBeVisible();
  await expect(page).toHaveURL(/\/w\//);
  await expect(pill).toBeHidden();
  expect(attempts).toBe(3);
});

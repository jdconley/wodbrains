import { expect, test, type Page } from '@playwright/test';
import { seedLegalAcceptance } from './helpers/legal';

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

const createDefinition = async (page: Page) => {
  const workoutDefinition = {
    id: 'def-autosave',
    schemaVersion: 5,
    title: 'Autosave Timer',
    blocks: [{ type: 'step', blockId: 'step-1', label: 'Push-ups' }],
  };

  return await page.evaluate(
    async ({ workoutDefinition }) => {
      await fetch('/api/auth/sign-in/anonymous', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      const res = await fetch('/api/definitions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          workoutDefinition,
          source: { kind: 'test', preview: 'autosave-back' },
          dataVersion: 5,
        }),
      });

      if (!res.ok) throw new Error(`create definition failed: ${res.status}`);
      const json = await res.json();
      return json.definitionId as string;
    },
    { workoutDefinition },
  );
};

test('back waits for autosave before navigating', async ({ page }) => {
  await page.goto('/');
  const definitionId = await createDefinition(page);

  await page.goto(`/w/${definitionId}`);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();

  let patchStartedAt: number | null = null;
  await page.route('**/api/definitions/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH') {
      await route.continue();
      return;
    }
    patchStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  await page.locator('#workoutTitle').fill('Autosave race');

  const start = Date.now();
  const navPromise = page.waitForURL((url) => url.pathname === '/');
  await page.locator('#appHeaderBack').click();
  await expect.poll(() => patchStartedAt).not.toBeNull();
  await navPromise;

  const elapsedMs = Date.now() - start;
  expect(elapsedMs).toBeGreaterThanOrEqual(1000);
});

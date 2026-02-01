import { expect, test } from '@playwright/test';

const createDefinition = async (page: import('@playwright/test').Page) => {
  const workoutDefinition = {
    id: 'def-source',
    schemaVersion: 5,
    title: 'Clone Source',
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
          source: { kind: 'test', preview: 'clone-id' },
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

test('clone flow preserves server workoutDefinition.id', async ({ page }) => {
  await page.addInitScript(() => {
    if (globalThis.crypto) {
      (globalThis.crypto as any).randomUUID = undefined;
    }
  });

  let sawLocked = false;
  let clonedPatchId: string | null = null;

  await page.route('**/api/definitions/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH') {
      await route.continue();
      return;
    }

    if (!sawLocked) {
      sawLocked = true;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'timer_locked', message: 'Timer cannot be edited after it starts.' }),
      });
      return;
    }

    if (!clonedPatchId) {
      const body = request.postDataJSON() as { workoutDefinition?: { id?: string } } | null;
      clonedPatchId = body?.workoutDefinition?.id ?? null;
    }

    await route.continue();
  });

  await page.goto('/');
  const definitionId = await createDefinition(page);
  await page.goto(`/w/${definitionId}`);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();

  await page.locator('#workoutTitle').fill('Clone Target');

  await expect.poll(() => clonedPatchId, { timeout: 8000 }).not.toBeNull();
  expect(clonedPatchId?.startsWith('def_')).toBe(false);
});

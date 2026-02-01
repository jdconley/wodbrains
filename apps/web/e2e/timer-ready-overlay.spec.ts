import { expect, test } from '@playwright/test';

const createRepeatAmrapDefinition = async (page: import('@playwright/test').Page) => {
  const workoutDefinition = {
    id: 'def-amrap',
    schemaVersion: 5,
    title: 'AMRAP sets',
    blocks: [
      {
        type: 'repeat',
        blockId: 'repeat-1',
        label: 'Set',
        rounds: 3,
        blocks: [
          {
            type: 'timer',
            blockId: 'timer-1',
            label: 'AMRAP',
            mode: 'countdown',
            durationMs: 180000,
            blocks: [
              {
                type: 'repeat',
                blockId: 'repeat-inner',
                blocks: [
                  { type: 'step', blockId: 'step-1', label: '9 Dumbbell Hang Power Clean' },
                  { type: 'step', blockId: 'step-2', label: '6 Air Squat' },
                  { type: 'step', blockId: 'step-3', label: '3 Burpee' },
                ],
              },
            ],
          },
          {
            type: 'timer',
            blockId: 'timer-rest',
            label: 'Rest',
            mode: 'countdown',
            durationMs: 60000,
          },
        ],
      },
    ],
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
          source: { kind: 'test', preview: 'amrap' },
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

test('repeat AMRAP definition shows wrappers and formats timers', async ({ page }) => {
  await page.goto('/');
  const definitionId = await createRepeatAmrapDefinition(page);

  await page.goto(`/w/${definitionId}`);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();

  const countdownLabels = page.locator('input[aria-label="Countdown label"]');
  await expect(countdownLabels).toHaveCount(2);
  await expect(countdownLabels.nth(0)).toHaveValue('AMRAP');
  await expect(countdownLabels.nth(1)).toHaveValue('Rest');

  const countdownDurations = page.locator('input[aria-label="Countdown duration"]');
  await expect(countdownDurations).toHaveCount(2);
  await expect(countdownDurations.nth(0)).toHaveValue('3:00');
  await expect(countdownDurations.nth(1)).toHaveValue('1:00');

  const roundsInput = page.locator('input[aria-label="Number of rounds"]').first();
  await expect(roundsInput).toHaveValue('3');
});

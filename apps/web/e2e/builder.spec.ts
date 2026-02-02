import { expect, test } from '@playwright/test';
import { fastStartRun } from './helpers/run';
import { expectPillLabelButton, expectPillLabelButtonFlatOnHover } from './helpers/button-styles';

test.describe('workout builder', () => {
  test('create nested workout, save, start, run with nested counters', async ({ page }) => {
    // Use a wider mobile viewport so max-width caps would show up.
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/');
    await page.locator('#input').fill('3 rounds: 10 push-ups');
    const generateBtn = page.locator('#generate');
    await expectPillLabelButton(generateBtn);
    await expectPillLabelButtonFlatOnHover(generateBtn);
    await generateBtn.click();
    await expect(page).toHaveURL(/\/w\//);

    await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();
    // Header icons should align to the same content inset edge as the page content.
    const content = page.locator('.PageContent');
    const contentBox = await content.boundingBox();
    expect(contentBox).not.toBeNull();
    const contentPadLeft = await content.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).paddingLeft),
    );
    const contentPadRight = await content.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).paddingRight),
    );
    const contentInsetLeftX = (contentBox?.x ?? 0) + contentPadLeft;
    const contentInsetRightX = (contentBox?.x ?? 0) + (contentBox?.width ?? 0) - contentPadRight;

    const backSvgBox = await page.locator('#appHeaderBack svg').boundingBox();
    expect(backSvgBox).not.toBeNull();
    expect(Math.abs((backSvgBox?.x ?? 0) - contentInsetLeftX)).toBeLessThanOrEqual(1);

    const rightSvgLocator = page.locator('.AppHeaderRight svg').first();
    if (await rightSvgLocator.count()) {
      const rightSvgBox = await rightSvgLocator.boundingBox();
      expect(rightSvgBox).not.toBeNull();
      const rightEdge = (rightSvgBox?.x ?? 0) + (rightSvgBox?.width ?? 0);
      expect(Math.abs(rightEdge - contentInsetRightX)).toBeLessThanOrEqual(1);
    }

    const treeBox = await page.locator('#builderTree').boundingBox();
    const addRootBox = await page.locator('#addRootSplit').boundingBox();
    expect(treeBox).not.toBeNull();
    expect(addRootBox).not.toBeNull();
    const xDiff = Math.abs((treeBox?.x ?? 0) - (addRootBox?.x ?? 0));
    expect(xDiff).toBeLessThanOrEqual(1);

    const addRootMainBox = await page.locator('#addRootSplit .AddBlockMain').boundingBox();
    expect(addRootMainBox).not.toBeNull();
    expect(Math.abs((addRootMainBox?.x ?? 0) - contentInsetLeftX)).toBeLessThanOrEqual(1);

    const getSetBox = await page.locator('#startCountdown').boundingBox();
    expect(getSetBox).not.toBeNull();
    const getSetLeft = getSetBox?.x ?? 0;
    const getSetRight = (getSetBox?.x ?? 0) + (getSetBox?.width ?? 0);
    expect(Math.abs(getSetLeft - contentInsetLeftX)).toBeLessThanOrEqual(1);
    expect(Math.abs(getSetRight - contentInsetRightX)).toBeLessThanOrEqual(1);
    await page.locator('#workoutTitle').fill('Builder test');

    // Add an AMRAP section at root
    await page.locator('#addRootDropdown').click();
    await page.locator('#addRootMenu button[data-type="amrap"]').click();
    const amrapLabelInput = page.locator('[data-testid="block-label-input"]').last();
    await expect(amrapLabelInput).toHaveValue('AMRAP');

    // Make the AMRAP inner repeat open-ended (blank rounds)
    await page.locator('[data-testid="block-rounds-input"]').last().fill('');

    const amrapNode = amrapLabelInput
      .locator('xpath=ancestor::div[contains(@class,"BuilderNode")]')
      .first();
    const repeatNode = amrapNode.locator('.BuilderNodeChildren .BuilderNode').first();
    await expect(repeatNode.locator('.BlockKeyword')).toHaveText('repeat');
    const roundsInput = repeatNode.locator('[data-testid="block-rounds-input"]').first();
    await expect(roundsInput).toHaveValue('');

    // Add a note block at root and edit it
    await page.locator('#addRootDropdown').click();
    await page.locator('#addRootMenu button[data-type="note"]').click();
    const noteInput = page.locator('[data-testid="block-note-input"]').last();
    await expect(noteInput).toHaveValue('Note');
    const initialBox = await noteInput.boundingBox();
    expect(initialBox).not.toBeNull();
    const multilineNote = 'Keep spine neutral.\nLine 2 reminder.\nLine 3 reminder.';
    await noteInput.fill(multilineNote);
    await expect(noteInput).toHaveValue(multilineNote);
    const noteHandle = await noteInput.elementHandle();
    expect(noteHandle).not.toBeNull();
    await page.waitForFunction((el) => el.scrollHeight <= el.clientHeight + 2, noteHandle);
    const expandedBox = await noteInput.boundingBox();
    expect(expandedBox?.height ?? 0).toBeGreaterThan((initialBox?.height ?? 0) + 6);

    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction((el) => el.scrollHeight <= el.clientHeight + 2, noteHandle);

    await page.locator('#startCountdown').click();
    await expect(page).toHaveURL(/\/r\/[^?]+/);

    await expect(page.locator('#timerValue')).toBeVisible();
    await expect(page.locator('#startOverlay')).toBeVisible();
    await fastStartRun(page);
  });

  test('delete block removes node', async ({ page }) => {
    await page.goto('/');
    await page.locator('#input').fill('5 push-ups, 10 sit-ups');
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//);
    await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();
    await expect(page.locator('[data-testid="builder-node"]').first()).toBeVisible();

    const nodesBefore = await page.locator('[data-testid="builder-node"]').count();
    await page.locator('[data-testid="block-delete"]').first().click();
    const nodesAfter = await page.locator('[data-testid="builder-node"]').count();
    expect(nodesAfter).toBeLessThan(nodesBefore);
  });
});

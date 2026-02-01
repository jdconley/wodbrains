import { expect, test } from '@playwright/test';
import { expectPillLabelButton, expectPillLabelButtonFlatOnHover } from './helpers/button-styles';

test.describe('Share links', () => {
  test('definition share uses Web Share API', async ({ page }) => {
    await page.addInitScript(() => {
      (navigator as any).share = async (data: any) => {
        (window as any).__lastShare = data;
      };
    });

    await page.goto('/');
    await page.locator('#input').fill('For time: 20 burpees');
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//);

    // Share is now exposed via the header icon (desktop + mobile).
    await page.locator('#shareWorkoutHeader').click();
    const share = await page.evaluate(() => (window as any).__lastShare);
    expect(share?.url).toContain('/w/');
    expect(typeof share?.text).toBe('string');
    expect(share.text.startsWith('Workout at the same time with friends')).toBe(true);
  });

  test('run share uses Web Share API', async ({ page }) => {
    await page.addInitScript(() => {
      (navigator as any).share = async (data: any) => {
        (window as any).__lastShare = data;
      };
    });

    await page.goto('/');
    await page.locator('#input').fill('For time: 10 push-ups');
    await page.locator('#generate').click();
    await expect(page).toHaveURL(/\/w\//);

    await page.locator('#startCountdown').click();
    await expect(page).toHaveURL(/\/r\/[^?]+/);
    const shareBtn = page.locator('#startShareBtn');
    await expect(shareBtn).toBeVisible();
    await expectPillLabelButton(shareBtn);
    await expectPillLabelButtonFlatOnHover(shareBtn);
    await shareBtn.click();

    const share = await page.evaluate(() => (window as any).__lastShare);
    expect(share?.url).toContain('/r/');
    expect(typeof share?.text).toBe('string');
    expect(share.text.startsWith('Workout at the same time with friends')).toBe(true);
  });
});

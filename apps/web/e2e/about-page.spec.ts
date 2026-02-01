import { expect, test } from '@playwright/test';
import { expectPillLabelButton, expectPillLabelButtonFlatOnHover } from './helpers/button-styles';

test.describe('About page', () => {
  test('renders about content', async ({ page }) => {
    // Mobile layout expectations (insets + bottom CTA)
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/about');
    await expect(page.locator('.AboutIntro')).toContainText('magically builds a smart timer');
    await expect(page.locator('.AboutLogo')).toBeVisible();

    const cta = page.locator('#aboutHome');
    await expectPillLabelButton(cta);
    await expectPillLabelButtonFlatOnHover(cta);

    const content = page.locator('.PageContent');
    const contentBox = await content.boundingBox();
    expect(contentBox).not.toBeNull();
    const padLeft = await content.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft));
    const padRight = await content.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingRight));
    const insetLeftX = (contentBox?.x ?? 0) + padLeft;
    const insetRightX = (contentBox?.x ?? 0) + (contentBox?.width ?? 0) - padRight;

    const ctaBox = await cta.boundingBox();
    expect(ctaBox).not.toBeNull();
    const ctaLeft = ctaBox?.x ?? 0;
    const ctaRight = (ctaBox?.x ?? 0) + (ctaBox?.width ?? 0);
    expect(Math.abs(ctaLeft - insetLeftX)).toBeLessThanOrEqual(1);
    expect(Math.abs(ctaRight - insetRightX)).toBeLessThanOrEqual(1);

    // CTA should sit low in the page flow (pushed down when there’s extra vertical space).
    // We don’t require it to be “sticky”, just that it’s placed after the content.
    expect(ctaBox?.y ?? 0).toBeGreaterThan(200);
  });

  test('footer link navigates to about', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/about"]').click();
    await expect(page).toHaveURL(/\/about$/);
  });
});

import { expect, test } from '@playwright/test';
import { seedLegalAcceptance } from './helpers/legal';

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

test('timer-edit removes window resize listeners on navigation', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__resizeListenerAdds = 0;
    (window as any).__resizeListenerRemoves = 0;
    (window as any).__resizeListeners = new Set();

    const origAdd = window.addEventListener;
    const origRemove = window.removeEventListener;

    window.addEventListener = function (type: any, listener: any, options: any) {
      if (type === 'resize' && typeof listener === 'function') {
        (window as any).__resizeListenerAdds += 1;
        (window as any).__resizeListeners.add(listener);
      }
      return origAdd.call(this, type, listener, options);
    } as any;

    window.removeEventListener = function (type: any, listener: any, options: any) {
      if (type === 'resize' && typeof listener === 'function') {
        if ((window as any).__resizeListeners.has(listener)) {
          (window as any).__resizeListenerRemoves += 1;
          (window as any).__resizeListeners.delete(listener);
        }
      }
      return origRemove.call(this, type, listener, options);
    } as any;
  });

  await page.goto('/?q=For%20time%3A%2050%20burpees');
  await expect(page).toHaveURL(/\/w\//);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();

  const before = await page.evaluate(() => (window as any).__resizeListenerRemoves as number);

  await page.locator('#appHeaderBack').click();
  await expect(page).toHaveURL('/');

  const after = await page.evaluate(() => (window as any).__resizeListenerRemoves as number);
  expect(after).toBeGreaterThan(before);
});

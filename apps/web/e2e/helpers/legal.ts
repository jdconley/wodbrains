import { type Page } from '@playwright/test';

export async function seedLegalAcceptance(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'wodbrains.legal.acceptance',
        JSON.stringify({ version: '2026-02-02', acceptedAtIso: new Date().toISOString() }),
      );
    } catch {
      // ignore
    }
  });
}

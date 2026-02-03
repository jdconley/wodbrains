import { expect, test } from '@playwright/test';
import { seedLegalAcceptance } from './helpers/legal';

test.beforeEach(async ({ page }) => {
  await seedLegalAcceptance(page);
});

test('multiple sources: shows collapsed pile and expands on tap', async ({ page }) => {
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 burpees');
  await page.locator('#generate').click();

  await expect(page).toHaveURL(/\/w\//);

  const widget = page.locator('#sourcesWidget');
  const btn = widget.locator('button.SourcesSummaryBtn');
  await expect(btn).toBeVisible();

  await expect(widget.locator('.SourcesSummaryTitle')).toContainText('Example workout page');
  await expect(widget.locator('.SourcesSummaryMore')).toContainText('+3 more');

  // 3 favicons + a +N badge.
  await expect(widget.locator('.SourcesIconPile .SourcesFaviconWrap')).toHaveCount(4);

  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');

  const rows = widget.locator('.SourcesExpanded .SourcesRow');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Example workout page');
});

test('single source: shows direct clickable link (no expand/collapse)', async ({ page }) => {
  // Create definition directly with single source attribution via API.
  await page.goto('/');
  const defId = await page.evaluate(async () => {
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
        workoutDefinition: {
          id: 'single-src-def',
          schemaVersion: 1,
          title: 'Single source test',
          blocks: [{ type: 'step', blockId: 's1', label: '10 Burpees' }],
        },
        source: { kind: 'url', preview: 'https://example.com/wod' },
        attribution: {
          sources: [{ url: 'https://example.com/wod', title: 'Example WOD' }],
        },
      }),
    });
    if (!res.ok) throw new Error(`create definition failed: ${res.status}`);
    const json = (await res.json()) as { definitionId?: string };
    if (!json.definitionId) throw new Error('definitionId missing');
    return json.definitionId;
  });

  await page.goto(`/w/${encodeURIComponent(defId)}`);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();

  const widget = page.locator('#sourcesWidget');

  // Single source renders as a direct link, no expand/collapse button.
  await expect(widget.locator('button.SourcesSummaryBtn')).toHaveCount(0);

  const link = widget.locator('a.SourcesSingleRow');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://example.com/wod');
  await expect(link.locator('.SourcesRowTitle')).toContainText('Example WOD');
  await expect(link.locator('.SourcesRowHost')).toContainText('example.com');
});

---
name: og-image-workflow
description: Generate and update the WOD Brains OG image PNG/JPG using the mascot SVG and a Playwright-rendered layout. Use when changing OG image copy or layout.
---

# WOD Brains OG Image Workflow

Use this workflow to regenerate the Open Graph image assets:

- `apps/web/public/og-image-original.png` (high-quality PNG)
- `apps/web/public/og-image.jpg` (compressed JPG)

## Requirements

- Use the mascot from `apps/web/public/logo.svg`.
- Output size must be 2848x1504 (the current OG image dimensions).
- Export a high-quality PNG first, then convert to JPG for efficiency.

## Steps

1. Create a temporary script at the repo root, e.g. `og-image-generate.mjs`.
2. Render the layout with Playwright's Chromium (use `@playwright/test`).
3. Save the PNG to `apps/web/public/og-image-original.png`.
4. Convert to JPG with `sips` and save to `apps/web/public/og-image.jpg`.
5. Delete the temporary script.

## Template Script (example)

```js
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 2848;
const HEIGHT = 1504;

const logoPath = path.resolve(process.cwd(), 'apps/web/public/logo.svg');
const outputPath = path.resolve(process.cwd(), 'apps/web/public/og-image-original.png');

const logoSvg = await fs.readFile(logoPath, 'utf8');

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; }
      body {
        background:
          radial-gradient(1200px 900px at 12% 18%, rgba(255, 16, 240, 0.25), transparent 60%),
          radial-gradient(1400px 900px at 86% 70%, rgba(46, 229, 157, 0.18), transparent 60%),
          #0b1020;
        color: #fff;
        font-family: 'Rubik', 'Inter', system-ui, -apple-system, sans-serif;
      }
      .Content { height: 100%; display: flex; align-items: center; gap: 140px; padding: 0 200px; }
      .Mascot { width: 860px; height: 860px; filter: drop-shadow(0 48px 90px rgba(0,0,0,0.45)); }
      .Mascot svg { width: 100%; height: 100%; }
      h1 { font-size: 150px; line-height: 1.06; margin: 40px 0 32px; font-weight: 800; }
      p { font-size: 60px; line-height: 1.2; margin: 0; color: #cfd2e6; }
    </style>
  </head>
  <body>
    <div class="Content">
      <div class="Mascot">${logoSvg}</div>
      <div>
        <div style="letter-spacing: 0.32em; text-transform: uppercase; color: #ff10f0; font-weight: 700; font-size: 56px;">
          WOD Brains
        </div>
        <h1>Magically build a smart timer<br />from any workout.</h1>
        <p>Paste text, drop a screenshot, or share a URL.</p>
      </div>
    </div>
  </body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(250);
await page.screenshot({ path: outputPath });
await browser.close();
```

## Commands

Generate PNG:

```bash
pnpm -w exec node og-image-generate.mjs
```

Convert to JPG:

```bash
sips -s format jpeg -s formatOptions 85 "apps/web/public/og-image-original.png" --out "apps/web/public/og-image.jpg"
```

Verify dimensions:

```bash
sips -g pixelWidth -g pixelHeight "apps/web/public/og-image-original.png"
```

## Gotchas

- Use `@playwright/test` for Chromium; `playwright` is not installed as a dependency.
- Keep the 2848x1504 dimensions to match existing meta tags.

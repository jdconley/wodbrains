---
name: backend-templates
description: Safe HTML templating patterns for Cloudflare Worker using Hono. Use when injecting dynamic content into HTML responses, generating meta tags, or rendering server-side HTML with user data.
---

# Backend Templates (Hono)

## When to Use

- Injecting dynamic meta tags for social sharing
- Server-side rendering of HTML that includes database or user-provided content
- Any HTML response built in the Cloudflare Worker

## Safe Templating with Hono html Helper

Use `html` from `hono/html` which auto-escapes interpolated values:

```ts
import { html } from 'hono/html';

const ogTags = html`
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
`;
```

## Key Rules

1. All `${}` interpolations are HTML-escaped automatically
2. Use `raw()` only for trusted content (your own templates)
3. Never concatenate user data into raw strings
4. Prefer tag replacement or insertion over string concatenation

## Example: Safe Meta Injection

```ts
const tag = String(html`<meta property="og:title" content="${title}" />`);
htmlText = htmlText.replace(/<meta\s+property="og:title"[^>]*>/i, tag);
```

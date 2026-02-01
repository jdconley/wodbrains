---
name: ui-guidelines
description: UI design guidelines for WOD Brains app - mobile-first, app-like design with consistent patterns. Use when making UI changes.
---

# WOD Brains UI Guidelines

## Design Philosophy

**Mobile-first, app-like design:**

- Build for mobile first; think app, not website
- No headers/nav bars often - use full-screen immersive shells
- Minimalism - clean, uncluttered interfaces
- Playful & graphical - animations, overlays, and visual personality
- Responsive - iPad, Apple TV mirroring, and large landscape views are first-class citizens

## Color System

All colors are defined as CSS variables in `apps/web/src/style.css`:

```css
/* Backgrounds */
--bg-deep: #0a0a0a; /* Deepest background, full-screen shells */
--bg-surface: #141414; /* Cards, elevated surfaces */
--bg-elevated: #1a1a1a; /* Hover states, inputs */
--bg-overlay: rgba(0, 0, 0, 0.85); /* All overlay backgrounds */

/* Text */
--text: #ffffff; /* Primary text */
--text-muted: #737373; /* Secondary text */
--text-inverse: #000000; /* Text on accent backgrounds */

/* Accent */
--accent: #ff10f0; /* Primary accent (neon pink) */
--accent-dim: #cc0dc0; /* Hover/pressed state */
--accent-glow: rgba(255, 16, 240, 0.4); /* Glow effects */
--accent-subtle: rgba(255, 16, 240, 0.1); /* Subtle accent backgrounds */

/* Status */
--danger: #ff3b3b; /* Destructive actions */
--danger-subtle: rgba(255, 59, 59, 0.1); /* Subtle danger backgrounds */

/* Border (for inputs only) */
--border: #262626;

/* Separators + list highlights */
--separator: rgba(255, 255, 255, 0.08);
--list-highlight: rgba(255, 255, 255, 0.04);
```

**Rules:**

- Never use hardcoded colors - always use variables
- Use `--bg-overlay` for all overlay backgrounds (standardized to 0.85 opacity)
- Use `--text-inverse` for text on accent-colored buttons

## Spacing Scale

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
```

## Border Radius Scale

```css
--radius-sm: 8px; /* Inputs, small controls */
--radius-md: 16px; /* Cards, overlays */
--radius-full: 999px; /* Pill label buttons + circular buttons */
```

## Typography

**Font families:**

- Body: `Inter, system-ui, sans-serif`
- Headings/Display: `Rubik, Inter, system-ui, sans-serif`
- Timer/Monospace: `"JetBrains Mono", "SF Mono", "Fira Code", monospace`

**Font weights (standard values only):**

- 400: Body text
- 500: Emphasis
- 600: Headings, active items
- 700: Titles
- 800: Display (celebration numbers)

**Never use:** 450, 650, 750, or other non-standard weights.

## Navigation

### iOS-Style Stack Navigation

The app uses stack-based navigation like iOS:

```
/ (import) ← ROOT (no back button)
├── /workouts ← back to /
└── /w/{id} (definition) ← back to /
    ├── /w/{id}/edit (timer-edit) ← back to /w/{id}
    └── /r/{id} (run) ← back to /w/{id}
```

### Shared Header Component

Use the shared header component (`apps/web/src/components/header.ts`):

```typescript
import { appHeader, setupAppHeader } from '../components/header';

// In your page render:
root.innerHTML = `
  <div class="PageShell">
    ${appHeader()}
    <main class="PageContent">
      ...
    </main>
  </div>
`;

setupAppHeader(root);
```

**With custom back target:**

```typescript
appHeader({ backTarget: `/w/${definitionId}` });

setupAppHeader(root, {
  backTarget: `/w/${definitionId}`,
  onBeforeBack: () => {
    // Return false to cancel navigation
    if (hasUnsavedChanges()) {
      showConfirmDialog();
      return false;
    }
    return true;
  },
});
```

**Header visibility (run page):**

```typescript
import { setAppHeaderVisible } from '../components/header';

// Hide header when timer is running
setAppHeaderVisible(root, status !== 'running');
```

## Layout Patterns

### Full-Screen Shells

All pages use full-screen shells with `min-height: 100dvh`:

- `ImportShell` - Centered content, import page
- `PageShell` - Standard pages (workouts, timer-edit)
- `DefinitionShell` - Definition view with actions footer
- `RunShell` - Timer run page (grid layout)

### Content Max-Width

- Content pages: `max-width: 480px`
- Timer run page: Full-screen, no max-width

### Content Insets

- Standard content inset uses the shared CSS variables:
  - `--content-pad-x` (left/right)
  - `--content-pad-y` (top/bottom)
- Apply these to `PageContent` and `DefinitionContent` so all content pages share the same inset.

### DRY Content Containers (Desktop Card)

- **Use `PageContent` as the base container class** for content pages. This is the “source of truth” for shared width/insets, and for the desktop card container styling.
- **If a page needs custom layout, add a modifier class** (e.g. `class="PageContent ImportContent"`) and keep the modifier limited to the delta (centering behavior, special gaps, etc.).
- **Avoid duplicating the desktop card/container CSS** under page-specific classes (like `.ImportContent`). If a page needs the same desktop card as other pages, it should opt into it by using `PageContent`.

### Shared Header (Back Button + Alignment)

- **Back button is shown on all pages except the Import root** (route `/`). This applies to both mobile and desktop.
- **Desktop header should align with the desktop content card**:
  - The header container should use the same `max-width` as `PageContent` on desktop.
  - The back button’s left inset should match the content’s left inset (no “extra” desktop padding that makes the back icon look shifted).
- **Center content is a single slot**:
  - Use `centerSlot: 'logo'` for the default brand header (mobile shows mascot logo, desktop shows “WOD Brains” brand).
  - Use `centerSlot: 'title'` for pages that should show a title in the header (e.g. About: “About WOD Brains”).
  - Use `centerSlot: 'titleInput'` for editable header titles (timer edit).

### Page Transitions

All shells have a fade-in animation:

```css
@keyframes pageIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.PageShell {
  animation: pageIn 0.2s ease-out;
}
```

## Lists (iOS Flat)

**Default list style across the app:**

- Flat rows, no card backgrounds or rounded corners
- Hairline separators between rows (`--separator`)
- Only subtle hover/tap highlight (`--list-highlight`)
- Rows should fill their container width with theme padding
- List-level action rows (e.g., “+ add step”) must align with the list container edge (no extra left inset).

**Markup guidance:**

- If using `div` containers, set `role="list"` and `role="listitem"` on rows
- For workout steps, prefer the `.List` pattern (flat, no bullets)

**CSS sketch (reference only):**

```css
.MyList {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.MyListItem {
  padding: 10px 0;
  border-bottom: 1px solid var(--separator);
  background: transparent;
}

@media (hover: hover) {
  .MyListItem:hover {
    background: var(--list-highlight);
  }
}

.MyListItem:active {
  background: var(--list-highlight);
}
```

## Buttons

### No Borders, Flat + Pill

Labeled buttons are pill-like and flat (no shadows). Buttons do not have borders.
Use background color for states:

```css
/* Labeled buttons are pill-shaped */
.PrimaryBtn,
.SecondaryBtn,
.GhostBtn,
.DangerBtn {
  border-radius: var(--radius-full);
}

/* Primary - accent background */
.PrimaryBtn {
  background: var(--accent);
  color: var(--text-inverse);
}

/* Secondary - elevated background */
.SecondaryBtn {
  background: var(--bg-elevated);
  color: var(--text);
}

/* Ghost - transparent, subtle hover */
.GhostBtn {
  background: transparent;
  color: var(--text-muted);
}
.GhostBtn:hover {
  background: var(--bg-elevated);
  color: var(--text);
}

/* Danger - destructive action */
.DangerBtn {
  background: var(--danger);
  color: var(--text-inverse);
}
```

**Notes:**

- Use `.DangerBtn` for destructive labeled actions (e.g., Discard).
- Buttons can be `<button>` or `<a>`; both should render with a 44px min height.

### Prefer Graphics Over Text

For action buttons, prefer icons over text labels. Example from definition page:

```html
<button class="DefinitionAction DefinitionAction--start">
  <svg><!-- play icon --></svg>
</button>
```

## Overlays

### Pattern

Full-screen overlays with semi-transparent backdrop:

```css
.MyOverlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
  z-index: 120;
}
```

### Z-Index Scale

- 10: Floating elements
- 50: Tap hints
- 100-110: Primary overlays (start, countdown)
- 115-120: Celebration/finish overlays
- 200: Blocking overlays (generate loading)

### Dismiss Patterns

- Tap backdrop to close
- Small X button (top-right) for explicit close
- Escape key support
- Bottom sheets for lists (split times)

### No Card Borders in Overlays

Overlay cards have no borders:

```css
.OverlayCard {
  border: none;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}
```

## Timer Run Page

Special behaviors:

- Header hides when timer is running (fades out)
- Footer fades out when running
- Timer stays vertically centered regardless of header visibility
- Full-screen tap surface for rep counting

## Animations

### Key Animations

- `pageIn` - Page entrance (0.2s ease-out)
- `repBump` - Rep count bump (0.18s ease)
- `countdownPulse` - Countdown numbers (0.8s ease-out)
- `repCelebrationFade` - Rep celebration (2.5s ease-out)
- `logoBounce` - Generate loading (1.2s infinite)
- `sparkle` - Sparkle effects (1.5s ease-out)

### Transition Timing

- Standard interactions: `0.15s`
- Overlays: `0.2s-0.3s ease-out`
- Header/footer fade: `0.5s ease-out`

## Security: XSS Prevention

**Rule:** Never interpolate user data into `innerHTML`.

- Use `document.createElement` + `textContent` for all dynamic content
- `innerHTML` is only allowed for static templates (no user data) or for clearing elements (`innerHTML = ''`)
- For repeated patterns, use the helper in `apps/web/src/utils/dom.ts`

Example:

```ts
const title = document.createElement('h2');
title.textContent = workoutTitle; // always safe
```

## SEO & Meta Tags

Use the shared meta helper for every page:

- `apps/web/src/meta.ts` → `updateMeta({ title, description, url })`
- Titles should be descriptive and include "WOD Brains"
- Update meta tags after async data loads (definition, run, edit pages)
- Canonical URLs should reflect the current route

## Example: Creating a New Page

```typescript
import { appHeader, setupAppHeader } from '../components/header';
import { updateMeta } from '../meta';

export function renderMyPage(root: HTMLElement) {
  updateMeta({
    title: 'My Page - WOD Brains',
    description: 'Describe what this page does for search and sharing.',
    url: new URL('/my-page', window.location.origin).toString(),
  });
  root.innerHTML = `
    <div class="PageShell">
      ${appHeader()}
      <main class="PageContent">
        <h1 class="PageTitle">My Page</h1>
        <!-- Content here -->
      </main>
    </div>
  `;

  setupAppHeader(root);

  // Your page logic...
}
```

## Checklist for UI Changes

1. Use CSS variables for all colors
2. Use spacing scale variables where possible
3. No borders on buttons or cards (except inputs)
4. Use shared header component
5. Full-screen shells with 100dvh
6. Content max-width 480px (except timer run)
7. Page transition animation
8. Overlays use `--bg-overlay` and have no card borders
9. Standard font weights only (400, 500, 600, 700, 800)
10. Use DOM APIs for user-generated content (no `innerHTML`)
11. Update meta tags for sharing/SEO on each page
12. Run E2E tests after changes

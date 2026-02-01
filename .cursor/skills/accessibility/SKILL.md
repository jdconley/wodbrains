---
name: accessibility
description: Accessibility (A11y) guidelines for WOD Brains UI - WCAG 2.1 AA compliance. Use when making any UI changes.
---

# Accessibility Guidelines for WOD Brains

## Overview

All UI changes must maintain WCAG 2.1 AA compliance. This skill defines the accessibility patterns and requirements for the WOD Brains app.

## Color Contrast Requirements

**Minimum contrast ratios (WCAG AA):**

- Normal text (< 18pt): 4.5:1
- Large text (≥ 18pt or ≥ 14pt bold): 3:1
- UI components and graphics: 3:1

**Current color system (verified):**

```css
--text: #ffffff; /* 19.6:1 on --bg-deep - PASS */
--text-muted: #9a9a9a; /* 5.7:1 on --bg-deep - PASS */
--accent: #ff10f0; /* 6.3:1 on --bg-deep - PASS */
--danger: #ff3b3b; /* 5.8:1 on --bg-deep - PASS */
```

**Never use:**

- Hardcoded colors without verifying contrast
- `--text-muted` for small critical text (use `--text` instead)

## ARIA Patterns

### Icon Buttons

Always add `aria-label` and hide the SVG:

```html
<button type="button" aria-label="Close dialog">
  <svg aria-hidden="true">...</svg>
</button>
```

### Form Inputs

All inputs need accessible labels:

```html
<!-- Option 1: aria-label -->
<input type="text" aria-label="Workout title" placeholder="Title" />

<!-- Option 2: Associated label -->
<label for="title">Title</label>
<input id="title" type="text" />
```

### Status Messages

Use live regions for dynamic content:

```html
<div role="status" aria-live="polite" id="status"></div>
```

- Use `aria-live="polite"` for non-urgent updates
- Use `aria-live="assertive"` for critical alerts (e.g., errors, countdowns)

### Dialogs/Overlays

```html
<div role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
  <h2 id="dialogTitle">Dialog Title</h2>
  ...
</div>
```

### Lists

```html
<div role="list" aria-label="Workout steps">
  <div role="listitem">Step 1</div>
  <div role="listitem">Step 2</div>
</div>
```

## Keyboard Navigation

### Required Support

- All interactive elements must be focusable via Tab
- Buttons/links must respond to Enter and Space
- Dialogs should trap focus when open
- Escape key should close dialogs/overlays

### Example: Adding Keyboard Support

```typescript
element.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    handleAction();
  }
});
```

## Focus Management

### Focus Visible Styles

Global styles are defined in `style.css`:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

:focus:not(:focus-visible) {
  outline: none;
}
```

### Skip Link

A skip link is provided in `index.html`:

```html
<a href="#main-content" class="SkipLink">Skip to main content</a>
```

Each page's main content area should have `id="main-content"`.

## Zoom and Font Scaling

**WCAG Requirements:**

- 1.4.4 Resize Text: Work at 200% zoom
- 1.4.10 Reflow: No horizontal scroll at 320px viewport
- 1.4.12 Text Spacing: Support user text spacing adjustments

**CSS Patterns:**

```css
/* Ensure tap targets are accessible */
.MyButton {
  min-width: 44px;
  min-height: 44px;
}

/* Prevent text overflow */
.LargeText {
  overflow-wrap: break-word;
  word-break: break-word;
}

/* Ensure overlays scroll */
.MyOverlay {
  overflow: auto;
  max-height: 90vh;
}
```

## Reduced Motion

Support users who prefer reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Checklist for UI Changes

Before submitting UI changes, verify:

1. **Color contrast**: All text meets 4.5:1 (normal) or 3:1 (large)
2. **Icon buttons**: Have `aria-label`, SVGs have `aria-hidden="true"`
3. **Form inputs**: Have labels or `aria-label`
4. **Status regions**: Use `role="status"` and `aria-live`
5. **Dialogs**: Have `role="dialog"`, `aria-modal`, `aria-labelledby`
6. **Keyboard**: All interactive elements work with Tab/Enter/Space
7. **Focus visible**: Focus states are visible for keyboard users
8. **Main content**: Has `id="main-content"` for skip link
9. **Zoom testing**: Test at 200% browser zoom
10. **Screen reader**: Test with VoiceOver (Cmd+F5 on Mac)

## Testing Tools

**Manual Testing:**

- Keyboard-only navigation (Tab, Shift+Tab, Enter, Space, Escape)
- VoiceOver on Mac (Cmd+F5)
- Browser zoom: 100%, 150%, 200%, 400%

**Automated Testing:**

- Chrome DevTools Lighthouse accessibility audit
- axe DevTools browser extension

## File Reference

Key accessibility implementations:

- `apps/web/src/style.css` - Focus styles, skip link, reduced motion, zoom support
- `apps/web/index.html` - Skip link element
- `apps/web/src/components/header.ts` - Accessible header with back button
- `apps/web/src/pages/*.ts` - Page-level ARIA attributes

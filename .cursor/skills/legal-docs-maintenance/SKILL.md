---
name: legal-docs-maintenance
description: Maintain WOD Brains Privacy Policy + Terms and keep click-through consent in sync. Use when adding/changing data collection, third-party services, accounts, payments, analytics, AI processing, or sharing/sync behavior.
---

# Legal Docs Maintenance (Privacy + Terms + Consent Gate)

WOD Brains has:

- Legal pages: `apps/web/src/pages/privacy.ts` and `apps/web/src/pages/terms.ts`
- A blocking click-through consent modal: `apps/web/src/components/legal-consent.ts`
- Playwright helpers/tests that assume consent is accepted: `apps/web/e2e/helpers/legal.ts` and `apps/web/e2e/legal-consent.spec.ts`

This skill is about keeping those documents accurate as the product evolves, and forcing re-acceptance when needed.

## Principle

- Treat legal docs as **a structured “data map”** of what the app actually does.
- When behavior changes, update the docs and bump the consent version so acceptance stays “legally binding” to the current text.

## Quick Trigger Checklist (when to update Privacy/Terms)

Review/update legal docs when a change introduces any of the following:

- **New data collected** (email, name, payments, analytics identifiers, logs, device info)
- **New storage** (D1 tables, R2 buckets, Durable Object state, 3rd-party DB)
- **New sharing/sync** behavior (new share links, multiplayer/presence, public/unguarded content)
- **New third parties** (error reporting, analytics, email provider, payments, auth, AI vendor)
- **New AI flows** (new prompts, new providers, new data sent to models)
- **Accounts/auth changes** (sign-in methods, user profiles, deletion/export requests)
- **Payments** (subscriptions, receipts, refund policy, taxes)
- **Policy-related UX changes** (tracking, marketing emails, user-generated content)

If none of these changed, legal docs usually don’t need edits.

## Update Workflow

### 1) Identify what changed (source of truth: the diff)

Scan the change for:

- New endpoints under `apps/worker/src/`
- New DB migrations in `apps/worker/migrations/`
- New client-side persistence (cookies/localStorage) under `apps/web/src/`
- New vendor SDKs/dependencies
- New sharing URLs and public identifiers

Write down a short bullet list of “new data / new recipients / new purposes”.

### 2) Update Privacy Policy (`apps/web/src/pages/privacy.ts`)

Update the relevant sections:

- **Information we collect**: add or refine bullets
- **How we use**: add the purpose (operate, sync, debug, prevent abuse)
- **How we share**: add the processor/vendor and what data they receive
- **Retention**: update if retention meaningfully changes
- **Contact**: keep accurate

Notes:

- Prefer **plain language** and **specific categories** over legalese.
- Mention high-signal infrastructure providers (e.g., Cloudflare) and AI processing when applicable.

### 3) Update Terms (`apps/web/src/pages/terms.ts`)

Typical adjustments:

- **AI-generated output**: update if accuracy constraints/limitations change
- **Fitness disclaimer**: update if coaching/medical features are added
- **Your content**: update if users can publish/share content broadly
- **Availability**: update if service becomes paid, has SLAs, etc.

### 4) Bump the consent version + effective date

To force re-acceptance after any substantive change to Terms/Privacy:

- In `apps/web/src/components/legal-consent.ts`, bump:
  - `LEGAL_VERSION` (e.g., `YYYY-MM-DD`)
- In `privacy.ts` and `terms.ts`, update:
  - Effective date string shown on the page

### 5) Keep Playwright in sync

When `LEGAL_VERSION` changes, update:

- `apps/web/e2e/helpers/legal.ts` → the seeded `version` value

Also keep:

- `apps/web/e2e/legal-consent.spec.ts` passing (it asserts the click-through gate works)

### 6) Re-run tests

Run:

```bash
pnpm test:e2e
```

If E2E flakes around starting runs, prefer the helper:

- `apps/web/e2e/helpers/run.ts` → `startRunFromDefinition(page)`

## Common “What should I add to the policy?” mapping

- **Add analytics (Plausible, GA, PostHog, etc.)**
  - Privacy: “Usage + device data”, “How we share”, vendor name
  - Terms: usually no change unless tracking is core
- **Add error reporting (Sentry, etc.)**
  - Privacy: “Usage + device data”, vendor name
- **Add payments (Stripe)**
  - Privacy: payment info categories + vendor
  - Terms: billing/refunds/cancellations
- **Add email sign-in / newsletter**
  - Privacy: email collected; communications; opt-out if marketing
  - Terms: account responsibilities (optional)
- **Add new AI provider or send more workout context**
  - Privacy: “AI processing providers” section updates
  - Terms: AI output limitations (if changed)

## Files to touch most often

- `apps/web/src/pages/privacy.ts`
- `apps/web/src/pages/terms.ts`
- `apps/web/src/components/legal-consent.ts`
- `apps/web/e2e/helpers/legal.ts`
- `apps/web/e2e/legal-consent.spec.ts`

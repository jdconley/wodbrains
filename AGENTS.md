# WOD Brains — Agent Context

## Product & UI North Star

**Mobile-first, app-like design:**

- Build for mobile first; think app, not website
- **No headers/nav bars** — use full-screen immersive shells
- **Minimalism** — clean, uncluttered interfaces
- **Playful & graphical** — animations, overlays, and visual personality (not utilitarian)
- See current patterns in `apps/web/src/style.css` (full-screen shells, animated overlays, celebration effects)
- **Responsive** — iPad, Apple TV mirroring, and large landscape views are first class citizens, especially on the Timer run view `apps/web/src/run.ts`

**Source of truth:** [`SPEC.md`](SPEC.md) has full product/UX requirements.

## Agent Workflow: Skills First

**Always check skills before starting work:**

1. Analyze the user's request
2. Scan `.cursor/skills/**/SKILL.md` for relevant skills
3. Apply any matching skills before proceeding

**Key project skills:**

- `accessibility` — WCAG-minded UI/a11y guidelines for WOD Brains
- `backend-templates` — Safe HTML templating patterns for the Worker (Hono)
- `test-on-change` — Create/run tests for UI or core logic changes
- `run-live-evals` — Run parse evals against live Gemini API
- `capture-skill` — Persist learnings from conversations as reusable skills
- `ui-guidelines` — Mobile-first UI patterns + visual/interaction consistency

## Parsing Philosophy: Prompt-First

**We rely on the parsing model. Do NOT build heuristic/regex parsers.**

When parsing behavior needs to change:

- Update the **prompt** in [`apps/worker/src/parse.ts`](apps/worker/src/parse.ts)
- Add or adjust tests to validate the change
- Keep code-side work to **light normalization + schema validation only**

## Ask Lots of Questions

**Don't guess — ask clarifying questions frequently.**

- Especially for UX decisions and parsing behavior
- Propose options when there are multiple valid approaches
- Confirm intent before implementing non-trivial changes

## Repo Map

- **`apps/web/`** — Vite + vanilla TypeScript SPA
- **`apps/worker/`** — Cloudflare Worker (API + static assets) + Durable Objects + D1
- **`packages/core/`** — Shared types, compiler, and run simulation logic

## Key Commands

```bash
pnpm install                           # Install dependencies
pnpm dev                               # Start web + worker dev servers
pnpm test                              # Run all tests
pnpm --filter worker db:migrate:local  # Apply DB migrations (when schema changes)
```

**More details:** [`README.md`](README.md)

# WOD Brains Timer (v1) — Coherent Spec (Import-as-Homepage)

## Summary

**WOD Brains** is a responsive web app (no marketing site) whose **homepage is the Import/Create screen**. Users land and immediately create a timer by **uploading a screenshot**, **pasting workout text**, or **pasting a URL**. The backend parser converts that input into a generic **WorkoutDefinition**, compiles it into a runnable **TimerPlan**, and then starts a persistent **Run** that can be shared, coached live (multiplayer), or cloned. The timer UI renders smoothly at **60 FPS**, while simulation advances at **10 Hz** for tenth-second accuracy. Data persists across devices on Cloudflare.

## UX / IA Requirements

## Homepage = Import (no marketing)

- Route `/` is the **Create a timer** surface.
- The page contains:
  - **Upload image/screenshot** (primary)
  - **Paste text** (primary)
  - **Paste URL** (primary)
  - **Generate Timer** CTA
  - **Example timers** (secondary, smaller cards) that instantly open runnable examples (definitions)

## App Routes (minimal)

- `/` **Import/Create** (homepage)
- `/w/<definitionId>` Definition preview + “Start run” + optional edit
- `/r/<runId>` Run Timer (live session)
- `/builder` Manual builder (also used as “edit generated”)
- `/history` Saved definitions + runs (cross-device)

## Core Interactions

- **Tap anywhere** (main run screen) advances round / marks next logical progression (contextual).
- Also include explicit **Next** button for discoverability.
- **Pause/Resume** must be instant; pause timing accurate to tenths.
- **Undo** supported (long-press or button).

## Brand Spec (WOD Brains)

## Personality

- Smart + playful, women-forward, approachable.
- “You’ve got this—here’s the plan.”

## Visual Style

- Big friendly numerals, rounded shapes; brain + stopwatch motif.

## Palette (dark-mode-first)

- **Brain Pink** `#FF4FA3`
- **Grape Purple** `#6D28D9`
- **Mint** `#2EE59D`
- **Peach** `#FFB38A`
- **Ink** `#0B1020`
- **Surface** `#121A33`
- **Card** `#1A2550`
- **Text** `#F4F7FF`
- **Muted** `#B7C0E0`
- **Hairline** `#2A3566`
- **Danger** `#FF3B3B`
- **Warning** `#FFB020`

## Typography

- Timer numerals: **Rubik** or **Space Grotesk**
- UI text: **Inter**
- Large responsive timer sizing (roughly 96–160px+ depending on screen).

## Data Model

## Principle

Separate:

- **WorkoutDefinition** = semantic workout structure (“what to do”)
- **TimerPlan** = runnable plan (“how time flows + counters + cues”)

## `WorkoutDefinition` (generic IR)

A tree of blocks capable of describing CrossFit, strength, running, intervals, etc.:

- Sequence, Step, Repeat, Interval, Choice/Branch, Notes/Standards

Steps carry prescriptions (reps/distance/load/time/etc.) + metadata.

## `TimerPlan`

Compiled from `WorkoutDefinition` into runnable segments:

- count up/down, interval cycles
- counters (rounds/intervals/sets)
- cues
- interaction mapping

Defaults:

- “For time” → count up + round counter + splits
- “AMRAP X” → countdown + optional round counter
- intervals → repeating countdown + transitions

## Import “Smarts” Pipeline (homepage flow)

Inputs: **text**, **URL**, **image** (OCR → text).

1. Ingest + normalize text
2. Backend parse model → strict JSON `WorkoutDefinition`
3. Validate + produce warnings/assumptions
4. Compile → `TimerPlan`
5. Show a quick **review/edit** (inline on `/` or by routing to `/builder`)
6. Save as a **Definition** and optionally immediately start a **Run**

## Identity, Sharing, Multiplayer, Cloning

## Entities + URLs

- **Definition** `definitionId` (UUIDv7): shareable template
  - `/w/<definitionId>`
- **Run** `runId` (UUIDv7): live session instance
  - `/r/<runId>`

## Multiplayer (coach-controlled class)

- Run is authoritative (one controller, many viewers).
- Capability access:
  - `ownerKey` controls (coach)
  - `viewerKey` optional read-only (unlisted/private)
- Realtime updates via WebSockets; viewers stay in sync with coach.

## Cloning / Forking

- Clone from definition → new run with fresh log.
- Fork from an existing run (at time/event index) → new independent run.

## Timing / Engine Spec (smooth + accurate)

- UI renders at **60 FPS** (`requestAnimationFrame`).
- Simulation advances at **10 Hz** (100ms).
- All events carry timestamps in **ms**; UI displays tenths.
- Deterministic state: `TimerPlan + event log + now → derived state`.
- Cues trigger from simulation steps (prevents double-fire).

## Offline + Refresh Resilience

- Service worker caches app shell.
- Client persists: `runId`, last snapshot, queued unsent events (IndexedDB/localStorage).
- Offline: run continues locally; actions queue events; reconnect replays to server and reconciles.

## Cloudflare Deployment & Persistence (cross-device)

## Hosting

- Cloudflare **Pages** serves the web app.

## Backend

- Cloudflare **Workers** provide API (parse/create/save/run/events).
- Cloudflare **Durable Objects** act as per-run actors:
  - serialized updates
  - authoritative event log + snapshots
  - WebSockets for class mode

## Storage

- **D1**: definitions, run metadata/history, indexing/listing across devices
- **Durable Object storage**: live run state + recent events/snapshots
- **R2 (optional)**: uploaded images/screenshots

## Minimal API Surface (conceptual)

- `POST /api/parse`
- `POST /api/definitions` / `GET /api/definitions/:definitionId`
- `POST /api/runs` / `GET /api/runs/:runId`
- `POST /api/runs/:runId/events`
- `WS /api/runs/:runId/ws`

## Monorepo Plan (TypeScript, renderer-swappable)

- `packages/core`: IR types, compiler, simulation reducer (pure)
- `packages/parser`: parsing prompt + schema validation + heuristics
- `packages/state`: tiny signals store
- `apps/web`: DOM renderer + CSS + cues + offline cache
- `apps/api`: Workers + Durable Objects + D1

## Acceptance Criteria (v1)

- Homepage `/` lets a user import via image/text/URL and generate a timer fast; examples are visible but secondary.
- Generated timers correctly handle common patterns (rounds for time, AMRAP, intervals) with appropriate counters.
- Run screen is smooth (60 FPS) and accurate to tenths (10 Hz sim).
- Run persists through refresh; works offline with local continuity and later reconciliation.
- Share definition URLs; start coach-controlled class runs; allow cloning into independent runs.
- Definitions and history persist across devices via Cloudflare.

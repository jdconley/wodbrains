---
name: multiplayer-run-sync
description: How WOD Brains timer runs are shared (leader/participant, presence, monotonic 10Hz simulation clock, countdown start, timeScale, share UX) and what to check before modifying run engine or UI.
---

# Multiplayer Run Sync (Leader/Participant)

This skill documents how “shared runs” work in WOD Brains, and the common gotchas when changing the run engine, API, or UI.

## Mental model (treat it like a game simulation)

- **Authoritative event log**: the run is a deterministic function of `timerPlan + events + simNowMonoMs`.
- **Monotonic timeline**: run timing uses a monotonic clock, not wall-clock time.
- **Fixed timestep**: simulation advances at **10Hz** (`tickMs=100`) and renders smoothly at 60fps using interpolation.
- **Leader vs Participant**:
  - **Leader** (run owner) is the only client allowed to send authoritative events.
  - **Participant** is view-only for authoritative run state, but can rep-count locally.

## Where the authoritative truth lives

### Durable Object (DO): `apps/worker/src/run-actor.ts`

Responsibilities:

- **WebSocket hub**: accepts WS connections and broadcasts snapshots.
- **Presence**: `onlineCount = this.ctx.getWebSockets().length` (counts each tab/device connection).
- **Authoritative monotonic time**:
  - DO maintains a monotonic “now” (`serverNowMonoMs`) using `performance.now()` deltas.
  - It persists a base (`clock` storage key) so it can recover across hibernation.
- **Authoritative run settings**:
  - `timeScale` is part of run settings and is included in every snapshot.
  - Settings updates are rejected after `start` (409) to keep determinism simple.

Snapshot envelope fields (key ones):

- `serverNowMonoMs` (number, int-ish)
- `onlineCount`
- `timeScale`
- `timerPlan`, `events`, and `derived`

### Worker API: `apps/worker/src/app.ts`

Key routes:

- `GET /api/runs/:runId` → proxies DO `/snapshot`
- `GET /api/runs/:runId/access` → `{ canControl: boolean }` based on `timer_runs.ownerUserId`
- `POST /api/runs/:runId/events`:
  - requires session
  - enforces leader-only via `timer_runs.ownerUserId`
  - returns 403 `{ error: 'view_only' }` for participants
  - **gotcha**: `atMs` must be an **int** (round it before sending to DO)
- `PATCH /api/runs/:runId/settings`:
  - leader-only, proxies DO `/settings`
  - used to set `timeScale` before start

## Web client sync engine

### Entry point: `apps/web/src/pages/run.ts`

Responsibilities:

- **Role gating**:
  - Fetches `GET /api/runs/:runId/access` and sets `canControl`.
  - If a participant tries to send events, server returns 403 `view_only`; UI flips to participant mode.
- **Monotonic clock sync**:
  - Receives snapshots with `serverNowMonoMs`.
  - Maintains an offset `serverPerfOffsetMs` so:
    - `estimatedServerNowMonoMs() = performance.now() + serverPerfOffsetMs`
  - Uses smoothing (`updateMonotonicOffset`) to avoid time jumps.
- **Fixed timestep sim loop**:
  - Uses `advanceFixedStep` each animation frame:
    - accumulator collects `dt`
    - applies 0..N ticks of `tickMs=100`
    - applies bounded correction per tick (`maxCorrectionPerTickMs`)
  - Renders timer with interpolation within the current tick.
- **Scheduled start & countdown**:
  - Leader schedules start by posting a `start` event in the future:
    - `startAt = round(estimatedServerNowMonoMs()) + 10_000`
  - Countdown overlay derives from `startedAtMs - simNowMonoMs` so all clients show the same countdown.
- **Presence + role UI**:
  - Corner shows `Participant · N online` for participants.
  - Corner only shows `Leader` label when `onlineCount > 1`.
  - TimeScale display only shows `x N` when `timeScale !== 1`.
- **Controls visibility**:
  - Participant should not see disabled leader controls; hide them.
- **Rep counting exception**:
  - Rep splits are **local-only** (stored in `localStorage`) for participants.
  - Leader may still emit authoritative `split` events, but UI merges local + server splits for display.

### Shared simulation helpers: `packages/core/src/sim-clock.ts`

- `updateMonotonicOffset(prev, sample, smoothing)`:
  - sample = `{ serverNowMonoMs, clientPerfNowMs }`
  - use smoothing to prevent discontinuities
- `advanceFixedStep(state, dt, targetNow, config)`:
  - fixed-step tick application
  - bounded per-tick correction toward target time
  - `maxCatchupTicks` prevents spiral-of-death

## timeScale (hidden feature)

Policy:

- **No visible leader control** in the UI.
- Enable only via the run URL querystring:
  - `/r/<runId>?timeScale=100`
- Client behavior:
  - If leader and run has not started, apply querystring value once by calling:
    - `PATCH /api/runs/:runId/settings { timeScale }`
  - Participants can see `x N` if it’s not `1` (but cannot change it).

Gotchas:

- Don’t accidentally expose a “Speed” control (or any clickable timeScale UI).
- Only allow setting timeScale pre-start; keep it constant for determinism.

## Share UX

- Run page start overlay includes a **Share run** button:
  - Uses `navigator.share({ title, text, url })` when available.
  - Fallback: copy run URL to clipboard.
  - Text must start with:
    - `Workout at the same time with friends`
- Workout definition page includes a **Share workout** button:
  - Shares `/w/<definitionId>` (so others can create their own runs).

## Common gotchas before changing anything

- **Never switch timing back to `Date.now()`** for the simulation clock. Wall time is only for DB/history.
- **Ensure all event timestamps are ints**:
  - Schema validation expects integer `atMs` → round in the worker API and in the client event generation.
- **Start overlay intercepts pointer events**:
  - Tests that click UI elements must click start overlay first (or ensure it’s hidden).
- **Participant view**:
  - Do not show disabled leader controls; hide them to avoid confusing UX.
- **timeScale**:
  - Must be applied consistently to all clients; don’t let clients diverge.
- **DO hibernation**:
  - Monotonic clock base must survive restarts; keep the persisted base logic intact.

## Tests to run (and why)

### Core

- `pnpm -C packages/core test`
  - Covers `deriveRunState` pre-start behavior and sim-clock correctness.

### Worker

- `pnpm -C apps/worker test`
  - Covers leader-only enforcement, WS presence, and snapshot fields.

### Web E2E (Playwright)

- `pnpm -w exec playwright test --config /Users/jd/src/wodbrains/playwright.config.ts`

Notes:

- Playwright runs the worker with `STUB_PARSE=1`.
- If you change the run flow (autostart, overlays), expect to update tests to click `#startOverlay`.
- Share tests can stub Web Share API via `page.addInitScript` and assert the shared text/url.

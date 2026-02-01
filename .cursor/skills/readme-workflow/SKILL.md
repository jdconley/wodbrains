---
name: readme-workflow
description: Regenerate README screenshots and the demo video for WOD Brains.
---

# README Workflow (Screenshots + Demo Video)

Use this workflow whenever the README visuals or copy need an update.

## Outputs

- Screenshots: `docs/screenshots/`
  - `import.png`
  - `definition.png`
  - `run-landscape.png`
  - `multiplayer-leader.png`
  - `multiplayer-participant.png`

## Requirements

- Use mobile portrait viewports for Import + Definition.
- Use landscape for the Run screen.
- Wait for the "Tap anywhere to count" hint to fade out before capturing run screenshots.
- Paste at least one eval fixture verbatim from `apps/worker/test/evals/manifest.json`.
- Keep README links pointing at `https://wodbrains.com`.

## Steps

1. Ensure Playwright ports are available (defaults: web `5174`, worker `8788`).
2. Generate screenshots:
   ```bash
   pnpm run test:readme
   ```
3. Verify README renders correctly:
   - Image paths resolve
   - The multiplayer table shows both leader/participant views

## Checklist

- `docs/screenshots/*` updated with fresh captures
- README examples still include the eval workout fixture
- Run screen visuals are captured in landscape
- "Tap anywhere to count" is not visible in run screenshots

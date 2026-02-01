import {
  buildTimerDescription,
  compileWorkoutDefinition,
  type TimerPlan,
  type WorkoutBlock,
  type WorkoutDefinition,
} from '@wodbrains/core';
import { createRun, ensureAnonymousSession, getDefinition } from '../api';
import { navigate } from '../router';
import { type DisplayNode, workoutBlocksToDisplayNodes } from '../display/compact';
import { appHeader, setupAppHeader, setAppHeaderTitle } from '../components/header';
import { updateMeta } from '../meta';

function renderBlocks(blocks: WorkoutBlock[], target: HTMLElement) {
  target.innerHTML = '';
  const nodes = workoutBlocksToDisplayNodes(blocks);
  if (!nodes.length) {
    target.textContent = 'No steps.';
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'List';
  const render = (items: DisplayNode[], parent: HTMLElement) => {
    for (const node of items) {
      const li = document.createElement('li');
      li.textContent = node.label;
      parent.appendChild(li);
      if (node.children?.length) {
        const nested = document.createElement('ul');
        nested.className = 'List';
        li.appendChild(nested);
        render(node.children, nested);
      }
    }
  };
  render(nodes, ul);
  target.appendChild(ul);
}

export async function renderDefinitionPage(root: HTMLElement, definitionId: string) {
  root.innerHTML = `
    <div class="DefinitionShell">
      ${appHeader({
        centerSlot: 'title',
        rightHtml: `
          <button class="AppHeaderIconBtn MobileOnly" id="shareWorkoutHeader" type="button" aria-label="Share workout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12"/>
              <path d="M7 8l5-5 5 5"/>
              <rect x="4" y="13" width="16" height="8" rx="2"/>
            </svg>
          </button>
        `,
      })}

      <main class="DefinitionContent" id="main-content">
        <h1 class="DefinitionTitle DesktopOnly" id="definitionTitle"></h1>
        <div class="DefinitionWorkout" id="steps"></div>
        <div class="Status" id="status" role="status" aria-live="polite"></div>

        <div class="DefinitionActions">
          <button class="PrimaryBtn IconBtn DefinitionGetSetBtn" id="startCountdown" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="13" r="8"/>
              <path d="M12 9v4l2 2"/>
              <path d="M9 2h6"/>
              <path d="M12 2v2"/>
            </svg>
            Get Set
          </button>
          <button class="DefinitionAction DefinitionAction--share DesktopOnly" id="shareWorkout" type="button" aria-label="Share workout">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12"/>
              <path d="M7 8l5-5 5 5"/>
              <rect x="4" y="13" width="16" height="8" rx="2"/>
            </svg>
          </button>
          <button class="DefinitionAction DefinitionAction--edit" id="editTimer" type="button" aria-label="Edit workout">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              <path d="m15 5 4 4"/>
            </svg>
          </button>
        </div>
      </main>

      <footer class="PageFooter">
        <p class="FooterTagline">
          WOD Brains magically builds a smart timer from any workout. Paste text, drop a screenshot, or share a URL.
        </p>
        <div class="FooterLinks">
          <a href="/about" class="FooterLink">About</a>
          <span class="FooterDivider" aria-hidden="true">·</span>
          <a href="mailto:jd@conleychaos.com" class="FooterLink">Contact Us</a>
        </div>
        <div class="FooterCopyright">WOD Brains™ · © 2026 Conley Chaos LLC</div>
      </footer>
    </div>
  `;

  setupAppHeader(root);

  const titleEl = root.querySelector<HTMLDivElement>('#definitionTitle')!;
  const stepsEl = root.querySelector<HTMLDivElement>('#steps')!;
  const statusEl = root.querySelector<HTMLDivElement>('#status')!;
  const startCountdownEl = root.querySelector<HTMLButtonElement>('#startCountdown')!;
  const shareWorkoutEl = root.querySelector<HTMLButtonElement>('#shareWorkout')!;
  const shareHeaderEl = root.querySelector<HTMLButtonElement>('#shareWorkoutHeader');
  const editTimerEl = root.querySelector<HTMLButtonElement>('#editTimer')!;

  editTimerEl.addEventListener('click', () =>
    navigate(`/w/${encodeURIComponent(definitionId)}/edit`),
  );

  const setStatus = (msg: string, tone: 'muted' | 'error' | 'ok' = 'muted') => {
    statusEl.textContent = msg;
    statusEl.dataset.tone = tone;
  };

  setStatus('Loading...', 'muted');
  try {
    const def = await getDefinition(definitionId);

    // Set title from source preview or fallback
    const workoutDefinition = def?.workoutDefinition as WorkoutDefinition | undefined;

    const planFromApi = def?.timerPlan as TimerPlan | undefined;
    const compiledPlan = workoutDefinition
      ? compileWorkoutDefinition(workoutDefinition)
      : undefined;
    const plan = compiledPlan ?? planFromApi;
    const description = buildTimerDescription(workoutDefinition, plan);
    titleEl.textContent = description.title;
    setAppHeaderTitle(root, description.title);
    updateMeta({
      title: `${description.title} - WOD Brains`,
      description:
        def?.source?.preview?.trim() ||
        (description.title
          ? `Run ${description.title} with WOD Brains.`
          : 'Run this workout timer on WOD Brains.'),
      url: new URL(`/w/${encodeURIComponent(definitionId)}`, window.location.origin).toString(),
    });
    const blocks = workoutDefinition?.blocks ?? [];
    renderBlocks(blocks, stepsEl);

    setStatus('', 'muted');

    const shareWorkoutLink = async () => {
      const url = new URL(`/w/${encodeURIComponent(definitionId)}`, window.location.origin).toString();
      const title = description.title?.trim()
        ? `WOD Brains · ${description.title}`
        : 'WOD Brains';
      const text = 'Workout at the same time with friends. Start this workout on WOD Brains.';
      try {
        if (navigator.share) {
          await navigator.share({ title, text, url });
          return;
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setStatus('Link copied to clipboard', 'ok');
          return;
        }
        setStatus('Copy the workout link from the address bar.', 'muted');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(message, 'error');
      }
    };

    shareWorkoutEl.addEventListener('click', () => {
      void shareWorkoutLink();
    });

    shareHeaderEl?.addEventListener('click', () => {
      void shareWorkoutLink();
    });

    startCountdownEl.addEventListener('click', async () => {
      startCountdownEl.disabled = true;
      try {
        await ensureAnonymousSession();
        // Always compile the plan from the workout definition so existing saved workouts
        // pick up the latest grouping/round behavior.
        const planToRun = compiledPlan ?? def.timerPlan;
        const { runId } = await createRun(planToRun, { definitionId });
        navigate(`/r/${encodeURIComponent(runId)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(msg, 'error');
      } finally {
        startCountdownEl.disabled = false;
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(msg, 'error');
  }
}

import Sortable from 'sortablejs';
import {
  buildTimerDescription,
  compileWorkoutDefinition,
  formatTimeMs,
  type WorkoutBlock,
  type WorkoutDefinition,
} from '@wodbrains/core';
import {
  ApiError,
  createRun,
  copyDefinition,
  ensureAnonymousSession,
  getDefinition,
  patchDefinitionWorkoutDefinition,
  submitParseFeedback,
} from '../api';
import { getRoute, navigate } from '../router';
import { appHeader, setupAppHeader } from '../components/header';
import { cleanTitlePart, formatSiteTitle, updateMeta } from '../meta';
import { haptics } from '../utils/haptics';
import { showToast } from '../components/toast';

function formatDurationInput(ms?: number): string {
  if (ms === undefined || ms === null) return '';
  return formatTimeMs(ms);
}

function parseDurationMs(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 1) return Math.max(0, parts[0]) * 1000;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return null;
}

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `block_${Math.random().toString(36).slice(2, 10)}`;
};

const autosizeTextarea = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = '0px';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const ensureBlockIds = (blocks: WorkoutBlock[]) => {
  for (const block of blocks) {
    if (!block.blockId) block.blockId = createId();
    if ('blocks' in block && Array.isArray(block.blocks)) {
      ensureBlockIds(block.blocks);
    }
  }
};

const createBlock = (type: string): WorkoutBlock => {
  const blockId = createId();
  switch (type) {
    case 'sequence':
      return { type: 'sequence', blockId, label: 'Sequence', blocks: [] };
    case 'repeat':
      return { type: 'repeat', blockId, label: 'Repeat', rounds: 2, blocks: [] };
    case 'interval':
    case 'interval-rest-after':
      return {
        type: 'interval',
        blockId,
        label: 'Intervals',
        rounds: 5,
        workMs: 20000,
        restMs: 10000,
        startWith: 'work',
        blocks: [],
      };
    case 'interval-rest-before':
      return {
        type: 'interval',
        blockId,
        label: 'Intervals',
        rounds: 5,
        workMs: 20000,
        restMs: 10000,
        startWith: 'rest',
        blocks: [],
      };
    case 'interval-no-rest':
      return {
        type: 'interval',
        blockId,
        label: 'Intervals',
        rounds: 5,
        workMs: 20000,
        restMs: 0,
        startWith: 'work',
        blocks: [],
      };
    case 'countdown':
      return { type: 'timer', blockId, label: 'Countdown', mode: 'countdown', durationMs: 60000 };
    case 'countup':
      return { type: 'timer', blockId, label: 'Count up', mode: 'countup' };
    case 'amrap':
      return {
        type: 'timer',
        blockId,
        label: 'AMRAP',
        mode: 'countdown',
        durationMs: 600000,
        blocks: [
          {
            type: 'repeat',
            blockId: createId(),
            label: 'Round',
            // rounds omitted => open-ended
            blocks: [],
          },
        ],
      };
    case 'step':
      return { type: 'step', blockId, label: 'New step' };
    case 'note':
      return { type: 'note', blockId, text: 'Note' };
    default:
      return { type: 'step', blockId, label: 'New step' };
  }
};

const resolveWorkoutTitleForMeta = (opts: {
  explicitTitle?: string | null;
  derivedTitle?: string | null;
}): string => {
  const explicit = cleanTitlePart(opts.explicitTitle);
  if (explicit) return explicit;
  const derived = cleanTitlePart(opts.derivedTitle);
  if (derived && derived.toLowerCase() !== 'workout') return derived;
  return 'Workout';
};

const getParentAtPath = (rootBlocks: WorkoutBlock[], path: number[]) => {
  let blocks = rootBlocks;
  for (let i = 0; i < path.length - 1; i += 1) {
    const idx = path[i];
    const block = blocks[idx];
    if (block && 'blocks' in block && Array.isArray(block.blocks)) {
      blocks = block.blocks;
    }
  }
  return { blocks, index: path[path.length - 1] };
};

const getBlocksAtPath = (rootBlocks: WorkoutBlock[], path: number[]): WorkoutBlock[] => {
  if (path.length === 0) return rootBlocks;
  let blocks = rootBlocks;
  for (const idx of path) {
    const block = blocks[idx];
    if (block && 'blocks' in block && Array.isArray(block.blocks)) {
      blocks = block.blocks;
    } else {
      return [];
    }
  }
  return blocks;
};

export async function renderTimerEditPage(root: HTMLElement, definitionId: string) {
  updateMeta({
    title: formatSiteTitle('Workout'),
    description: 'Edit your workout timer details in WOD Brains.',
    url: new URL(`/w/${encodeURIComponent(definitionId)}`, window.location.origin).toString(),
  });

  root.innerHTML = `
    <div class="PageShell">
      ${appHeader({
        backTarget: '/',
        compact: true,
        centerSlot: 'titleInput',
        titleInput: {
          id: 'workoutTitle',
          placeholder: 'Workout title (optional)',
          ariaLabel: 'Workout title',
        },
        rightHtml: `
          <button class="AppHeaderIconBtn" id="shareWorkoutHeader" type="button" aria-label="Share workout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12"/>
              <path d="M7 8l5-5 5 5"/>
              <rect x="4" y="13" width="16" height="8" rx="2"/>
            </svg>
          </button>
        `,
      })}
      <main class="PageContent" id="main-content">
        <div class="BuilderTree" data-testid="builder-tree" id="builderTree" role="list" aria-label="Workout steps"></div>

        <div class="AddBlockSplit" id="addRootSplit">
          <button class="AddBtn AddBlockMain" data-testid="add-step" type="button" aria-label="Add step">+ add step</button>
          <button class="AddBtn AddBlockDropdown" id="addRootDropdown" type="button" aria-label="More block types" aria-haspopup="true" aria-expanded="false">▾</button>
          <div class="AddBlockMenu hidden" id="addRootMenu" role="menu" aria-label="Block types">
            <button type="button" data-type="repeat" role="menuitem">Repeat</button>
            <button type="button" data-type="sequence" role="menuitem">Sequence</button>
            <button type="button" data-type="countdown" role="menuitem">Countdown</button>
            <button type="button" data-type="countup" role="menuitem">Count up</button>
            <button type="button" data-type="amrap" role="menuitem">AMRAP section</button>
            <button type="button" data-type="note" role="menuitem">Note</button>
            <button type="button" data-type="interval-no-rest" role="menuitem">Interval (no rest)</button>
            <button type="button" data-type="interval-rest-after" role="menuitem">Interval (rest after)</button>
            <button type="button" data-type="interval-rest-before" role="menuitem">Interval (rest before)</button>
          </div>
        </div>

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
          <button class="DefinitionAction DefinitionAction--report" id="reportParse" type="button" aria-label="Timer looks wrong">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
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
          <a href="/terms" class="FooterLink">Terms</a>
          <span class="FooterDivider" aria-hidden="true">·</span>
          <a href="/privacy" class="FooterLink">Privacy</a>
          <span class="FooterDivider" aria-hidden="true">·</span>
          <a href="mailto:jd@conleychaos.com" class="FooterLink">Contact Us</a>
        </div>
        <div class="FooterCopyright">WOD Brains™ · © 2026 Conley Chaos LLC</div>
      </footer>

    </div>
  `;

  const titleEl = root.querySelector<HTMLInputElement>('#workoutTitle')!;
  const builderTreeEl = root.querySelector<HTMLDivElement>('#builderTree')!;
  const addRootSplit = root.querySelector<HTMLDivElement>('#addRootSplit')!;
  const addRootMainBtn = addRootSplit.querySelector<HTMLButtonElement>('.AddBlockMain')!;
  const addRootDropdownBtn = root.querySelector<HTMLButtonElement>('#addRootDropdown')!;
  const addRootMenu = root.querySelector<HTMLDivElement>('#addRootMenu')!;
  const startCountdownEl = root.querySelector<HTMLButtonElement>('#startCountdown')!;
  const shareHeaderEl = root.querySelector<HTMLButtonElement>('#shareWorkoutHeader')!;
  const reportParseEl = root.querySelector<HTMLButtonElement>('#reportParse')!;

  let activeDefinitionId = definitionId;
  let workoutDefinition: WorkoutDefinition | null = null;
  let savedSnapshot: string | null = null;
  let autosaveTimer: number | null = null;
  let autosaveInFlight: Promise<void> | null = null;
  let lastMetaKey = '';
  let sourcePreview: string | null = null;
  let planFromApi: unknown = null;

  const openFeedbackDialog = () => {
    if (!activeDefinitionId) return;
    const lastFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement('div');
    overlay.className = 'ConfirmDialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const titleId = `feedback-title-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    overlay.setAttribute('aria-labelledby', titleId);

    const card = document.createElement('div');
    card.className = 'ConfirmDialogCard FeedbackDialogCard';

    const titleEl = document.createElement('div');
    titleEl.className = 'ConfirmDialogTitle';
    titleEl.id = titleId;
    titleEl.textContent = 'Timer looks wrong';

    const descEl = document.createElement('div');
    descEl.className = 'ConfirmDialogDescription';
    descEl.textContent =
      'Tell us what it should look like. We’ll include your original workout and your edits.';

    const noteEl = document.createElement('textarea');
    noteEl.className = 'FeedbackTextarea';
    noteEl.placeholder = 'What should the timer have looked like?';
    noteEl.setAttribute('aria-label', 'Report details');
    noteEl.rows = 4;

    const actions = document.createElement('div');
    actions.className = 'FeedbackActions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'GhostBtn';
    cancelBtn.textContent = 'Cancel';

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'PrimaryBtn';
    sendBtn.textContent = 'Send report';

    actions.append(cancelBtn, sendBtn);
    card.append(titleEl, descEl, noteEl, actions);
    overlay.appendChild(card);

    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      lastFocused?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      try {
        await ensureAnonymousSession();
        await submitParseFeedback({
          definitionId: activeDefinitionId,
          category: 'bad_parse',
          note: noteEl.value.trim() || undefined,
          currentWorkoutDefinition: workoutDefinition ?? undefined,
          currentTimerPlan: workoutDefinition
            ? compileWorkoutDefinition(workoutDefinition)
            : undefined,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        });
        showToast('Report sent. Thank you!', 'ok');
        close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(message || 'Could not send report.', 'error');
        sendBtn.disabled = false;
      }
    });

    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
    noteEl.focus();
  };

  let noteAutosizeRaf: number | null = null;
  let builderResizeObserver: ResizeObserver | null = null;
  let documentClickHandler: ((e: MouseEvent) => void) | null = null;

  reportParseEl.addEventListener('click', () => openFeedbackDialog());
  const autosizeAllNotes = () => {
    builderTreeEl
      .querySelectorAll<HTMLTextAreaElement>('[data-testid="block-note-input"]')
      .forEach((note) => autosizeTextarea(note));
  };
  const scheduleNoteAutosize = () => {
    if (noteAutosizeRaf !== null) return;
    noteAutosizeRaf = window.requestAnimationFrame(() => {
      noteAutosizeRaf = null;
      autosizeAllNotes();
    });
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleNoteAutosize);
  }
  window.addEventListener('resize', scheduleNoteAutosize);
  if (typeof ResizeObserver !== 'undefined') {
    builderResizeObserver = new ResizeObserver(() => scheduleNoteAutosize());
    builderResizeObserver.observe(builderTreeEl);
  }

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (noteAutosizeRaf !== null) {
      window.cancelAnimationFrame(noteAutosizeRaf);
      noteAutosizeRaf = null;
    }

    if (autosaveTimer) {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    window.removeEventListener('resize', scheduleNoteAutosize);
    window.visualViewport?.removeEventListener('resize', scheduleNoteAutosize);

    builderResizeObserver?.disconnect();
    builderResizeObserver = null;

    if (documentClickHandler) {
      document.removeEventListener('click', documentClickHandler);
      documentClickHandler = null;
    }

    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('pagehide', onPageHide);
  };

  const onPopState = () => {
    const route = getRoute();
    const stillOnThisDefinition =
      (route.name === 'definition' || route.name === 'definition-edit') &&
      route.definitionId === definitionId;
    if (!stillOnThisDefinition) cleanup();
  };

  const onPageHide = () => {
    cleanup();
  };

  window.addEventListener('popstate', onPopState);
  window.addEventListener('pagehide', onPageHide);

  const hasUnsavedChanges = (): boolean => {
    if (!workoutDefinition || !savedSnapshot) return false;
    const current = JSON.stringify({
      title: titleEl.value.trim() || undefined,
      blocks: workoutDefinition.blocks,
    });
    return current !== savedSnapshot;
  };

  const updateSavedSnapshot = () => {
    if (!workoutDefinition) return;
    savedSnapshot = JSON.stringify({
      title: titleEl.value.trim() || undefined,
      blocks: workoutDefinition.blocks,
    });
  };

  const updateWorkoutMeta = () => {
    const explicitTitle = cleanTitlePart(titleEl.value);
    const derivedTitle =
      workoutDefinition != null
        ? buildTimerDescription(workoutDefinition, planFromApi as any).title
        : null;
    const resolvedTitle = resolveWorkoutTitleForMeta({ explicitTitle, derivedTitle });
    const url = new URL(
      `/w/${encodeURIComponent(activeDefinitionId)}`,
      window.location.origin,
    ).toString();
    const description =
      cleanTitlePart(sourcePreview) ||
      (explicitTitle
        ? `Run ${explicitTitle} with WOD Brains.`
        : resolvedTitle.toLowerCase() !== 'workout'
          ? `Run ${resolvedTitle} with WOD Brains.`
          : 'Run this workout timer on WOD Brains.');
    const key = `${resolvedTitle}|${description}|${url}`;
    if (key === lastMetaKey) return;
    lastMetaKey = key;
    updateMeta({
      title: formatSiteTitle(resolvedTitle),
      description,
      url,
    });
  };

  const shareWorkoutLink = async () => {
    if (!workoutDefinition) return;
    await flushAutosave({ navigateOnClone: false });
    const plan = compileWorkoutDefinition(workoutDefinition);
    const description = buildTimerDescription(workoutDefinition, plan);
    const url = new URL(
      `/w/${encodeURIComponent(activeDefinitionId)}`,
      window.location.origin,
    ).toString();
    const shareBase = resolveWorkoutTitleForMeta({
      explicitTitle: cleanTitlePart(titleEl.value),
      derivedTitle: description.title,
    });
    const title = shareBase ? `WOD Brains · ${shareBase}` : 'WOD Brains';
    const text = 'Try this workout on WOD Brains. Start it and invite friends to join live.';
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast('Link copied', 'ok');
        return;
      }
      showToast('Copy the workout link from the address bar.', 'muted', { timeoutMs: 1800 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
    }
  };

  const saveDefinition = async (
    opts: { navigateOnClone?: boolean; showSuccessToast?: boolean } = {},
  ) => {
    if (!workoutDefinition) return null;
    try {
      await ensureAnonymousSession();
      workoutDefinition.title = titleEl.value.trim() || undefined;
      ensureBlockIds(workoutDefinition.blocks);
      await patchDefinitionWorkoutDefinition(activeDefinitionId, workoutDefinition);
      updateSavedSnapshot();
      updateWorkoutMeta();
      if (opts.showSuccessToast) showToast('Saved', 'ok');
      return { definitionId: activeDefinitionId, workoutDefinition };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
        try {
          const copied = await copyDefinition(activeDefinitionId);
          const newDefinitionId = copied.definitionId;
          const copiedDefinition = await getDefinition(newDefinitionId);
          const copiedWorkoutDefinition = copiedDefinition?.workoutDefinition as
            | WorkoutDefinition
            | undefined;
          if (!copiedWorkoutDefinition?.id) {
            throw new Error('Copied workout not available.');
          }
          activeDefinitionId = newDefinitionId;
          workoutDefinition.id = copiedWorkoutDefinition.id;
          await patchDefinitionWorkoutDefinition(newDefinitionId, workoutDefinition);
          updateSavedSnapshot();
          updateWorkoutMeta();
          if (opts.showSuccessToast) showToast('Saved as a copy', 'ok');
          if (opts.navigateOnClone !== false) {
            navigate(`/w/${encodeURIComponent(newDefinitionId)}`);
          }
          return { definitionId: newDefinitionId, workoutDefinition };
        } catch (cloneErr) {
          const msg = cloneErr instanceof Error ? cloneErr.message : String(cloneErr);
          showToast(msg, 'error');
          return null;
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg, 'error');
      return null;
    }
  };

  const scheduleAutosave = () => {
    if (!workoutDefinition) return;
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void flushAutosave();
    }, 650);
  };

  const flushAutosave = async (opts: { navigateOnClone?: boolean } = {}) => {
    if (!workoutDefinition) return;
    if (!hasUnsavedChanges()) return;
    if (autosaveInFlight) await autosaveInFlight;
    if (!hasUnsavedChanges()) return;
    autosaveInFlight = (async () => {
      await saveDefinition({ navigateOnClone: opts.navigateOnClone, showSuccessToast: false });
    })();
    await autosaveInFlight;
    autosaveInFlight = null;
  };

  const markChanged = () => {
    scheduleAutosave();
  };

  // Set up header
  const backTarget = '/';
  setupAppHeader(root, {
    backTarget,
    onBeforeBack: async () => {
      if (!workoutDefinition) {
        cleanup();
        return true;
      }
      if (autosaveTimer) {
        window.clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      await flushAutosave({ navigateOnClone: false });
      if (hasUnsavedChanges()) {
        const ok = window.confirm('You have unsaved changes. Leave without saving?');
        if (!ok) return false;
      }
      cleanup();
      return true;
    },
  });

  const renderBlock = (block: WorkoutBlock, path: number[]) => {
    const node = document.createElement('div');
    node.className = 'BuilderNode';
    node.dataset.path = path.join('.');
    node.dataset.testid = 'builder-node';
    node.setAttribute('role', 'listitem');

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'DragHandle';
    dragHandle.textContent = '⋮';
    dragHandle.setAttribute('aria-label', 'Drag to reorder');
    node.append(dragHandle);

    // Delete button (will be positioned at end)
    const del = document.createElement('button');
    del.className = 'DeleteBtn';
    del.dataset.testid = 'block-delete';
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete step');
    del.textContent = '×';
    del.addEventListener('click', () => {
      if (!workoutDefinition) return;
      haptics.medium();
      const { blocks, index } = getParentAtPath(workoutDefinition.blocks, path);
      blocks.splice(index, 1);
      renderTree();
      markChanged();
    });

    // Build inline sentence based on block type
    if (block.type === 'step') {
      // step: ⋮ [label] ×
      const labelInput = document.createElement('input');
      labelInput.className = 'InlineInput InlineInput--label';
      labelInput.dataset.testid = 'block-label-input';
      labelInput.type = 'text';
      labelInput.placeholder = 'Step name';
      labelInput.setAttribute('aria-label', 'Step name');
      labelInput.value = block.label ?? '';
      labelInput.addEventListener('input', () => {
        block.label = labelInput.value;
        markChanged();
      });
      node.append(labelInput, del);
    }

    if (block.type === 'repeat') {
      // repeat: ⋮ repeat [rounds] times ×
      const keyword = document.createElement('span');
      keyword.className = 'BlockKeyword';
      keyword.textContent = 'repeat';

      const roundsInput = document.createElement('input');
      roundsInput.className = 'InlineInput InlineInput--number';
      roundsInput.dataset.testid = 'block-rounds-input';
      roundsInput.type = 'number';
      roundsInput.min = '1';
      roundsInput.placeholder = '∞';
      roundsInput.setAttribute('aria-label', 'Number of rounds');
      roundsInput.value = block.rounds ? String(block.rounds) : '';
      roundsInput.addEventListener('input', () => {
        const raw = roundsInput.value.trim();
        if (!raw) {
          block.rounds = undefined;
          markChanged();
          return;
        }
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          block.rounds = parsed;
          markChanged();
        }
      });
      // Re-render on stable events so nesting updates.
      roundsInput.addEventListener('change', () => {
        renderTree();
        markChanged();
      });
      roundsInput.addEventListener('blur', () => {
        renderTree();
        markChanged();
      });

      const text = document.createElement('span');
      text.className = 'BlockText';
      text.textContent = 'times';

      node.append(keyword, roundsInput, text, del);
    }

    if (block.type === 'interval') {
      // interval: ⋮ interval [rounds] × [work] work / [rest] rest ×
      const keyword = document.createElement('span');
      keyword.className = 'BlockKeyword';
      keyword.textContent = 'interval';

      const roundsInput = document.createElement('input');
      roundsInput.className = 'InlineInput InlineInput--number';
      roundsInput.dataset.testid = 'block-rounds-input';
      roundsInput.type = 'number';
      roundsInput.min = '1';
      roundsInput.setAttribute('aria-label', 'Number of intervals');
      roundsInput.value = String(block.rounds ?? 1);
      roundsInput.addEventListener('input', () => {
        const parsed = Number.parseInt(roundsInput.value, 10);
        block.rounds = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        markChanged();
      });

      const times = document.createElement('span');
      times.className = 'BlockText';
      times.textContent = '×';

      const workInput = document.createElement('input');
      workInput.className = 'InlineInput InlineInput--time';
      workInput.dataset.testid = 'block-duration-input';
      workInput.placeholder = '0:20';
      workInput.setAttribute('aria-label', 'Work duration');
      workInput.value = formatDurationInput(block.workMs);
      workInput.addEventListener('input', () => {
        const parsed = parseDurationMs(workInput.value);
        if (parsed !== null) {
          block.workMs = parsed;
          markChanged();
        }
      });

      const workText = document.createElement('span');
      workText.className = 'BlockText';
      workText.textContent = 'work';

      const restEnabled = (block.restMs ?? 0) > 0;

      if (restEnabled) {
        const restInput = document.createElement('input');
        restInput.className = 'InlineInput InlineInput--time';
        restInput.placeholder = '0:10';
        restInput.setAttribute('aria-label', 'Rest duration');
        restInput.value = formatDurationInput(block.restMs);
        restInput.addEventListener('input', () => {
          const parsed = parseDurationMs(restInput.value);
          if (parsed !== null && parsed > 0) {
            block.restMs = parsed;
            markChanged();
          }
        });

        const restText = document.createElement('span');
        restText.className = 'BlockText';
        restText.textContent = 'rest';

        const separator = document.createElement('span');
        separator.className = 'BlockText';
        separator.textContent = '/';

        const beforeRest = block.startWith === 'rest';
        if (beforeRest) {
          node.append(
            keyword,
            roundsInput,
            times,
            restInput,
            restText,
            separator,
            workInput,
            workText,
            del,
          );
        } else {
          node.append(
            keyword,
            roundsInput,
            times,
            workInput,
            workText,
            separator,
            restInput,
            restText,
            del,
          );
        }
      } else {
        node.append(keyword, roundsInput, times, workInput, workText, del);
      }
    }

    if (block.type === 'timer') {
      if (block.mode === 'countdown') {
        // countdown: ⋮ countdown [duration] [label] ×
        const keyword = document.createElement('span');
        keyword.className = 'BlockKeyword';
        keyword.textContent = 'countdown';

        const durationInput = document.createElement('input');
        durationInput.className = 'InlineInput InlineInput--time';
        durationInput.dataset.testid = 'block-duration-input';
        durationInput.placeholder = '1:00';
        durationInput.setAttribute('aria-label', 'Countdown duration');
        durationInput.value = formatDurationInput(block.durationMs);
        durationInput.addEventListener('input', () => {
          const parsed = parseDurationMs(durationInput.value);
          if (parsed !== null) {
            block.durationMs = parsed;
            markChanged();
          }
        });

        const labelInput = document.createElement('input');
        labelInput.className = 'InlineInput InlineInput--label';
        labelInput.dataset.testid = 'block-label-input';
        labelInput.type = 'text';
        labelInput.placeholder = 'Label';
        labelInput.setAttribute('aria-label', 'Countdown label');
        labelInput.value = block.label ?? '';
        labelInput.addEventListener('input', () => {
          block.label = labelInput.value;
          markChanged();
        });

        node.append(keyword, durationInput, labelInput, del);
      } else {
        // countup: ⋮ count up [label] ×
        const keyword = document.createElement('span');
        keyword.className = 'BlockKeyword';
        keyword.textContent = 'count up';

        const labelInput = document.createElement('input');
        labelInput.className = 'InlineInput InlineInput--label';
        labelInput.dataset.testid = 'block-label-input';
        labelInput.type = 'text';
        labelInput.placeholder = 'Label';
        labelInput.setAttribute('aria-label', 'Count up label');
        labelInput.value = block.label ?? '';
        labelInput.addEventListener('input', () => {
          block.label = labelInput.value;
          markChanged();
        });

        node.append(keyword, labelInput, del);
      }
    }

    if (block.type === 'sequence') {
      // sequence: ⋮ sequence [label] ×
      const keyword = document.createElement('span');
      keyword.className = 'BlockKeyword';
      keyword.textContent = 'sequence';

      const labelInput = document.createElement('input');
      labelInput.className = 'InlineInput InlineInput--label';
      labelInput.dataset.testid = 'block-label-input';
      labelInput.type = 'text';
      labelInput.placeholder = 'Label';
      labelInput.setAttribute('aria-label', 'Sequence label');
      labelInput.value = block.label ?? '';
      labelInput.addEventListener('input', () => {
        block.label = labelInput.value;
        markChanged();
      });

      node.append(keyword, labelInput, del);
    }

    if (block.type === 'note') {
      node.classList.add('BuilderNode--note');
      // note: ⋮ note [text] ×
      const keyword = document.createElement('span');
      keyword.className = 'BlockKeyword';
      keyword.textContent = 'note';

      const noteInput = document.createElement('textarea');
      noteInput.className = 'InlineTextarea';
      noteInput.dataset.testid = 'block-note-input';
      noteInput.placeholder = 'Note';
      noteInput.setAttribute('aria-label', 'Note text');
      noteInput.rows = 1;
      noteInput.value = block.text ?? '';
      noteInput.addEventListener('input', () => {
        block.text = noteInput.value;
        autosizeTextarea(noteInput);
        markChanged();
      });

      node.append(keyword, noteInput, del);
    }

    // Handle children for container blocks
    let children: WorkoutBlock[] | undefined = undefined;
    const childrenPath = path;
    if (
      block.type === 'sequence' ||
      block.type === 'repeat' ||
      block.type === 'interval' ||
      (block.type === 'timer' && block.mode === 'countdown')
    ) {
      children = block.blocks ?? (block.blocks = []);
    }

    if (children) {
      const childContainer = document.createElement('div');
      childContainer.className = 'BuilderNodeChildren';
      childContainer.dataset.parentPath = childrenPath.join('.');

      children.forEach((child, index) => {
        childContainer.appendChild(renderBlock(child, [...childrenPath, index]));
      });

      // Add button inside children container
      const childSplit = document.createElement('div');
      childSplit.className = 'AddBlockSplit';
      childSplit.innerHTML = `
        <button class="AddBtn AddBlockMain" data-testid="add-step" type="button">+ add step</button>
        <button class="AddBtn AddBlockDropdown" type="button">▾</button>
        <div class="AddBlockMenu hidden">
          <button type="button" data-type="repeat">Repeat</button>
          <button type="button" data-type="sequence">Sequence</button>
          <button type="button" data-type="countdown">Countdown</button>
          <button type="button" data-type="countup">Count up</button>
          <button type="button" data-type="amrap">AMRAP section</button>
          <button type="button" data-type="note">Note</button>
          <button type="button" data-type="interval-no-rest">Interval (no rest)</button>
          <button type="button" data-type="interval-rest-after">Interval (rest after)</button>
          <button type="button" data-type="interval-rest-before">Interval (rest before)</button>
        </div>
      `;

      const childMainBtn = childSplit.querySelector<HTMLButtonElement>('.AddBlockMain')!;
      const childDropdownBtn = childSplit.querySelector<HTMLButtonElement>('.AddBlockDropdown')!;
      const childMenu = childSplit.querySelector<HTMLDivElement>('.AddBlockMenu')!;

      childMainBtn.addEventListener('click', () => {
        if (!workoutDefinition) return;
        children!.push(createBlock('step'));
        renderTree();
        markChanged();
      });

      childDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        childMenu.classList.toggle('hidden');
      });

      childMenu.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!workoutDefinition) return;
          const type = btn.getAttribute('data-type') ?? 'step';
          children!.push(createBlock(type));
          childMenu.classList.add('hidden');
          renderTree();
          markChanged();
        });
      });

      childContainer.append(childSplit);
      node.append(childContainer);
    }

    return node;
  };

  const initSortable = (container: HTMLElement) => {
    Sortable.create(container, {
      group: 'builder',
      handle: '.DragHandle',
      animation: 150,
      delay: 150,
      delayOnTouchOnly: true,
      ghostClass: 'BuilderNode--ghost',
      chosenClass: 'BuilderNode--chosen',
      dragClass: 'BuilderNode--drag',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onStart: () => {
        haptics.light();
      },
      onEnd: (evt) => {
        if (!workoutDefinition) return;
        haptics.medium();

        const fromContainer = evt.from;
        const toContainer = evt.to;
        const oldIndex = evt.oldIndex;
        const newIndex = evt.newIndex;

        if (oldIndex === undefined || newIndex === undefined) return;

        // Get source and destination paths
        const fromPath = fromContainer.dataset.parentPath
          ? fromContainer.dataset.parentPath.split('.').map(Number)
          : [];
        const toPath = toContainer.dataset.parentPath
          ? toContainer.dataset.parentPath.split('.').map(Number)
          : [];

        const fromBlocks = getBlocksAtPath(workoutDefinition.blocks, fromPath);
        const toBlocks = getBlocksAtPath(workoutDefinition.blocks, toPath);

        // Remove from source
        const [movedBlock] = fromBlocks.splice(oldIndex, 1);

        // Insert at destination
        toBlocks.splice(newIndex, 0, movedBlock);

        // Re-render to update paths
        renderTree();
        markChanged();
      },
    });
  };

  const renderTree = () => {
    if (!workoutDefinition) return;
    builderTreeEl.innerHTML = '';
    workoutDefinition.blocks.forEach((block, index) => {
      builderTreeEl.appendChild(renderBlock(block, [index]));
    });

    // Initialize Sortable on root tree
    initSortable(builderTreeEl);

    // Initialize Sortable on all child containers
    builderTreeEl.querySelectorAll<HTMLDivElement>('.BuilderNodeChildren').forEach((container) => {
      initSortable(container);
    });

    scheduleNoteAutosize();
  };

  // Root add button handlers
  addRootMainBtn.addEventListener('click', () => {
    if (!workoutDefinition) return;
    workoutDefinition.blocks.push(createBlock('step'));
    renderTree();
    markChanged();
  });

  addRootDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addRootMenu.classList.toggle('hidden');
  });

  addRootMenu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!workoutDefinition) return;
      const type = btn.getAttribute('data-type') ?? 'step';
      workoutDefinition.blocks.push(createBlock(type));
      addRootMenu.classList.add('hidden');
      renderTree();
      markChanged();
    });
  });

  // Close menus when clicking outside
  const onDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.AddBlockSplit')) {
      addRootMenu.classList.add('hidden');
      root.querySelectorAll('.AddBlockMenu').forEach((menu) => menu.classList.add('hidden'));
    }
  };
  documentClickHandler = onDocumentClick;
  document.addEventListener('click', onDocumentClick);

  shareHeaderEl.addEventListener('click', () => {
    void shareWorkoutLink();
  });

  startCountdownEl.addEventListener('click', async () => {
    if (!workoutDefinition) return;
    startCountdownEl.disabled = true;
    try {
      await flushAutosave({ navigateOnClone: false });
      await ensureAnonymousSession();
      ensureBlockIds(workoutDefinition.blocks);
      const planToRun = compileWorkoutDefinition(workoutDefinition);
      const definitionIdForRun = activeDefinitionId;
      const { runId } = await createRun(planToRun, { definitionId: definitionIdForRun });
      navigate(`/r/${encodeURIComponent(runId)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg, 'error');
    } finally {
      startCountdownEl.disabled = false;
    }
  });

  try {
    const def = await getDefinition(definitionId);
    const loaded = def?.workoutDefinition as WorkoutDefinition | undefined;
    if (!loaded) {
      showToast('Workout not found.', 'error');
      return;
    }
    workoutDefinition = loaded;
    titleEl.value = workoutDefinition.title ?? '';
    titleEl.addEventListener('input', () => {
      markChanged();
      updateWorkoutMeta();
    });
    sourcePreview = def?.source?.preview ?? null;
    planFromApi = def?.timerPlan ?? null;
    updateWorkoutMeta();
    ensureBlockIds(workoutDefinition.blocks);
    updateSavedSnapshot();
    renderTree();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(msg, 'error');
  }
}

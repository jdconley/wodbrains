import {
  LATEST_DATA_VERSION,
  advanceFixedStep,
  deriveRunState,
  formatTimeMs,
  updateMonotonicOffset,
  type RunEvent,
  type TimerPlan,
  type TimerPlanSegment,
} from '@wodbrains/core';
import {
  ApiError,
  createRun,
  ensureAnonymousSession,
  getRunAccess,
  getRunSnapshot,
  postRunEvent,
  updateRunSettings,
} from '../api';
import { getRoute, navigate } from '../router';
import { type DisplayNode, timerPlanSegmentsToDisplayNodes } from '../display/compact';
import {
  appHeader,
  setupAppHeader,
  setAppHeaderTitle,
  setAppHeaderVisible,
} from '../components/header';
import { formatSiteTitle, updateMeta } from '../meta';
import { haptics } from '../utils/haptics';
import { initSounds, sounds } from '../utils/sound';
import { showToast } from '../components/toast';

type RunSnapshot = {
  runId: string;
  timerPlan: TimerPlan;
  events: RunEvent[];
  serverNowMonoMs: number;
  derived?: unknown;
  onlineCount?: number;
  timeScale?: number;
  definitionId?: string | null;
};

const createEventId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

export async function renderRunPage(root: HTMLElement, runId: string) {
  const autostart = new URLSearchParams(window.location.search).get('autostart') === '1';
  const requestedTimeScale = (() => {
    const raw = new URLSearchParams(window.location.search).get('timeScale');
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    // Intentionally hidden feature; keep it sane.
    return Math.max(0.1, Math.min(600, parsed));
  })();
  // Initially render with no back target - will be set after loading run data
  root.innerHTML = `
    <div class="RunShell" id="runShell">
      ${appHeader({
        backTarget: '/',
        centerSlot: 'title',
        titleWithLogo: true,
        rightHtml: `
          <button class="AppHeaderIconBtn RunHeaderAction" id="runHeaderSound" type="button" aria-label="Mute sounds" aria-pressed="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
              <path d="M19 6a8.5 8.5 0 0 1 0 12"></path>
            </svg>
          </button>
          <button class="AppHeaderIconBtn RunHeaderAction RunHeaderAction--hidden" id="runHeaderShare" type="button" aria-label="Invite friends to this workout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12"/>
              <path d="M7 8l5-5 5 5"/>
              <rect x="4" y="13" width="16" height="8" rx="2"/>
            </svg>
          </button>
          <button class="AppHeaderIconBtn RunHeaderAction RunHeaderAction--hidden" id="runHeaderEdit" type="button" aria-label="Edit workout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
          </button>
        `,
      })}

      <div class="RunCornerInfo" id="runCornerInfo" aria-live="polite">
        <div class="RunCornerLine" id="runCornerLine"></div>
        <div class="RunCornerScale hidden" id="runCornerScale"></div>
      </div>

      <main class="RunMain" id="tapSurface" aria-label="Workout timer. Tap to count reps.">
        <div class="Timer" id="main-content">
          <div class="TimerMeta TimerMeta--top" id="timerMetaTop" aria-live="polite"></div>
          <div class="TimerValue" id="timerValue" role="timer" aria-label="Elapsed time" aria-live="off">0:00.0</div>
          <div class="TimerMeta TimerMeta--bottom" id="timerMetaBottom" aria-live="polite"></div>
        </div>

        <div class="Status" id="status" role="status" aria-live="polite"></div>
      </main>

      <!-- Start overlay (shown when idle) -->
      <div class="RunStartOverlay" id="startOverlay" role="button" tabindex="0" aria-label="Tap anywhere to start workout">
        <div class="RunStartOverlayContent">
          <div class="StartOverlayText">Tap anywhere to start</div>
          <button class="SecondaryBtn RunStartShareBtn" id="startShareBtn" type="button" aria-label="Invite friends to this workout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12"/>
              <path d="M7 8l5-5 5 5"/>
              <rect x="4" y="13" width="16" height="8" rx="2"/>
            </svg>
            Invite friends
          </button>
        </div>
      </div>

      <!-- Countdown overlay for 3/2/1/GO -->
      <div class="RunCountdownOverlay" id="countdownOverlay" role="alert" aria-live="assertive">
        <div class="CountdownNumber" id="countdownNumber"></div>
      </div>

      <!-- Break overlay (manual advance) -->
      <div class="RunBreakOverlay hidden" id="breakOverlay" role="dialog" aria-modal="true" aria-labelledby="breakTitle" aria-describedby="breakDesc">
        <div class="RunBreakCard">
          <div class="RunBreakTitle" id="breakTitle">Break</div>
          <div class="RunBreakDesc" id="breakDesc">Take your time. Tap Continue when ready.</div>
          <button class="PrimaryBtn RunBreakBtn" id="breakContinue" type="button">Continue</button>
          <div class="RunBreakLeaderNote hidden" id="breakLeaderNote">Waiting for the Leader</div>
        </div>
      </div>

      <!-- Tap hint (fades in after timer starts) -->
      <div class="RunTapHint" id="tapHint" aria-hidden="true">Tap anywhere to count</div>

      <!-- Info overlay (group details) -->
      <div class="RunInfoOverlay hidden" id="infoOverlay" role="dialog" aria-modal="true" aria-labelledby="infoTitle">
        <div class="RunInfoCard">
          <div class="RunInfoHeader">
            <div class="RunInfoTitle" id="infoTitle"></div>
            <button class="GhostBtn MiniBtn IconBtn IconBtn--square" id="infoClose" type="button" aria-label="Close workout details">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="RunInfoList" id="infoList" role="list"></div>
        </div>
      </div>

      <!-- Split log overlay -->
      <div class="RunSplitOverlay hidden" id="splitOverlay" data-testid="split-overlay" role="dialog" aria-modal="true" aria-labelledby="splitTitle">
        <div class="RunSplitCard">
          <div class="RunSplitHeader">
            <div class="RunSplitTitle" id="splitTitle">Splits</div>
            <button class="GhostBtn MiniBtn IconBtn IconBtn--square" id="splitClose" type="button" aria-label="Close splits">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="RunSplitList" id="splitList" role="list"></div>
        </div>
      </div>

      <!-- Rep celebration overlay (temporary on rep count) -->
      <div class="RunRepCelebrationOverlay" id="repCelebrationOverlay" data-testid="rep-celebration" role="alert" aria-live="polite">
        <div class="RepCelebrationNumber" id="repCelebrationNumber"></div>
        <div class="RepCelebrationSplit" id="repCelebrationSplit"></div>
      </div>

      <!-- Finish summary overlay (shown when timer ends) -->
      <div class="RunFinishOverlay hidden" id="finishOverlay" data-testid="finish-overlay" role="dialog" aria-modal="true" aria-label="Workout complete">
        <div class="RunFinishCard">
          <div class="RunFinishHeader">
            <div class="RunFinishTitle">Workout Complete</div>
          </div>
          <div class="RunFinishStats">
            <div class="RunFinishStat">
              <div class="RunFinishStatValue" id="finishTime">0:00.0</div>
              <div class="RunFinishStatLabel">Total Time</div>
            </div>
            <div class="RunFinishStat">
              <div class="RunFinishStatValue" id="finishReps">0</div>
              <div class="RunFinishStatLabel">Reps</div>
            </div>
          </div>
          <div class="RunFinishSplits" id="finishSplitsList" role="list"></div>
          <div class="RunFinishActions">
            <button class="PrimaryBtn" id="finishDone" type="button">Done</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const statusEl = root.querySelector<HTMLDivElement>('#status')!;
  const timerEl = root.querySelector<HTMLDivElement>('.Timer')!;
  const timerMetaTopEl = root.querySelector<HTMLDivElement>('#timerMetaTop')!;
  const timerMetaBottomEl = root.querySelector<HTMLDivElement>('#timerMetaBottom')!;
  const timerValueEl = root.querySelector<HTMLDivElement>('#timerValue')!;
  const tapSurfaceEl = root.querySelector<HTMLDivElement>('#tapSurface')!;
  const runShellEl = root.querySelector<HTMLDivElement>('#runShell')!;
  const startShareBtn = root.querySelector<HTMLButtonElement>('#startShareBtn')!;
  const cornerInfoEl = root.querySelector<HTMLDivElement>('#runCornerInfo')!;
  const cornerLineEl = root.querySelector<HTMLDivElement>('#runCornerLine')!;
  const cornerScaleEl = root.querySelector<HTMLDivElement>('#runCornerScale')!;
  const startOverlayEl = root.querySelector<HTMLDivElement>('#startOverlay')!;
  const countdownOverlayEl = root.querySelector<HTMLDivElement>('#countdownOverlay')!;
  const countdownNumberEl = root.querySelector<HTMLDivElement>('#countdownNumber')!;
  const breakOverlayEl = root.querySelector<HTMLDivElement>('#breakOverlay')!;
  const breakTitleEl = root.querySelector<HTMLDivElement>('#breakTitle')!;
  const breakContinueEl = root.querySelector<HTMLButtonElement>('#breakContinue')!;
  const breakLeaderNoteEl = root.querySelector<HTMLDivElement>('#breakLeaderNote')!;
  const tapHintEl = root.querySelector<HTMLDivElement>('#tapHint')!;
  const infoOverlayEl = root.querySelector<HTMLDivElement>('#infoOverlay')!;
  const infoTitleEl = root.querySelector<HTMLDivElement>('#infoTitle')!;
  const infoListEl = root.querySelector<HTMLDivElement>('#infoList')!;
  const infoCloseEl = root.querySelector<HTMLButtonElement>('#infoClose')!;
  const splitOverlayEl = root.querySelector<HTMLDivElement>('#splitOverlay')!;
  const splitTitleEl = root.querySelector<HTMLDivElement>('#splitTitle')!;
  const splitListEl = root.querySelector<HTMLDivElement>('#splitList')!;
  const splitCloseEl = root.querySelector<HTMLButtonElement>('#splitClose')!;
  const repCelebrationOverlayEl = root.querySelector<HTMLDivElement>('#repCelebrationOverlay')!;
  const repCelebrationNumberEl = root.querySelector<HTMLDivElement>('#repCelebrationNumber')!;
  const repCelebrationSplitEl = root.querySelector<HTMLDivElement>('#repCelebrationSplit')!;
  const finishOverlayEl = root.querySelector<HTMLDivElement>('#finishOverlay')!;
  const finishTimeEl = root.querySelector<HTMLDivElement>('#finishTime')!;
  const finishRepsEl = root.querySelector<HTMLDivElement>('#finishReps')!;
  const finishSplitsListEl = root.querySelector<HTMLDivElement>('#finishSplitsList')!;
  const finishDoneEl = root.querySelector<HTMLButtonElement>('#finishDone')!;
  const headerSoundEl = root.querySelector<HTMLButtonElement>('#runHeaderSound')!;
  const headerShareEl = root.querySelector<HTMLButtonElement>('#runHeaderShare')!;
  const headerEditEl = root.querySelector<HTMLButtonElement>('#runHeaderEdit')!;

  // Set up header with cleanup callback
  setupAppHeader(root, {
    backTarget: '/',
    onBeforeBack: () => {
      stopLoops();
      if (ws) ws.close();
      return true;
    },
  });

  // Ensure we close the WebSocket promptly when navigating away from the run route.
  // Without this, the Durable Object will keep counting the connection as "online"
  // until the browser eventually closes the socket.
  const cleanupLiveConnection = () => {
    stopLoops();
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };

  let definitionId: string | null = null;

  const soundSvgOn = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
      <path d="M19 6a8.5 8.5 0 0 1 0 12"></path>
    </svg>
  `;
  const soundSvgOff = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    </svg>
  `;
  const updateSoundButton = () => {
    const on = sounds.isEnabled();
    headerSoundEl.setAttribute('aria-pressed', on ? 'true' : 'false');
    headerSoundEl.setAttribute('aria-label', on ? 'Mute sounds' : 'Unmute sounds');
    headerSoundEl.title = on ? 'Mute' : 'Unmute';
    headerSoundEl.innerHTML = on ? soundSvgOn : soundSvgOff;
  };
  updateSoundButton();

  headerSoundEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = sounds.toggleEnabled();
    if (on) initSounds();
    updateSoundButton();
  });

  headerShareEl.addEventListener('click', (e) => {
    e.stopPropagation();
    void shareRunLink();
  });

  headerEditEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!definitionId) return;
    cleanupLiveConnection();
    navigate(`/w/${encodeURIComponent(definitionId)}/edit`);
  });

  const onPopState = () => {
    const route = getRoute();
    if (route.name !== 'run' || route.runId !== runId) {
      cleanupLiveConnection();
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pagehide', onPageHide);
    }
  };

  const onPageHide = () => {
    cleanupLiveConnection();
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('pagehide', onPageHide);
  };

  window.addEventListener('popstate', onPopState);
  window.addEventListener('pagehide', onPageHide);

  const closeInfoOverlay = () => infoOverlayEl.classList.add('hidden');
  const toggleInfoOverlay = () => infoOverlayEl.classList.toggle('hidden');
  const closeSplitOverlay = () => splitOverlayEl.classList.add('hidden');
  const toggleSplitOverlay = () => splitOverlayEl.classList.toggle('hidden');

  infoCloseEl.addEventListener('click', (e) => {
    e.stopPropagation();
    closeInfoOverlay();
  });
  infoOverlayEl.addEventListener('click', (e) => {
    // Click outside card closes
    if (e.target === infoOverlayEl) closeInfoOverlay();
  });
  splitCloseEl.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSplitOverlay();
  });
  splitOverlayEl.addEventListener('click', (e) => {
    if (e.target === splitOverlayEl) closeSplitOverlay();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInfoOverlay();
    if (e.key === 'Escape') closeSplitOverlay();
  });

  const renderDisplayNodes = (nodes: DisplayNode[], parent: HTMLElement): void => {
    for (const node of nodes) {
      const li = document.createElement('li');
      li.className = 'RunInfoItem';
      li.textContent = node.label;
      parent.appendChild(li);
      if (node.children?.length) {
        const nested = document.createElement('ul');
        nested.className = 'List';
        li.appendChild(nested);
        renderDisplayNodes(node.children, nested);
      }
    }
  };

  // Event delegation for info and pause buttons near timer
  timerEl.addEventListener('click', (e) => {
    initSounds();
    const target = e.target as HTMLElement;
    const infoBtn = target.closest<HTMLButtonElement>('[data-action="toggle-info"]');
    if (infoBtn) {
      e.stopPropagation();
      toggleInfoOverlay();
      return;
    }
    const splitBtn = target.closest<HTMLButtonElement>('[data-action="toggle-splits"]');
    if (splitBtn) {
      e.stopPropagation();
      toggleSplitOverlay();
      return;
    }
    const pauseBtn = target.closest<HTMLButtonElement>('#pause');
    if (pauseBtn) {
      e.stopPropagation();
      void doPauseResume();
      return;
    }
    const stopBtn = target.closest<HTMLButtonElement>('[data-action="stop"]');
    if (stopBtn) {
      e.stopPropagation();
      void doStop();
      return;
    }
    const resetBtn = target.closest<HTMLButtonElement>('[data-action="reset"]');
    if (resetBtn) {
      e.stopPropagation();
      void doReset();
      return;
    }
  });

  const snapshotKey = `wodbrains.run.${runId}.snapshot`;
  const pendingKey = `wodbrains.run.${runId}.pendingEvents`;
  const localSplitsKey = `wodbrains.run.${runId}.localSplits`;

  const tickMs = 100;
  const maxCatchupTicks = 100;
  const maxCorrectionPerTickMs = 20;
  const countdownMs = 10_000;
  const goFlashMs = 800;

  let serverPerfOffsetMs: number | null = null;
  let simNowMonoMs = 0;
  let simAccumulatorMs = 0;
  let lastPerfMs = performance.now();

  let timeScale = 1;
  let onlineCount = 1;
  let canControl = false;
  let timerPlan: TimerPlan | null = null;
  let events: RunEvent[] = [];

  // simulation snapshot at 10Hz
  let simDerived = deriveRunState(
    {
      id: 'unknown',
      schemaVersion: LATEST_DATA_VERSION,
      root: {
        type: 'sequence',
        blockId: 'root',
        segments: [{ type: 'timer', blockId: 'timer', mode: 'countup' }],
      },
    } as TimerPlan,
    [],
    0,
    { timeScale: 1 },
  );

  let rafId = 0;
  let ws: WebSocket | null = null;
  let autostarted = false;
  // Keep interactive UI stable by only re-rendering when needed.
  let lastCountersRenderKey = '';
  let lastInfoRenderKey = '';
  let lastSplitRenderKey = '';
  let lastMetaTitle = '';
  let lastHeaderTitle = '';
  let lastStatus = simDerived.status;
  let lastCornerRenderKey = '';
  let lastCountdownLabel = '';
  let lastBreakRenderKey = '';
  let breakWasVisible = false;
  let soundEdgesReady = false;
  let lastSegmentBlockIdForSound: string | undefined = undefined;

  type LocalSplit = { id: string; atMs: number; elapsedMs: number; label?: string };
  const loadLocalSplits = (): LocalSplit[] => {
    try {
      const raw = localStorage.getItem(localSplitsKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as LocalSplit[]) : [];
    } catch {
      return [];
    }
  };
  const saveLocalSplits = (splits: LocalSplit[]) => {
    try {
      localStorage.setItem(localSplitsKey, JSON.stringify(splits));
    } catch {
      // ignore
    }
  };
  const localSplits: LocalSplit[] = loadLocalSplits();

  const setStatus = (msg: string, tone: 'muted' | 'error' | 'ok' = 'muted') => {
    statusEl.textContent = msg;
    statusEl.dataset.tone = tone;
  };

  const estimateServerNowMonoMs = (perfNow = performance.now()) => {
    if (serverPerfOffsetMs == null) return simNowMonoMs;
    return perfNow + serverPerfOffsetMs;
  };

  const getEventNowMs = () => Math.round(estimateServerNowMonoMs());

  let tapHintTimeoutId = 0;

  // Show tap hint temporarily then fade out
  const showTapHintTemporarily = () => {
    if (tapHintTimeoutId) clearTimeout(tapHintTimeoutId);
    tapHintEl.classList.add('visible');
    tapHintTimeoutId = window.setTimeout(() => {
      tapHintEl.classList.remove('visible');
      tapHintTimeoutId = 0;
    }, 4000);
  };

  // Rep celebration overlay timeout
  let repCelebrationTimeoutId = 0;

  // Track if we've already shown the finish summary for this run
  let finishSummaryShown = false;

  // Show the finish summary overlay with workout results
  const showFinishSummary = () => {
    haptics.celebration();
    sounds.play('finish');
    const displaySplits = getDisplaySplits();
    const totalTime = simDerived.activeElapsedMs;

    // Populate stats
    finishTimeEl.textContent = formatTimeMs(totalTime, { showTenths: true });
    finishRepsEl.textContent = String(displaySplits.length);

    // Populate splits list
    finishSplitsListEl.innerHTML = '';
    if (displaySplits.length > 0) {
      displaySplits.forEach((split, index) => {
        const row = document.createElement('div');
        row.className = 'RunFinishSplitRow';
        row.setAttribute('role', 'listitem');

        const left = document.createElement('div');
        left.className = 'RunFinishSplitIndex';
        left.textContent = `#${index + 1}`;

        const right = document.createElement('div');
        right.className = 'RunFinishSplitTimes';

        const elapsed = document.createElement('div');
        elapsed.className = 'RunFinishSplitElapsed';
        elapsed.textContent = formatTimeMs(split.elapsedMs, { showTenths: true });

        const delta = document.createElement('div');
        delta.className = 'RunFinishSplitDelta';
        delta.textContent = `+${formatTimeMs(split.deltaMs, { showTenths: true })}`;

        right.appendChild(elapsed);
        right.appendChild(delta);
        row.appendChild(left);
        row.appendChild(right);
        finishSplitsListEl.appendChild(row);
      });
    }

    finishOverlayEl.classList.remove('hidden');
    finishSummaryShown = true;
  };

  const closeFinishSummary = () => {
    finishOverlayEl.classList.add('hidden');
  };

  // Done button navigates back
  finishDoneEl.addEventListener('click', () => {
    closeFinishSummary();
    stopLoops();
    if (ws) ws.close();
    navigate('/');
  });

  // Show big animated rep celebration when a rep is counted
  const showRepCelebration = (repNumber: number, splitDeltaMs: number) => {
    // Clear any existing timeout
    if (repCelebrationTimeoutId) clearTimeout(repCelebrationTimeoutId);

    // Set content
    repCelebrationNumberEl.textContent = String(repNumber);
    repCelebrationSplitEl.textContent = `+${formatTimeMs(splitDeltaMs, { showTenths: true })}`;

    // Reset animation by removing and re-adding active class
    repCelebrationOverlayEl.classList.remove('active');
    void repCelebrationOverlayEl.offsetWidth; // Force reflow
    repCelebrationOverlayEl.classList.add('active');

    // Auto-hide after 2.5 seconds
    repCelebrationTimeoutId = window.setTimeout(() => {
      repCelebrationOverlayEl.classList.remove('active');
      repCelebrationTimeoutId = 0;
    }, 2500);
  };

  const scheduleStart = async () => {
    if (!timerPlan) return;
    if (!canControl) {
      setStatus('Participant mode (view-only)', 'muted');
      return;
    }
    if (simDerived.startedAtMs) return;
    const startAt = getEventNowMs() + countdownMs;
    await sendEvent({ type: 'start', atMs: startAt });
  };

  const shareRunLink = async () => {
    const url = new URL(`/r/${encodeURIComponent(runId)}`, window.location.origin).toString();
    const title = timerPlan?.title?.trim() ? `WOD Brains · ${timerPlan.title}` : 'WOD Brains';
    const text =
      "Workout at the same time with friends. You're invited to join my workout live on WOD Brains.";
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
      showToast('Copy the run link from the address bar.', 'muted', { timeoutMs: 1800 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
    }
  };

  startShareBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void shareRunLink();
  });

  breakContinueEl.addEventListener('click', (e) => {
    e.stopPropagation();
    initSounds();
    void advanceSegment();
  });

  // Update UI based on current status (idle/running/paused/finished)
  const updateUIForStatus = () => {
    const status = simDerived.status;
    const hasScheduledStart = !!simDerived.startedAtMs;

    // Toggle running class on shell for footer fade
    if (status === 'running') {
      runShellEl.classList.add('running');
    } else {
      runShellEl.classList.remove('running');
    }

    // Show/hide header based on running status
    setAppHeaderVisible(root, status !== 'running');

    const showHeaderActions = status === 'paused';
    headerShareEl.classList.toggle('RunHeaderAction--hidden', !showHeaderActions);
    headerEditEl.classList.toggle(
      'RunHeaderAction--hidden',
      !(showHeaderActions && canControl && !!definitionId),
    );

    // Show/hide start overlay based on idle status and schedule state
    if (status === 'idle' && !hasScheduledStart && canControl) {
      startOverlayEl.classList.remove('hidden');
    } else {
      startOverlayEl.classList.add('hidden');
    }

    // Show finish summary when timer completes
    if (status === 'finished' && !finishSummaryShown) {
      showFinishSummary();
    }
  };

  const saveSnapshot = (s: RunSnapshot) => {
    try {
      localStorage.setItem(snapshotKey, JSON.stringify(s));
    } catch {
      // ignore
    }
  };

  const loadCachedSnapshot = (): RunSnapshot | null => {
    try {
      const raw = localStorage.getItem(snapshotKey);
      if (!raw) return null;
      return JSON.parse(raw) as RunSnapshot;
    } catch {
      return null;
    }
  };

  const loadPendingEvents = (): Record<string, unknown>[] => {
    try {
      const raw = localStorage.getItem(pendingKey);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  };

  const savePendingEvents = (arr: Record<string, unknown>[]) => {
    try {
      localStorage.setItem(pendingKey, JSON.stringify(arr));
    } catch {
      // ignore
    }
  };

  const applySnapshot = (s: RunSnapshot) => {
    timerPlan = s.timerPlan;
    events = s.events ?? [];
    // NOTE: WebSocket snapshots come directly from the Durable Object and do not include
    // `definitionId`. Only the initial HTTP snapshot does (via worker DB lookup). So we
    // must not clobber our cached `definitionId` when it is omitted.
    if (s.definitionId !== undefined) {
      definitionId = typeof s.definitionId === 'string' ? s.definitionId : null;
    }
    if (typeof s.timeScale === 'number' && Number.isFinite(s.timeScale) && s.timeScale > 0) {
      timeScale = s.timeScale;
    } else {
      timeScale = 1;
    }
    if (typeof s.onlineCount === 'number' && Number.isFinite(s.onlineCount)) {
      onlineCount = Math.max(1, Math.floor(s.onlineCount));
    }
    if (typeof s.serverNowMonoMs === 'number' && Number.isFinite(s.serverNowMonoMs)) {
      const perfNow = performance.now();
      serverPerfOffsetMs = updateMonotonicOffset(
        serverPerfOffsetMs,
        { serverNowMonoMs: s.serverNowMonoMs, clientPerfNowMs: perfNow },
        0.2,
      );
      if (!Number.isFinite(simNowMonoMs) || simNowMonoMs <= 0) {
        simNowMonoMs = s.serverNowMonoMs;
        simAccumulatorMs = 0;
        lastPerfMs = perfNow;
      }
    }
    saveSnapshot(s);

    if (timerPlan) {
      const nowMonoMs = simNowMonoMs || s.serverNowMonoMs || 0;
      simDerived = deriveRunState(timerPlan, events, nowMonoMs, { timeScale });
    }

    const planTitle = timerPlan?.title?.trim();
    const metaTitle = planTitle ? formatSiteTitle(planTitle) : formatSiteTitle('Workout Run');
    if (metaTitle !== lastMetaTitle) {
      lastMetaTitle = metaTitle;
      updateMeta({
        title: metaTitle,
        description: planTitle
          ? `Live run for ${planTitle} on WOD Brains.`
          : 'Live workout timer session on WOD Brains.',
        url: new URL(`/r/${encodeURIComponent(runId)}`, window.location.origin).toString(),
      });
    }

    const headerTitle = planTitle || 'Workout Run';
    if (headerTitle !== lastHeaderTitle) {
      lastHeaderTitle = headerTitle;
      setAppHeaderTitle(root, headerTitle);
    }
  };

  const refreshSimDerived = () => {
    if (!timerPlan) return;
    simDerived = deriveRunState(timerPlan, events, simNowMonoMs, { timeScale });
  };

  const getActiveElapsedMsNow = () => {
    const interpBaseMs = Math.min(simAccumulatorMs, tickMs);
    return simDerived.status === 'running'
      ? simDerived.activeElapsedMs + interpBaseMs * timeScale
      : simDerived.activeElapsedMs;
  };

  const getDisplaySplits = () => {
    const serverSplits = canControl ? (simDerived.splits ?? []) : [];
    const merged = new Map<
      string,
      { id: string; atMs: number; elapsedMs: number; label?: string }
    >();
    for (const split of serverSplits) {
      merged.set(`${split.atMs}:${split.label ?? ''}`, split);
    }
    for (const split of localSplits) {
      const key = `${split.atMs}:${split.label ?? ''}`;
      if (!merged.has(key)) merged.set(key, split);
    }
    const sorted = [...merged.values()].sort((a, b) => a.atMs - b.atMs);
    return sorted.map((split, index) => {
      const prevElapsedMs = index > 0 ? sorted[index - 1]!.elapsedMs : 0;
      return {
        ...split,
        deltaMs: Math.max(0, split.elapsedMs - prevElapsedMs),
      };
    });
  };

  const updateCountdownOverlay = () => {
    const startAtMs = simDerived.startedAtMs;
    if (!startAtMs) {
      countdownOverlayEl.classList.remove('active');
      lastCountdownLabel = '';
      return;
    }
    const nowMonoMs = simNowMonoMs + Math.min(simAccumulatorMs, tickMs);
    const remainingMs = startAtMs - nowMonoMs;
    let label = '';
    let prepMode = false;
    if (remainingMs > 0) {
      const seconds = Math.ceil(remainingMs / 1000);
      label = String(Math.max(1, seconds));
      prepMode = remainingMs > 3000;
    } else if (remainingMs > -goFlashMs) {
      label = 'GO';
    }

    if (!label) {
      countdownOverlayEl.classList.remove('active');
      lastCountdownLabel = '';
      return;
    }

    countdownOverlayEl.classList.add('active');
    countdownNumberEl.textContent = label;
    countdownNumberEl.classList.toggle('prep', prepMode);
    if (label !== lastCountdownLabel) {
      countdownNumberEl.classList.remove('animate');
      void countdownNumberEl.offsetWidth;
      countdownNumberEl.classList.add('animate');
      if (label === 'GO') {
        haptics.heavy();
        sounds.play('countdown_go');
      } else {
        haptics.tick();
        if (label === '3' || label === '2' || label === '1') {
          sounds.play('countdown_tick');
        }
      }
      lastCountdownLabel = label;
    }
  };

  const updateCornerInfo = () => {
    const roleLabel = canControl ? 'Leader' : 'Participant';
    const showMultiplayer = onlineCount > 1;
    const line = showMultiplayer
      ? `${roleLabel} · ${onlineCount} online`
      : canControl
        ? ''
        : 'Participant';
    const showScale = timeScale !== 1;
    const scaleLabel = `x ${timeScale}`;
    const key = `${line}|scale:${showScale ? scaleLabel : 'none'}`;
    if (key === lastCornerRenderKey) return;
    lastCornerRenderKey = key;

    if (!line && !showScale) {
      cornerInfoEl.classList.add('hidden');
    } else {
      cornerInfoEl.classList.remove('hidden');
    }

    cornerLineEl.textContent = line;
    if (showScale) {
      cornerScaleEl.classList.remove('hidden');
      cornerScaleEl.textContent = scaleLabel;
    } else {
      cornerScaleEl.classList.add('hidden');
    }
  };

  const startLoops = () => {
    stopLoops();
    lastPerfMs = performance.now();

    const render = () => {
      rafId = window.requestAnimationFrame(render);
      if (!timerPlan) return;

      const perfNow = performance.now();
      const dt = perfNow - lastPerfMs;
      lastPerfMs = perfNow;

      const targetNowMs = estimateServerNowMonoMs(perfNow);
      const result = advanceFixedStep(
        { simNowMs: simNowMonoMs, accumulatorMs: simAccumulatorMs },
        dt,
        targetNowMs,
        { tickMs, maxCatchupTicks, maxCorrectionPerTickMs },
      );
      simNowMonoMs = result.state.simNowMs;
      simAccumulatorMs = result.state.accumulatorMs;
      if (result.ticks > 0) {
        simDerived = deriveRunState(timerPlan, events, simNowMonoMs, { timeScale });
      }

      const running = simDerived.status === 'running';
      const interpBaseMs = Math.min(simAccumulatorMs, tickMs);
      const interpMs = running ? interpBaseMs * timeScale : 0;

      let displayMs = simDerived.display.elapsedMs;
      const segment = simDerived.segment;

      if (segment?.mode === 'countdown') {
        const baseRemaining = segment.remainingMs ?? 0;
        displayMs = running ? Math.max(0, baseRemaining - interpMs) : baseRemaining;
      } else if (segment?.mode === 'countup') {
        const baseElapsed = segment.elapsedMs ?? 0;
        displayMs = running ? baseElapsed + interpMs : baseElapsed;
      } else if (segment?.mode === 'manual') {
        displayMs = running
          ? simDerived.display.elapsedMs + interpMs
          : simDerived.display.elapsedMs;
      } else if (running) {
        displayMs = simDerived.display.elapsedMs + interpMs;
      }

      timerValueEl.textContent = formatTimeMs(displayMs, { showTenths: true });

      // Sound cues (edge-triggered): segment transitions + pause/resume.
      if (soundEdgesReady) {
        const segId = segment?.blockId;
        if (segId !== lastSegmentBlockIdForSound) {
          if (segId) {
            const label = segment?.label?.trim() ?? '';
            const isBreakSound = segment?.type === 'timer' && label.toLowerCase().includes('break');
            sounds.play(isBreakSound ? 'segment_break' : 'segment_work');
          }
          lastSegmentBlockIdForSound = segId;
        }
      } else {
        lastSegmentBlockIdForSound = segment?.blockId;
      }

      // Counters (round/interval/etc) — only re-render when values change,
      // otherwise buttons become unclickable due to DOM churn.
      const displaySplits = getDisplaySplits();
      const repCount = displaySplits.length;
      const latestSplit = displaySplits[displaySplits.length - 1];
      const counterList = (simDerived.counters ?? []).filter((counter) => {
        if (counter.target == null) return true;
        return typeof counter.target === 'number' && counter.target > 1;
      });
      const countersKey = counterList
        .map((c) => `${c.blockId ?? ''}:${c.label}:${c.current}:${c.target ?? ''}`)
        .join('|');
      const status = simDerived.status;
      const controlsDisabled = !canControl;
      const shouldShowRoundCounters = !!(simDerived.isAutoAdvancing && counterList.length > 0);
      const shouldShowInfoButton = !!(timerPlan && shouldShowRoundCounters);
      const shouldShowRepTop = !shouldShowRoundCounters && repCount > 0;
      const shouldShowRepBottom = shouldShowRoundCounters && repCount > 0;
      const splitKey = latestSplit
        ? `${latestSplit.atMs}:${latestSplit.elapsedMs}:${latestSplit.deltaMs}`
        : '';
      const countersRenderKey = `${countersKey}|round:${shouldShowRoundCounters ? 'yes' : 'no'}|repTop:${shouldShowRepTop ? 'yes' : 'no'}|repBottom:${shouldShowRepBottom ? 'yes' : 'no'}|rep:${repCount}|split:${splitKey}|info:${shouldShowInfoButton ? 'yes' : 'no'}|status:${status}`;
      if (countersRenderKey !== lastCountersRenderKey) {
        lastCountersRenderKey = countersRenderKey;
        // --- Top meta: counters + superscript info ---
        timerMetaTopEl.innerHTML = '';
        if (shouldShowRoundCounters) {
          const labelText = counterList
            .map((counter) =>
              counter.target == null
                ? `${counter.current}`
                : `${counter.current}/${counter.target}`,
            )
            .join(' · ');

          const line = document.createElement('div');
          line.className = 'TimerMetaLine';

          const textEl = document.createElement('span');
          textEl.className = 'TimerMetaText';
          textEl.textContent = labelText;
          line.appendChild(textEl);

          if (shouldShowInfoButton) {
            const infoBtn = document.createElement('button');
            infoBtn.type = 'button';
            infoBtn.className = 'TimerInfoBtn TimerInfoBtn--sup';
            infoBtn.dataset.action = 'toggle-info';
            infoBtn.title = 'Info';
            infoBtn.setAttribute('aria-label', 'Show workout plan');
            infoBtn.innerHTML = `
              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            `;
            line.appendChild(infoBtn);
          }

          timerMetaTopEl.appendChild(line);
        } else if (shouldShowRepTop) {
          // Show rep counter when rounds aren't displayed.
          const line = document.createElement('div');
          line.className = 'TimerMetaLine';

          const textEl = document.createElement('span');
          textEl.className = 'TimerMetaText TimerRepCount';
          textEl.textContent = `${repCount}`;
          textEl.dataset.testid = 'rep-counter';
          line.appendChild(textEl);

          // Add split time next to rep counter to save vertical space
          if (latestSplit) {
            const splitBtn = document.createElement('button');
            splitBtn.type = 'button';
            splitBtn.className = 'TimerSplitBtn TimerSplitBtn--inline';
            splitBtn.dataset.action = 'toggle-splits';
            splitBtn.dataset.testid = 'split-time';
            splitBtn.setAttribute('aria-label', 'Show split times');
            splitBtn.textContent = `+${formatTimeMs(latestSplit.deltaMs, { showTenths: true })}`;
            line.appendChild(splitBtn);
          }

          timerMetaTopEl.appendChild(line);
        }

        // --- Bottom meta: large pause/resume ---
        timerMetaBottomEl.innerHTML = '';
        const metaStack = document.createElement('div');
        metaStack.className = 'TimerMetaStack';

        // Only show split time in bottom meta when rep counter is NOT in top meta
        // (i.e., when we have round counters and rep is shown at bottom as "Rep X")
        if (latestSplit && !shouldShowRepTop) {
          const splitBtn = document.createElement('button');
          splitBtn.type = 'button';
          splitBtn.className = 'TimerSplitBtn';
          splitBtn.dataset.action = 'toggle-splits';
          splitBtn.dataset.testid = 'split-time';
          splitBtn.setAttribute('aria-label', 'Show split times');
          splitBtn.textContent = `+${formatTimeMs(latestSplit.deltaMs, { showTenths: true })}`;
          metaStack.appendChild(splitBtn);
        }

        if (shouldShowRepBottom) {
          const repEl = document.createElement('div');
          repEl.className = 'TimerRepPill';
          repEl.dataset.testid = 'rep-counter';
          repEl.textContent = `Rep ${repCount}`;
          metaStack.appendChild(repEl);
        }

        if (!canControl && (status === 'paused' || status === 'finished')) {
          const note = document.createElement('div');
          note.className = 'TimerLeaderNote';
          note.dataset.testid = 'leader-note';
          note.textContent = status === 'paused' ? 'Paused by the Leader' : 'Ended by the Leader';
          metaStack.appendChild(note);
        }

        // When paused, show a row of control buttons: Reset, Resume, Stop
        if (status === 'paused' && canControl) {
          const btnRow = document.createElement('div');
          btnRow.className = 'TimerControlRow';

          // Reset button
          const resetBtn = document.createElement('button');
          resetBtn.type = 'button';
          resetBtn.className = 'TimerControlBtn TimerControlBtn--reset';
          resetBtn.dataset.action = 'reset';
          resetBtn.title = 'Reset';
          resetBtn.setAttribute('aria-label', 'Reset workout');
          resetBtn.disabled = controlsDisabled;
          resetBtn.innerHTML = `
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          `;
          btnRow.appendChild(resetBtn);

          // Resume button (play)
          const resumeBtn = document.createElement('button');
          resumeBtn.type = 'button';
          resumeBtn.className = 'TimerControlBtn TimerControlBtn--resume';
          resumeBtn.id = 'pause';
          resumeBtn.title = 'Resume';
          resumeBtn.setAttribute('aria-label', 'Resume');
          resumeBtn.disabled = controlsDisabled;
          resumeBtn.innerHTML = `
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="5 4 19 12 5 20 5 4"/>
            </svg>
          `;
          btnRow.appendChild(resumeBtn);

          // Stop button
          const stopBtn = document.createElement('button');
          stopBtn.type = 'button';
          stopBtn.className = 'TimerControlBtn TimerControlBtn--stop';
          stopBtn.dataset.action = 'stop';
          stopBtn.title = 'Stop';
          stopBtn.setAttribute('aria-label', 'Stop workout');
          stopBtn.disabled = controlsDisabled;
          stopBtn.innerHTML = `
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
          `;
          btnRow.appendChild(stopBtn);

          metaStack.appendChild(btnRow);
        } else if (canControl) {
          // Normal pause/finished button
          const pauseBtn = document.createElement('button');
          pauseBtn.type = 'button';
          pauseBtn.className = status === 'finished' ? 'TimerPauseBtn' : 'TimerPauseBtn';
          pauseBtn.id = 'pause';
          pauseBtn.title = status === 'finished' ? 'Done' : 'Pause';
          pauseBtn.setAttribute('aria-label', status === 'finished' ? 'Done' : 'Pause');
          pauseBtn.disabled = controlsDisabled || status === 'finished' || status === 'idle';

          const pauseIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          pauseIcon.setAttribute('width', '1em');
          pauseIcon.setAttribute('height', '1em');
          pauseIcon.setAttribute('viewBox', '0 0 24 24');
          pauseIcon.setAttribute('fill', 'none');
          pauseIcon.setAttribute('stroke', 'currentColor');
          pauseIcon.setAttribute('stroke-width', '2.5');
          pauseIcon.setAttribute('stroke-linecap', 'round');
          pauseIcon.setAttribute('stroke-linejoin', 'round');
          pauseIcon.setAttribute('aria-hidden', 'true');

          if (status === 'finished') {
            const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            checkPath.setAttribute('points', '20 6 9 17 4 12');
            pauseIcon.appendChild(checkPath);
          } else {
            const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect1.setAttribute('x', '6');
            rect1.setAttribute('y', '4');
            rect1.setAttribute('width', '4');
            rect1.setAttribute('height', '16');
            const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect2.setAttribute('x', '14');
            rect2.setAttribute('y', '4');
            rect2.setAttribute('width', '4');
            rect2.setAttribute('height', '16');
            pauseIcon.appendChild(rect1);
            pauseIcon.appendChild(rect2);
          }

          pauseBtn.appendChild(pauseIcon);
          metaStack.appendChild(pauseBtn);
        }

        timerMetaBottomEl.appendChild(metaStack);
      }

      // Update info overlay content when visible
      if (!infoOverlayEl.classList.contains('hidden')) {
        const planKey = timerPlan ? `${timerPlan.id}:${timerPlan.schemaVersion}` : '';
        const infoRenderKey = `${planKey}`;
        if (infoRenderKey !== lastInfoRenderKey) {
          lastInfoRenderKey = infoRenderKey;

          // Use timer plan title or fallback
          const title = timerPlan?.title ?? 'Workout Plan';
          infoTitleEl.textContent = title;

          infoListEl.innerHTML = '';
          if (timerPlan?.root) {
            const nodes = timerPlanSegmentsToDisplayNodes(
              timerPlan.root.segments as TimerPlanSegment[],
            );
            const ul = document.createElement('ul');
            ul.className = 'List';
            renderDisplayNodes(nodes, ul);
            if (ul.children.length === 0) {
              const itemEl = document.createElement('div');
              itemEl.className = 'RunInfoItem';
              itemEl.textContent = 'No steps.';
              infoListEl.appendChild(itemEl);
            } else {
              infoListEl.appendChild(ul);
            }
          } else {
            const itemEl = document.createElement('div');
            itemEl.className = 'RunInfoItem';
            itemEl.textContent = 'No workout plan available.';
            infoListEl.appendChild(itemEl);
          }
        }
      } else {
        // reset so next open re-renders
        lastInfoRenderKey = '';
      }

      // Update split overlay content when visible
      if (!splitOverlayEl.classList.contains('hidden')) {
        const splitKey = displaySplits.map((split) => `${split.atMs}:${split.elapsedMs}`).join('|');
        if (splitKey !== lastSplitRenderKey) {
          lastSplitRenderKey = splitKey;

          splitTitleEl.textContent = 'Splits';
          splitListEl.innerHTML = '';
          if (displaySplits.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'RunSplitEmpty';
            empty.textContent = 'No splits yet.';
            splitListEl.appendChild(empty);
          } else {
            displaySplits.forEach((split, index) => {
              const row = document.createElement('div');
              row.className = 'RunSplitRow';
              row.dataset.testid = 'split-item';
              row.setAttribute('role', 'listitem');

              const left = document.createElement('div');
              left.className = 'RunSplitIndex';
              left.textContent = `#${index + 1}`;

              const right = document.createElement('div');
              right.className = 'RunSplitTimes';

              const elapsed = document.createElement('div');
              elapsed.className = 'RunSplitElapsed';
              elapsed.textContent = formatTimeMs(split.elapsedMs, { showTenths: true });

              const delta = document.createElement('div');
              delta.className = 'RunSplitDelta';
              delta.textContent = `+${formatTimeMs(split.deltaMs, { showTenths: true })}`;

              right.appendChild(elapsed);
              right.appendChild(delta);
              row.appendChild(left);
              row.appendChild(right);
              splitListEl.appendChild(row);
            });
          }
        }
      } else {
        lastSplitRenderKey = '';
      }

      if (lastStatus !== simDerived.status) {
        if (simDerived.status === 'running') showTapHintTemporarily();
        if (lastStatus === 'running' && simDerived.status === 'paused') {
          sounds.play('pause');
        }
        if (lastStatus === 'paused' && simDerived.status === 'running') {
          sounds.play('resume');
        }
        lastStatus = simDerived.status;
      }

      updateCountdownOverlay();
      const breakLabel = segment?.label?.trim() || 'Break';
      const isBreak =
        segment?.type === 'timer' &&
        segment.mode === 'countup' &&
        breakLabel.toLowerCase().includes('break');
      const canAdvance = canControl && simDerived.status === 'running';
      const breakKey = `${isBreak ? 'break' : 'none'}|${breakLabel}|${canAdvance ? 'on' : 'off'}|${simDerived.status}`;
      if (breakKey !== lastBreakRenderKey) {
        lastBreakRenderKey = breakKey;
        breakOverlayEl.classList.toggle('hidden', !isBreak);
        breakOverlayEl.setAttribute('aria-hidden', isBreak ? 'false' : 'true');
        if (isBreak) {
          breakTitleEl.textContent = breakLabel || 'Break';
          breakContinueEl.disabled = !canAdvance;
          breakLeaderNoteEl.classList.toggle('hidden', canControl);
          if (!breakWasVisible && canAdvance) {
            breakContinueEl.focus();
          }
        }
        breakWasVisible = isBreak;
      }
      updateCornerInfo();
      updateUIForStatus();
      soundEdgesReady = true;
    };

    rafId = window.requestAnimationFrame(render);
  };

  const stopLoops = () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const connectWebSocket = () => {
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/api/runs/${encodeURIComponent(runId)}/ws`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type?: string; snapshot?: RunSnapshot };
          if (msg.type === 'snapshot' && msg.snapshot) {
            applySnapshot(msg.snapshot);
            refreshSimDerived();
            lastPerfMs = performance.now();
          }
        } catch {
          // ignore
        }
      };
      ws.onopen = () => setStatus('', 'muted');
      ws.onerror = () => setStatus('Live sync unavailable (offline?)', 'muted');
    } catch {
      // ignore
    }
  };

  const flushPending = async () => {
    if (!canControl) {
      savePendingEvents([]);
      return;
    }
    const pending = loadPendingEvents();
    if (pending.length === 0) return;
    setStatus('Reconnecting...', 'muted');
    const still: Record<string, unknown>[] = [];
    for (const ev of pending) {
      const withId =
        typeof ev.id === 'string' && ev.id
          ? ev
          : {
              id: createEventId(),
              ...ev,
            };
      try {
        const snap = await postRunEvent(runId, withId);
        applySnapshot(snap as RunSnapshot);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'view_only') {
          canControl = false;
          savePendingEvents([]);
          setStatus('Participant mode (view-only)', 'muted');
          return;
        }
        still.push(withId);
      }
    }
    savePendingEvents(still);
    setStatus(
      still.length === 0 ? '' : 'Offline: actions queued',
      still.length === 0 ? 'muted' : 'muted',
    );
  };

  const sendEvent = async (ev: Record<string, unknown>) => {
    if (!canControl) {
      setStatus('Participant mode (view-only)', 'muted');
      return;
    }
    const withId =
      typeof ev.id === 'string' && ev.id
        ? ev
        : {
            id: createEventId(),
            ...ev,
          };
    try {
      const snap = await postRunEvent(runId, withId);
      applySnapshot(snap as RunSnapshot);
      refreshSimDerived();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'view_only') {
        canControl = false;
        savePendingEvents([]);
        setStatus('Participant mode (view-only)', 'muted');
        return;
      }
      const pending = loadPendingEvents();
      pending.push(withId);
      savePendingEvents(pending);
      setStatus('Offline: action queued', 'muted');
    }
  };

  const advanceSegment = async () => {
    if (!timerPlan) return;
    if (!canControl) {
      setStatus('Participant mode (view-only)', 'muted');
      return;
    }
    const nowMs = getEventNowMs();
    haptics.medium();
    await sendEvent({ type: 'advance', atMs: nowMs });
  };

  const doPauseResume = async () => {
    if (!timerPlan) return;
    if (!canControl) {
      setStatus('Participant mode (view-only)', 'muted');
      return;
    }
    const nowMs = getEventNowMs();
    if (simDerived.status === 'paused') {
      haptics.medium();
      await sendEvent({ type: 'resume', atMs: nowMs });
    } else if (simDerived.status === 'running') {
      haptics.medium();
      await sendEvent({ type: 'pause', atMs: nowMs });
    }
  };

  // Stop the run (finish) and show summary
  const doStop = async () => {
    if (!timerPlan) return;
    if (!canControl) {
      setStatus('Participant mode (view-only)', 'muted');
      return;
    }
    const nowMs = getEventNowMs();
    await sendEvent({ type: 'finish', atMs: nowMs });
  };

  // Reset - create a new run from the same timer plan
  const doReset = async () => {
    if (!timerPlan) return;
    if (!canControl) {
      setStatus('Participant mode (view-only)', 'muted');
      return;
    }
    try {
      stopLoops();
      if (ws) ws.close();
      const { runId: newRunId } = await createRun(timerPlan);
      // Navigate to the new run (no autostart, user must tap to start)
      navigate(`/r/${encodeURIComponent(newRunId)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg, 'error');
    }
  };

  const recordSplit = async () => {
    if (!timerPlan) return;
    const nowMs = getEventNowMs();
    const existingSplits = getDisplaySplits();
    const nextIndex = existingSplits.length + 1;
    const label = `Rep ${nextIndex}`;

    // Compute elapsed/delta using the same logic as the server-derived run state.
    // This avoids client interpolation drift showing up as "+0:00.0" during celebration.
    const localId = `local-${nowMs}-${nextIndex}`;
    const derivedWithSplit = deriveRunState(
      timerPlan,
      [
        ...events,
        {
          id: localId,
          type: 'split',
          atMs: nowMs,
          label,
        } satisfies RunEvent,
      ],
      nowMs,
      { timeScale },
    );
    const derivedSplit = derivedWithSplit.splits?.[derivedWithSplit.splits.length - 1];
    const elapsedMs = derivedSplit?.elapsedMs ?? getActiveElapsedMsNow();
    const deltaMs = derivedSplit?.deltaMs ?? 0;

    localSplits.push({
      id: localId,
      atMs: nowMs,
      elapsedMs,
      label,
    });
    saveLocalSplits(localSplits);

    // Show the celebration animation
    haptics.medium();
    sounds.play('rep');
    showRepCelebration(nextIndex, deltaMs);

    if (canControl) {
      await sendEvent({ type: 'split', atMs: nowMs, label });
    }
  };

  tapSurfaceEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Avoid double-triggering when clicking buttons/inputs.
    if (target.closest('button, a, input, textarea')) return;
    initSounds();

    // Only count reps if timer is running
    if (simDerived.status === 'running') {
      void recordSplit();
    }
  });

  // Keyboard support for rep counting (Space or Enter)
  tapSurfaceEl.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      initSounds();
      if (simDerived.status === 'running') {
        void recordSplit();
      }
    }
  });

  // Start overlay click triggers countdown sequence
  startOverlayEl.addEventListener('click', () => {
    initSounds();
    if (simDerived.status === 'idle' && !simDerived.startedAtMs) {
      void scheduleStart();
    }
  });

  // Keyboard support for start overlay (Space or Enter)
  startOverlayEl.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      initSounds();
      if (simDerived.status === 'idle' && !simDerived.startedAtMs) {
        void scheduleStart();
      }
    }
  });

  window.addEventListener('online', () => {
    void flushPending();
  });

  // --- Load initial state ---
  setStatus('Loading...', 'muted');
  await ensureAnonymousSession();

  try {
    const [s, access] = await Promise.all([
      getRunSnapshot(runId) as Promise<RunSnapshot>,
      getRunAccess(runId),
    ]);
    canControl = !!access?.canControl;
    applySnapshot(s);
    refreshSimDerived();
    updateUIForStatus();
    startLoops();
    connectWebSocket();
    void flushPending();
    setStatus('', 'muted');

    if (
      requestedTimeScale != null &&
      canControl &&
      !simDerived.startedAtMs &&
      requestedTimeScale !== timeScale
    ) {
      try {
        const snap = await updateRunSettings(runId, { timeScale: requestedTimeScale });
        applySnapshot(snap as RunSnapshot);
        refreshSimDerived();
      } catch {
        // ignore
      }
    }

    if (
      autostart &&
      !autostarted &&
      canControl &&
      simDerived.status === 'idle' &&
      !simDerived.startedAtMs
    ) {
      autostarted = true;
      void scheduleStart();
    }
  } catch (e) {
    const cached = loadCachedSnapshot();
    if (cached) {
      applySnapshot(cached);
      canControl = false;
      refreshSimDerived();
      updateUIForStatus();
      startLoops();
      connectWebSocket();
      setStatus('Offline: showing last saved state', 'muted');
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg, 'error');
    }
  }
}

import {
  ApiError,
  createDefinition,
  ensureAnonymousSession,
  listDefinitions,
  parseWorkout,
  submitParseFeedback,
  type DefinitionListItem,
} from '../api';
import { navigate } from '../router';
import { appHeader, setupAppHeader } from '../components/header';
import { updateMeta } from '../meta';
import { haptics, startRumble, stopRumble } from '../utils/haptics';
import { showToast } from '../components/toast';

export function renderImportPage(root: HTMLElement) {
  updateMeta({ url: new URL('/', window.location.origin).toString() });

  root.innerHTML = `
    <div class="ImportShell ImportShell--home">
      ${appHeader()}
      <main class="PageContent ImportContent" id="main-content">
        <div class="UnifiedInput" id="dropZone">
          <textarea
            class="UnifiedTextarea"
            id="input"
            placeholder="Paste a URL, drop an image, or paste your workout text..."
            aria-label="Enter workout URL, text, or drop an image"
            rows="4"
          ></textarea>
          <input type="file" id="fileInput" accept="image/*" hidden aria-hidden="true" />
          <button type="button" class="FileButton" id="fileBtn" aria-label="Choose image file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <div class="DropOverlay" id="dropOverlay" aria-hidden="true">
            <span>Drop image here</span>
          </div>
        </div>

        <div class="FileIndicator" id="fileIndicator" aria-live="polite"></div>

        <button class="PrimaryBtn ImportBtn IconBtn CtaBtn" id="generate">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
            <path d="M20 3v4"/>
            <path d="M22 5h-4"/>
          </svg>
          Generate timer
        </button>
        <div class="Status" id="status" role="status" aria-live="polite"></div>

        <div id="recentSection" style="display:none; width:100%">
          <div class="RecentList" id="recentList" role="list" aria-label="Recent workouts"></div>
          <div style="text-align:right; margin-top:8px">
            <a href="/workouts" id="recentMore" style="color:var(--text-muted); font-size:12px; text-decoration:none" aria-label="View all workouts">···</a>
          </div>
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

      <div class="GenerateOverlay hidden" id="generateOverlay" role="alert" aria-live="assertive">
        <div class="GenerateOverlayContent">
          <img src="/logo.svg" alt="" class="GenerateLogo" aria-hidden="true" />
          <p class="GenerateText">Generating your timer...</p>
        </div>
        <div class="SparkleContainer" id="sparkleContainer" aria-hidden="true"></div>
      </div>
    </div>
  `;

  setupAppHeader(root);

  const dropZoneEl = root.querySelector<HTMLDivElement>('#dropZone')!;
  const inputEl = root.querySelector<HTMLTextAreaElement>('#input')!;
  const fileInputEl = root.querySelector<HTMLInputElement>('#fileInput')!;
  const fileBtnEl = root.querySelector<HTMLButtonElement>('#fileBtn')!;
  const fileIndicatorEl = root.querySelector<HTMLDivElement>('#fileIndicator')!;
  const generateEl = root.querySelector<HTMLButtonElement>('#generate')!;
  const statusEl = root.querySelector<HTMLDivElement>('#status')!;

  const recentSectionEl = root.querySelector<HTMLDivElement>('#recentSection')!;
  const recentListEl = root.querySelector<HTMLDivElement>('#recentList')!;
  const recentMoreEl = root.querySelector<HTMLAnchorElement>('#recentMore')!;
  const generateOverlayEl = root.querySelector<HTMLDivElement>('#generateOverlay')!;
  const sparkleContainerEl = root.querySelector<HTMLDivElement>('#sparkleContainer')!;

  let selectedFile: File | null = null;
  let selectedImageUrl: string | null = null;
  let sparkleIntervalId: ReturnType<typeof setInterval> | null = null;
  let lastParseError: { parseId: string; category: string } | null = null;

  // Sparkle generation
  const createSparkle = () => {
    const sparkle = document.createElement('span');
    sparkle.className = 'Sparkle';

    // Random size variant
    const sizeRoll = Math.random();
    if (sizeRoll < 0.3) sparkle.classList.add('Sparkle--small');
    else if (sizeRoll > 0.8) sparkle.classList.add('Sparkle--large');

    // Some sparkles are white instead of pink
    if (Math.random() > 0.6) sparkle.classList.add('Sparkle--white');

    // Random position across the screen
    sparkle.style.left = `${Math.random() * 100}%`;
    sparkle.style.top = `${Math.random() * 100}%`;

    // Slight random animation duration variation
    sparkle.style.animationDuration = `${1.2 + Math.random() * 0.8}s`;

    sparkleContainerEl.appendChild(sparkle);

    // Remove after animation ends
    sparkle.addEventListener('animationend', () => sparkle.remove());
  };

  const startSparkles = () => {
    // Create initial burst
    for (let i = 0; i < 8; i++) {
      setTimeout(() => createSparkle(), i * 50);
    }
    // Continue creating sparkles
    sparkleIntervalId = setInterval(createSparkle, 120);
  };

  const stopSparkles = () => {
    if (sparkleIntervalId) {
      clearInterval(sparkleIntervalId);
      sparkleIntervalId = null;
    }
  };

  const showGenerateOverlay = () => {
    generateOverlayEl.classList.remove('hidden');
    startSparkles();
    startRumble();
  };

  const hideGenerateOverlay = () => {
    stopRumble();
    stopSparkles();
    generateOverlayEl.classList.add('hidden');
    // Clean up any remaining sparkles
    sparkleContainerEl.innerHTML = '';
  };

  const setStatusText = (msg: string, tone: 'muted' | 'error' | 'ok' = 'muted') => {
    statusEl.innerHTML = '';
    statusEl.textContent = msg;
    statusEl.dataset.tone = tone;
  };

  const setStatusErrorTable = (opts: {
    title: string;
    rows: Array<{ label: string; value: string }>;
  }) => {
    statusEl.dataset.tone = 'error';
    statusEl.innerHTML = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'ErrorTitle';
    titleEl.textContent = opts.title;

    const tableEl = document.createElement('table');
    tableEl.className = 'ErrorTable';

    for (const row of opts.rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = row.label;
      const td = document.createElement('td');
      td.textContent = row.value;
      tr.append(th, td);
      tableEl.appendChild(tr);
    }

    statusEl.append(titleEl, tableEl);
  };

  const openFeedbackDialog = (opts: { parseId: string; category: string }) => {
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
      'Tell us what it should look like. We’ll include your original input and the timer we tried to build.';

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
      if (!opts.parseId) return;
      sendBtn.disabled = true;
      try {
        await submitParseFeedback({
          parseId: opts.parseId,
          category: opts.category,
          note: noteEl.value.trim() || undefined,
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

  const appendReportButton = (opts: { parseId: string; category: string }) => {
    const reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.className = 'GhostBtn';
    reportBtn.textContent = "This didn't import right";
    reportBtn.addEventListener('click', () => openFeedbackDialog(opts));
    statusEl.appendChild(reportBtn);
  };

  const setStatus = (msg: string, tone: 'muted' | 'error' | 'ok' = 'muted') =>
    setStatusText(msg, tone);

  const friendlyErrorTable = (
    e: unknown,
  ): { title: string; rows: Array<{ label: string; value: string }> } => {
    if (e instanceof ApiError) {
      const code = e.code;
      if (code === 'parse_failed') {
        return {
          title: "Couldn't read that workout",
          rows: [
            { label: 'What happened', value: "We couldn't generate a timer from that input." },
            {
              label: 'Try this',
              value: 'Try again, or paste the workout text instead of the URL.',
            },
          ],
        };
      }
      if (code === 'url_retrieval_failed') {
        return {
          title: "Couldn't read that URL",
          rows: [
            { label: 'What happened', value: "We couldn't retrieve the workout from that link." },
            { label: 'Try this', value: 'Try again, or paste the workout text instead.' },
          ],
        };
      }
      if (code === 'unsupported_media_type') {
        return {
          title: "That input isn't supported",
          rows: [
            { label: 'What happened', value: "We couldn't read that format." },
            { label: 'Try this', value: 'Try pasting workout text or dropping an image.' },
          ],
        };
      }
      return {
        title: 'Something went wrong',
        rows: [
          ...(code ? [{ label: 'Error', value: code }] : []),
          { label: 'Try this', value: 'Please try again.' },
        ],
      };
    }

    return {
      title: 'Something went wrong',
      rows: [{ label: 'Try this', value: 'Please try again.' }],
    };
  };

  const formatImageUrlLabel = (value: string): string => {
    try {
      const parsed = new URL(value);
      const name = parsed.pathname.split('/').pop();
      if (name) return name;
      return parsed.host;
    } catch {
      return value.slice(0, 48);
    }
  };

  const updateFileIndicator = () => {
    if (selectedFile || selectedImageUrl) {
      const label = selectedFile ? selectedFile.name : formatImageUrlLabel(selectedImageUrl ?? '');
      fileIndicatorEl.innerHTML = '';

      const nameEl = document.createElement('span');
      nameEl.className = 'FileIndicatorName';
      nameEl.textContent = label;

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'FileIndicatorClear';
      clearBtn.setAttribute('aria-label', 'Remove image');

      const clearIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      clearIcon.setAttribute('width', '16');
      clearIcon.setAttribute('height', '16');
      clearIcon.setAttribute('viewBox', '0 0 24 24');
      clearIcon.setAttribute('fill', 'none');
      clearIcon.setAttribute('stroke', 'currentColor');
      clearIcon.setAttribute('stroke-width', '2');
      clearIcon.setAttribute('stroke-linecap', 'round');
      clearIcon.setAttribute('stroke-linejoin', 'round');
      clearIcon.setAttribute('aria-hidden', 'true');

      const clearLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      clearLine1.setAttribute('x1', '18');
      clearLine1.setAttribute('y1', '6');
      clearLine1.setAttribute('x2', '6');
      clearLine1.setAttribute('y2', '18');
      const clearLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      clearLine2.setAttribute('x1', '6');
      clearLine2.setAttribute('y1', '6');
      clearLine2.setAttribute('x2', '18');
      clearLine2.setAttribute('y2', '18');
      clearIcon.append(clearLine1, clearLine2);

      clearBtn.appendChild(clearIcon);
      fileIndicatorEl.append(nameEl, clearBtn);
      fileIndicatorEl.style.display = 'flex';

      clearBtn.addEventListener('click', () => {
        selectedFile = null;
        selectedImageUrl = null;
        fileInputEl.value = '';
        updateFileIndicator();
      });
    } else {
      fileIndicatorEl.innerHTML = '';
      fileIndicatorEl.style.display = 'none';
    }
  };

  // File button click -> trigger file input
  fileBtnEl.addEventListener('click', () => {
    fileInputEl.click();
  });

  recentMoreEl.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/workouts');
  });

  const shortId = (id: string) => id.slice(0, 8);

  const formatRelativeTime = (timestamp: number | null): string => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (days === 1) return 'Yesterday';

    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const buildRecentRow = (item: DefinitionListItem) => {
    const preview = item.source?.preview?.trim() ?? '';
    const title = item.title?.trim() || preview || `Workout ${shortId(item.definitionId)}`;
    const meta = formatRelativeTime(item.lastRunAt);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'RecentItem';
    row.setAttribute('role', 'listitem');
    const titleEl = document.createElement('div');
    titleEl.className = 'RecentTitle';
    titleEl.textContent = title;
    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'RecentMeta';
      metaEl.textContent = meta;
      row.append(titleEl, metaEl);
    } else {
      row.append(titleEl);
    }
    row.addEventListener('click', () => {
      navigate(`/w/${encodeURIComponent(item.definitionId)}`);
    });
    return row;
  };

  const loadRecent = async () => {
    try {
      const res = await listDefinitions({ take: 3 });
      if (!res.items?.length) return;
      recentListEl.innerHTML = '';
      const fragment = document.createDocumentFragment();
      for (const item of res.items) {
        fragment.appendChild(buildRecentRow(item));
      }
      recentListEl.appendChild(fragment);
      recentSectionEl.style.display = 'block';
    } catch {
      // ignore
    }
  };

  // File input change
  fileInputEl.addEventListener('change', () => {
    const file = fileInputEl.files?.[0] ?? null;
    if (file) {
      selectedFile = file;
      selectedImageUrl = null;
      updateFileIndicator();
      setStatus('');
      showToast('Image selected', 'muted');
    }
  });

  // Drag and drop handlers
  let dragCounter = 0;

  dropZoneEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropZoneEl.classList.add('dragover');
  });

  dropZoneEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropZoneEl.classList.remove('dragover');
    }
  });

  dropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dropZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZoneEl.classList.remove('dragover');

    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      selectedFile = file;
      selectedImageUrl = null;
      updateFileIndicator();
      setStatus('');
      showToast('Image dropped', 'muted');
    }
  });

  const handleGenerate = async (source: 'click' | 'auto' = 'click') => {
    setStatus('');

    const text = inputEl.value.trim();
    const hasFile = !!selectedFile;
    const hasImageUrl = !!selectedImageUrl;
    const textLooksLikeUrl = !hasImageUrl && /^https?:\/\//i.test(text);

    console.info('[import] generate', {
      source,
      hasFile,
      hasImageUrl,
      textLen: text.length,
      textLooksLikeUrl,
      fileType: selectedFile?.type,
      fileSize: selectedFile?.size,
      imageUrlLen: selectedImageUrl?.length ?? 0,
    });

    if (!hasFile && !hasImageUrl && !text) {
      setStatus('');
      showToast('Add an image, URL, or text first.', 'error');
      return;
    }

    generateEl.disabled = true;
    showGenerateOverlay();

    try {
      await ensureAnonymousSession();

      // Determine what to send:
      // - If we have a file, send it as image (text can still be sent as context)
      // - If text is a URL, send as url
      // - Otherwise send as text
      const url = textLooksLikeUrl ? text : undefined;
      const workoutText = url ? undefined : text || undefined;
      const parsed = await parseWorkout({
        imageFile: selectedFile ?? undefined,
        imageUrl: selectedFile ? undefined : (selectedImageUrl ?? undefined),
        text: workoutText,
        url,
      });
      lastParseError = null;
      const { definitionId } = await createDefinition({
        workoutDefinition: parsed.workoutDefinition,
        source: parsed.source,
        parseId: parsed.parseId,
      });
      haptics.success();

      // Brief moment before navigation for smooth transition
      setTimeout(() => {
        hideGenerateOverlay();
        navigate(`/w/${encodeURIComponent(definitionId)}`);
      }, 200);
    } catch (e) {
      console.error('[import] generate failed', e);
      haptics.error();
      hideGenerateOverlay();
      setStatusErrorTable(friendlyErrorTable(e));
      const err = e instanceof ApiError ? e : null;
      lastParseError = err?.parseId
        ? {
            parseId: err.parseId,
            category: err.code ?? 'parse_failed',
          }
        : null;
      if (lastParseError) {
        appendReportButton(lastParseError);
      }
      generateEl.disabled = false;
    }
  };

  // Generate handler
  generateEl.addEventListener('click', async () => {
    await handleGenerate('click');
  });

  const params = new URLSearchParams(window.location.search);
  const queryText = params.get('q');
  const queryImageUrl = params.get('img');

  if (typeof queryText === 'string' && queryText.trim()) {
    inputEl.value = queryText.trim();
  }

  if (typeof queryImageUrl === 'string' && queryImageUrl.trim()) {
    selectedImageUrl = queryImageUrl.trim();
    updateFileIndicator();
    setStatus('');
    showToast('Image URL loaded. Generating…', 'muted', { timeoutMs: 1600 });
  }

  if ((queryText && queryText.trim()) || (queryImageUrl && queryImageUrl.trim())) {
    void handleGenerate('auto');
  }

  void loadRecent();
}

import { listDefinitions, type DefinitionListItem } from '../api';
import { navigate } from '../router';
import { appHeader, setupAppHeader } from '../components/header';
import { updateMeta } from '../meta';
import { showToast } from '../components/toast';

export async function renderWorkoutsPage(root: HTMLElement) {
  updateMeta({
    title: 'Workouts - WOD Brains',
    description: 'View and start your saved workouts in WOD Brains.',
    url: new URL('/workouts', window.location.origin).toString(),
  });

  root.innerHTML = `
    <div class="PageShell">
      ${appHeader()}
      <main class="PageContent" id="main-content">
        <h1 class="PageTitle">Workouts</h1>
        <div class="RecentList" id="workoutsList" role="list" aria-label="Saved workouts"></div>
        <div class="Status" id="status" role="status" aria-live="polite"></div>
        <div class="InfiniteSentinel" id="sentinel" aria-hidden="true"></div>
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

  setupAppHeader(root);

  const listEl = root.querySelector<HTMLDivElement>('#workoutsList')!;
  const statusEl = root.querySelector<HTMLDivElement>('#status')!;
  const sentinelEl = root.querySelector<HTMLDivElement>('#sentinel')!;

  const setStatus = (msg: string, tone: 'muted' | 'error' | 'ok' = 'muted') => {
    statusEl.textContent = msg;
    statusEl.dataset.tone = tone;
  };

  const shortId = (id: string) => id.slice(0, 8);

  const buildRow = (item: DefinitionListItem) => {
    const preview = item.source?.preview?.trim() ?? '';
    const title = item.title?.trim() || preview || `Workout ${shortId(item.definitionId)}`;
    const meta =
      item.title?.trim() && preview && item.title.trim() !== preview
        ? preview
        : `ID: ${shortId(item.definitionId)}`;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'RecentItem';
    row.setAttribute('role', 'listitem');
    const titleEl = document.createElement('div');
    titleEl.className = 'RecentTitle';
    titleEl.textContent = title;
    const metaEl = document.createElement('div');
    metaEl.className = 'RecentMeta';
    metaEl.textContent = meta;
    row.append(titleEl, metaEl);
    row.addEventListener('click', () => {
      navigate(`/w/${encodeURIComponent(item.definitionId)}`);
    });
    return row;
  };

  let cursor: string | null = null;
  let loading = false;
  let done = false;

  const loadMore = async () => {
    if (loading || done) return;
    loading = true;
    setStatus('Loading...', 'muted');
    try {
      const res = await listDefinitions({ take: 20, cursor: cursor ?? undefined });
      if (!res.items?.length && !cursor) {
        setStatus('No workouts yet.', 'muted');
        done = true;
        return;
      }

      if (res.items?.length) {
        const fragment = document.createDocumentFragment();
        for (const item of res.items) {
          fragment.appendChild(buildRow(item));
        }
        listEl.appendChild(fragment);
      }

      cursor = res.nextCursor;
      done = !cursor;
      setStatus('', 'muted');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus('', 'muted');
      showToast(msg, 'error');
    } finally {
      loading = false;
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(sentinelEl);

  await loadMore();
}

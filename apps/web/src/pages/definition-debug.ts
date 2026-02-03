import { getDefinitionDebug } from '../api';
import { appFooter } from '../components/footer';
import { appHeader, setAppHeaderTitle, setupAppHeader } from '../components/header';
import { showToast } from '../components/toast';
import { updateMeta } from '../meta';

const formatIso = (ms: unknown) => {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 'n/a';
  try {
    return new Date(ms).toISOString();
  } catch {
    return 'n/a';
  }
};

const safeString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : 'n/a';

function safeHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).host || null;
  } catch {
    return null;
  }
}

function renderKvList(entries: Array<{ k: string; v: string }>) {
  const wrap = document.createElement('div');
  wrap.className = 'DebugKv';
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'DebugKvRow';

    const k = document.createElement('div');
    k.className = 'DebugKvKey';
    k.textContent = entry.k;

    const v = document.createElement('div');
    v.className = 'DebugKvValue';
    v.textContent = entry.v;

    row.append(k, v);
    wrap.appendChild(row);
  }
  return wrap;
}

function renderSourcesList(
  sources: Array<{ url: string; title?: string }> | null | undefined,
): HTMLElement {
  const list = document.createElement('div');
  list.className = 'DebugSources';

  const items = Array.isArray(sources) ? sources.filter((s) => s?.url) : [];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'DebugEmpty';
    empty.textContent = 'No stored sources.';
    list.appendChild(empty);
    return list;
  }

  const ul = document.createElement('ul');
  ul.className = 'DebugSourceList';
  ul.setAttribute('role', 'list');
  ul.setAttribute('aria-label', 'Sources');

  for (const src of items) {
    const li = document.createElement('li');
    li.className = 'DebugSourceItem';
    li.setAttribute('role', 'listitem');

    const a = document.createElement('a');
    a.className = 'DebugSourceLink';
    a.href = src.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const title = document.createElement('div');
    title.className = 'DebugSourceTitle';
    title.textContent = (
      src.title?.trim() ? src.title.trim() : (safeHost(src.url) ?? src.url)
    ).slice(0, 200);

    const host = document.createElement('div');
    host.className = 'DebugSourceHost';
    host.textContent = safeHost(src.url) ?? src.url;

    a.append(title, host);
    li.appendChild(a);
    ul.appendChild(li);
  }

  list.appendChild(ul);
  return list;
}

function section(titleText: string) {
  const s = document.createElement('section');
  s.className = 'DebugSection';

  const h = document.createElement('h2');
  h.className = 'DebugSectionTitle';
  h.textContent = titleText;

  s.appendChild(h);
  return s;
}

export async function renderDefinitionDebugPage(root: HTMLElement, definitionId: string) {
  const backTarget = `/w/${encodeURIComponent(definitionId)}`;
  updateMeta({
    title: 'Debug - WOD Brains',
    description: 'Debug view for a generated workout (definition + parse + stored payload).',
    url: new URL(`/w/${encodeURIComponent(definitionId)}/debug`, window.location.origin).toString(),
  });

  root.innerHTML = `
    <div class="PageShell">
      ${appHeader({ backTarget, centerSlot: 'title' })}
      <main class="PageContent DebugContent" id="main-content">
        <div class="Status" id="debugStatus" role="status" aria-live="polite"></div>

        <div class="DebugActions">
          <button class="SecondaryBtn" id="copyDebugJson" type="button">Copy JSON</button>
          <a class="GhostBtn" id="openDebugJson" href="/api/definitions/${encodeURIComponent(
            definitionId,
          )}/debug" target="_blank" rel="noopener noreferrer">Open JSON</a>
        </div>

        <div class="DebugGrid" id="debugGrid"></div>

        <pre class="DebugPre" id="debugJson" aria-label="Raw debug JSON"></pre>
      </main>
      ${appFooter()}
    </div>
  `;

  setupAppHeader(root, { backTarget });
  setAppHeaderTitle(root, 'Debug');

  const status = root.querySelector<HTMLElement>('#debugStatus');
  const grid = root.querySelector<HTMLElement>('#debugGrid');
  const pre = root.querySelector<HTMLElement>('#debugJson');
  const copyBtn = root.querySelector<HTMLButtonElement>('#copyDebugJson');

  if (!status || !grid || !pre || !copyBtn) return;

  status.textContent = 'Loading debug info…';
  copyBtn.disabled = true;

  try {
    const data = await getDefinitionDebug(definitionId);
    status.textContent = '';

    const jsonText = JSON.stringify(data, null, 2);
    pre.textContent = jsonText;

    copyBtn.disabled = false;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(jsonText);
        showToast('Copied debug JSON.', 'ok');
      } catch {
        // Fallback: select text so user can copy manually.
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        showToast('Select-all ready. Copy now.', 'muted', { timeoutMs: 1800 });
      }
    });

    const defRow = (data?.definitionRow ?? null) as any;
    const def = (data?.definition ?? null) as any;
    const origin = (data?.origin ?? null) as any;
    const attempt = (data?.attempt ?? null) as any;
    const r2 = (data?.r2 ?? null) as any;
    const payload = (data?.payload ?? null) as any;

    const summary = section('Summary');
    summary.appendChild(
      renderKvList([
        { k: 'definitionId', v: safeString(defRow?.definitionId ?? definitionId) },
        { k: 'createdAt', v: formatIso(defRow?.createdAt) },
        { k: 'updatedAt', v: formatIso(defRow?.updatedAt) },
        { k: 'dataVersion', v: String(defRow?.dataVersion ?? 'n/a') },
        { k: 'sourceKind', v: safeString(defRow?.sourceKind) },
        { k: 'sourcePreview', v: safeString(defRow?.sourcePreview) },
        { k: 'parseId', v: safeString(origin?.parseId) },
        {
          k: 'payloadR2Key',
          v: safeString(origin?.payloadR2Key ?? attempt?.payloadR2Key ?? r2?.payloadKey),
        },
        { k: 'errorCode', v: safeString(attempt?.errorCode) },
      ]),
    );

    const sources = section('Stored sources (definition)');
    sources.appendChild(renderSourcesList(def?.attribution?.sources));

    const originSec = section('Origin (definition_origins)');
    originSec.appendChild(
      renderKvList([
        { k: 'parseId', v: safeString(origin?.parseId) },
        { k: 'payloadR2Key', v: safeString(origin?.payloadR2Key) },
        { k: 'payloadSha256', v: safeString(origin?.payloadSha256) },
        { k: 'inputImageKey', v: safeString(origin?.inputImageKey) },
        { k: 'createdAt', v: formatIso(origin?.createdAt) },
      ]),
    );

    const attemptSec = section('Parse attempt (parse_attempts)');
    attemptSec.appendChild(
      renderKvList([
        { k: 'requestId', v: safeString(attempt?.requestId) },
        { k: 'createdAt', v: formatIso(attempt?.createdAt) },
        { k: 'inputKind', v: safeString(attempt?.inputKind) },
        { k: 'inputTextPreview', v: safeString(attempt?.inputTextPreview) },
        { k: 'inputUrl', v: safeString(attempt?.inputUrl) },
        { k: 'outputTitlePreview', v: safeString(attempt?.outputTitlePreview) },
        { k: 'errorCode', v: safeString(attempt?.errorCode) },
        { k: 'errorMessage', v: safeString(attempt?.errorMessage) },
      ]),
    );

    const r2Sec = section('R2 payload (parse_payloads)');
    r2Sec.appendChild(
      renderKvList([
        { k: 'payloadKey', v: safeString(r2?.payloadKey) },
        { k: 'size', v: String(r2?.payloadHead?.size ?? 'n/a') },
        { k: 'etag', v: safeString(r2?.payloadHead?.etag) },
        { k: 'uploaded', v: safeString(r2?.payloadHead?.uploaded) },
        { k: 'payloadJsonError', v: safeString(payload?.jsonError) },
      ]),
    );

    const payloadSec = section('Payload highlights');
    const payloadHighlights = document.createElement('pre');
    payloadHighlights.className = 'DebugPre DebugPre--small';
    payloadHighlights.textContent = JSON.stringify(
      {
        input: payload?.json?.input ?? null,
        urlStatuses: payload?.json?.urlStatuses ?? null,
        webSearchQueries:
          payload?.json?.providerMetadata?.parse?.google?.groundingMetadata?.webSearchQueries ??
          null,
        output: payload?.json?.output ?? null,
      },
      null,
      2,
    );
    payloadSec.appendChild(payloadHighlights);

    grid.append(summary, sources, originSec, attemptSec, r2Sec, payloadSec);
  } catch (e) {
    status.textContent = 'Failed to load debug info.';
    copyBtn.disabled = true;
    showToast('Failed to load debug info.', 'error');
    console.error('[definition-debug] load failed', e);
  }
}

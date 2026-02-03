export type AttributionSource = { url: string; title?: string };

const safeHostForUrl = (raw: string): string | null => {
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
};

const faviconUrlForSource = (raw: string): string | null => {
  try {
    const origin = new URL(raw).origin;
    // Deterministic, cacheable favicons by source domain.
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(origin)}&sz=64`;
  } catch {
    return null;
  }
};

const bestTitleForSource = (src: AttributionSource): string => {
  const t = src.title?.trim();
  if (t) return t;
  return safeHostForUrl(src.url) ?? src.url;
};

const renderIcon = (src: AttributionSource) => {
  const wrap = document.createElement('div');
  wrap.className = 'SourcesFaviconWrap';

  const img = document.createElement('img');
  img.className = 'SourcesFaviconImg';
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';

  const faviconUrl = faviconUrlForSource(src.url);
  if (faviconUrl) img.src = faviconUrl;

  const fallback = document.createElement('div');
  fallback.className = 'SourcesFaviconFallback';
  const host = safeHostForUrl(src.url);
  fallback.textContent = host ? host.slice(0, 1).toUpperCase() : '?';
  fallback.hidden = true;

  img.addEventListener('error', () => {
    img.hidden = true;
    fallback.hidden = false;
  });

  wrap.append(img, fallback);
  return wrap;
};

/** Single-source: render a simple clickable row linking directly to the source. */
function mountSingleSource(container: HTMLElement, src: AttributionSource) {
  const a = document.createElement('a');
  a.className = 'SourcesSingleRow';
  a.href = src.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const icon = renderIcon(src);
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('div');
  text.className = 'SourcesRowText';

  const rowTitle = document.createElement('div');
  rowTitle.className = 'SourcesRowTitle';
  rowTitle.textContent = bestTitleForSource(src);

  const rowHost = document.createElement('div');
  rowHost.className = 'SourcesRowHost';
  rowHost.textContent = safeHostForUrl(src.url) ?? src.url;

  text.append(rowTitle, rowHost);
  a.append(icon, text);
  container.appendChild(a);
}

/** Multi-source: collapsible summary + expandable list. */
function mountMultipleSources(
  container: HTMLElement,
  sources: AttributionSource[],
  maxIcons: number,
) {
  const listId = `sources-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
  let expanded = false;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'SourcesSummaryBtn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', listId);
  btn.setAttribute('aria-label', 'Show sources');

  const pile = document.createElement('div');
  pile.className = 'SourcesIconPile';
  pile.setAttribute('aria-hidden', 'true');

  const renderMoreBadge = (n: number) => {
    const wrap = document.createElement('div');
    wrap.className = 'SourcesFaviconWrap SourcesFaviconWrap--more';
    wrap.textContent = `+${n}`;
    return wrap;
  };

  const visible = sources.slice(0, maxIcons);
  visible.forEach((s) => pile.appendChild(renderIcon(s)));
  if (sources.length > maxIcons) {
    pile.appendChild(renderMoreBadge(sources.length - maxIcons));
  }

  const label = document.createElement('div');
  label.className = 'SourcesSummaryLabel';

  const title = document.createElement('div');
  title.className = 'SourcesSummaryTitle';
  title.textContent = bestTitleForSource(sources[0]!);

  const moreCount = Math.max(0, sources.length - 1);
  const more = document.createElement('div');
  more.className = 'SourcesSummaryMore';
  more.textContent = moreCount ? `+${moreCount} more` : '';
  if (!moreCount) more.hidden = true;

  label.append(title, more);

  const expandedWrap = document.createElement('div');
  expandedWrap.className = 'SourcesExpanded hidden';
  expandedWrap.id = listId;

  const list = document.createElement('div');
  list.className = 'SourcesList';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Sources');

  sources.forEach((s) => {
    const a = document.createElement('a');
    a.className = 'SourcesRow';
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('role', 'listitem');

    const icon = renderIcon(s);
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('div');
    text.className = 'SourcesRowText';

    const rowTitle = document.createElement('div');
    rowTitle.className = 'SourcesRowTitle';
    rowTitle.textContent = bestTitleForSource(s);

    const rowHost = document.createElement('div');
    rowHost.className = 'SourcesRowHost';
    rowHost.textContent = safeHostForUrl(s.url) ?? s.url;

    text.append(rowTitle, rowHost);
    a.append(icon, text);
    list.appendChild(a);
  });

  expandedWrap.appendChild(list);

  const sync = () => {
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.setAttribute('aria-label', expanded ? 'Hide sources' : 'Show sources');
    expandedWrap.classList.toggle('hidden', !expanded);
  };

  btn.addEventListener('click', () => {
    expanded = !expanded;
    sync();
  });

  btn.append(pile, label);
  container.append(btn, expandedWrap);
  sync();
}

export function mountSourcesWidget(opts: {
  container: HTMLElement;
  sources: AttributionSource[] | null | undefined;
  maxCollapsedIcons?: number;
}) {
  const sources = Array.isArray(opts.sources) ? opts.sources.filter((s) => s?.url) : [];
  const maxIcons = Math.max(1, Math.floor(opts.maxCollapsedIcons ?? 3));

  opts.container.innerHTML = '';
  opts.container.classList.toggle('hidden', !sources.length);
  if (!sources.length) return;

  if (sources.length === 1) {
    mountSingleSource(opts.container, sources[0]!);
  } else {
    mountMultipleSources(opts.container, sources, maxIcons);
  }
}

export type ConnectionIssueKind = 'network' | 'server' | 'rate';

type ConnectionIssue = {
  kind: ConnectionIssueKind;
  message: string;
  since: number;
};

const DEFAULT_MESSAGES: Record<ConnectionIssueKind, string> = {
  network: 'Connection problem. Check your internet.',
  server: 'Server trouble. Retrying...',
  rate: 'Rate limited. Retrying...',
};

let issue: ConnectionIssue | null = null;
let pillEl: HTMLDivElement | null = null;
let clearTimer: number | null = null;

// Ensure the pill is readable (and test-stable) even for very fast retries.
const MIN_VISIBLE_MS = 500;

const updatePill = () => {
  if (!pillEl) return;
  if (!issue) {
    pillEl.classList.remove('visible');
    pillEl.textContent = '';
    pillEl.removeAttribute('data-kind');
    return;
  }

  pillEl.classList.add('visible');
  pillEl.dataset.kind = issue.kind;
  pillEl.textContent = issue.message;
};

export const initConnectionPill = () => {
  if (pillEl) return;
  pillEl = document.createElement('div');
  pillEl.className = 'ConnectionPill';
  pillEl.setAttribute('role', 'status');
  pillEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(pillEl);
  updatePill();

  window.addEventListener('online', () => clearConnectionIssue());
  window.addEventListener('offline', () => {
    setConnectionIssue('network', 'You are offline.');
  });
};

export const setConnectionIssue = (kind: ConnectionIssueKind, message?: string) => {
  const nextMessage = message ?? DEFAULT_MESSAGES[kind];
  if (issue && issue.kind === kind && issue.message === nextMessage) return;
  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }
  issue = { kind, message: nextMessage, since: Date.now() };
  updatePill();
};

export const clearConnectionIssue = () => {
  if (!issue) return;
  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }

  const remainingMs = Math.max(0, MIN_VISIBLE_MS - (Date.now() - issue.since));
  if (remainingMs > 0) {
    clearTimer = window.setTimeout(() => {
      issue = null;
      clearTimer = null;
      updatePill();
    }, remainingMs);
    return;
  }

  issue = null;
  updatePill();
};

export const getConnectionIssue = () => issue;

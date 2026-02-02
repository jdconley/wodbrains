export type ToastTone = 'muted' | 'ok' | 'error';

type ToastOptions = {
  timeoutMs?: number;
};

const HOST_ID = 'toastHost';

function ensureHost(): HTMLDivElement {
  const existing = document.getElementById(HOST_ID);
  if (existing && existing instanceof HTMLDivElement) return existing;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'ToastHost';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-relevant', 'additions text');
  host.setAttribute('aria-atomic', 'true');
  document.body.appendChild(host);
  return host;
}

export function showToast(message: string, tone: ToastTone = 'muted', opts: ToastOptions = {}) {
  const trimmed = message.trim();
  if (!trimmed) return;

  const host = ensureHost();
  const toast = document.createElement('div');
  toast.className = 'Toast';
  toast.dataset.tone = tone;
  toast.textContent = trimmed;
  host.appendChild(toast);

  const timeoutMs = Math.max(800, opts.timeoutMs ?? (tone === 'error' ? 2600 : 1200));
  const remove = () => {
    toast.classList.add('Toast--hide');
    window.setTimeout(() => toast.remove(), 180);
  };
  window.setTimeout(remove, timeoutMs);
}

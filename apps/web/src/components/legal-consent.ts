export type LegalConsentContext = 'generate' | 'run';

type LegalAcceptance = {
  version: string;
  acceptedAtIso: string;
};

const LEGAL_VERSION = '2026-02-02';
const storageKey = 'wodbrains.legal.acceptance';

const loadAcceptance = (): LegalAcceptance | null => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.version !== 'string' || typeof rec.acceptedAtIso !== 'string') return null;
    return { version: rec.version, acceptedAtIso: rec.acceptedAtIso };
  } catch {
    return null;
  }
};

const saveAcceptance = () => {
  const next: LegalAcceptance = { version: LEGAL_VERSION, acceptedAtIso: new Date().toISOString() };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // ignore
  }
};

export const hasAcceptedLegal = (): boolean => {
  const acceptance = loadAcceptance();
  return acceptance?.version === LEGAL_VERSION;
};

const getFocusable = (root: HTMLElement): HTMLElement[] => {
  const els = Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(','),
    ),
  );
  return els.filter((el) => {
    // Basic visibility check
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });
};

export async function requireLegalConsent(opts: { context: LegalConsentContext }): Promise<void> {
  if (hasAcceptedLegal()) return;

  const lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  await new Promise<void>((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'ConfirmDialog LegalConsentDialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const titleId = `legal-title-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    const descId = `legal-desc-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    overlay.setAttribute('aria-labelledby', titleId);
    overlay.setAttribute('aria-describedby', descId);

    const card = document.createElement('div');
    card.className = 'ConfirmDialogCard LegalConsentCard';

    const title = document.createElement('div');
    title.className = 'ConfirmDialogTitle';
    title.id = titleId;
    title.textContent = 'Terms & Privacy';

    const desc = document.createElement('div');
    desc.className = 'ConfirmDialogDescription';
    desc.id = descId;
    desc.textContent =
      opts.context === 'generate'
        ? 'Before we generate your timer, please accept our Terms and acknowledge our Privacy Policy.'
        : 'Before you view this run, please accept our Terms and acknowledge our Privacy Policy.';

    const links = document.createElement('div');
    links.className = 'LegalConsentLinks';
    links.innerHTML = `
      <a class="LegalConsentLink" href="/terms" target="_blank" rel="noopener noreferrer">Read Terms</a>
      <a class="LegalConsentLink" href="/privacy" target="_blank" rel="noopener noreferrer">Read Privacy</a>
    `;

    const checks = document.createElement('div');
    checks.className = 'LegalConsentChecks';

    const agreeLabel = document.createElement('label');
    agreeLabel.className = 'LegalConsentCheck';
    const agreeInput = document.createElement('input');
    agreeInput.type = 'checkbox';
    agreeInput.id = 'legalAgreeCheck';
    agreeInput.name = 'legalAgree';
    agreeInput.setAttribute('aria-label', 'Agree to Terms and acknowledge Privacy Policy');
    const agreeText = document.createElement('span');
    agreeText.innerHTML = `I agree to the <a class="LegalConsentInlineLink" href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</a> and acknowledge the <a class="LegalConsentInlineLink" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.`;
    agreeLabel.append(agreeInput, agreeText);

    checks.append(agreeLabel);

    const finePrint = document.createElement('div');
    finePrint.className = 'LegalConsentFinePrint';
    finePrint.textContent = 'By clicking “I Agree”, you consent to these terms.';

    const actions = document.createElement('div');
    actions.className = 'FeedbackActions LegalConsentActions';

    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'GhostBtn';
    declineBtn.id = 'legalDecline';
    declineBtn.textContent = 'Decline';

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'PrimaryBtn';
    acceptBtn.id = 'legalAccept';
    acceptBtn.textContent = 'I Agree';
    acceptBtn.disabled = true;

    actions.append(declineBtn, acceptBtn);
    card.append(title, desc, links, checks, finePrint, actions);
    overlay.appendChild(card);

    const updateEnabled = () => {
      acceptBtn.disabled = !agreeInput.checked;
    };
    agreeInput.addEventListener('change', updateEnabled);

    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      lastFocused?.focus();
    };

    const accept = () => {
      saveAcceptance();
      close();
      resolve();
    };

    const decline = () => {
      close();
      reject(new Error('legal_declined'));
    };

    acceptBtn.addEventListener('click', () => accept());
    declineBtn.addEventListener('click', () => decline());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        decline();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusables = getFocusable(overlay);
      if (!focusables.length) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const idx = active ? focusables.indexOf(active) : -1;
      const dir = event.shiftKey ? -1 : 1;
      const nextIdx = idx === -1 ? 0 : (idx + dir + focusables.length) % focusables.length;
      focusables[nextIdx]?.focus();
      event.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);

    // Intentionally do not close on backdrop click; this is a blocking click-through.
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        // no-op
      }
    });

    document.body.appendChild(overlay);
    agreeInput.focus();
  });
}

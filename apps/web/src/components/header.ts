import { navigate, getRoute, type Route } from '../router';

/**
 * Get the back navigation target based on the current route.
 * Returns null if at root (no back button should be shown).
 */
export function getBackTarget(route: Route): string | null {
  switch (route.name) {
    case 'import':
      return null; // Root - no back button
    case 'workouts':
      return '/';
    case 'definition':
      return '/';
    case 'definition-edit':
      return '/';
    case 'run':
      // For run page, we need the definitionId from the run
      // We'll handle this specially in the run page
      return null; // Will be set by the page
    default:
      return '/';
  }
}

export interface AppHeaderOptions {
  /** Override the back target (e.g., for run page which needs async data) */
  backTarget?: string | null;
  /** Called before navigation, return false to cancel */
  onBeforeBack?: () => boolean | void | Promise<boolean | void>;
  /** Hide the logo (show only back button) */
  hideLogo?: boolean;
  /** Keep mobile header layout on desktop */
  compact?: boolean;
  /** What renders in the center slot */
  centerSlot?: 'logo' | 'title' | 'titleInput';
  /** When using centerSlot: 'title', show the WOD Brains logo next to the title */
  titleWithLogo?: boolean;
  /** Options for center title input */
  titleInput?: { id: string; placeholder?: string; ariaLabel: string };
  /** Static HTML for right-side actions (icon buttons) */
  rightHtml?: string;
}

/**
 * Render the shared app header HTML.
 */
export function appHeader(options: AppHeaderOptions = {}): string {
  const route = getRoute();
  const backTarget = options.backTarget !== undefined ? options.backTarget : getBackTarget(route);
  const showBack = backTarget !== null;
  const centerSlot = options.centerSlot ?? 'logo';
  const showLogo = !options.hideLogo && centerSlot === 'logo';

  const centerHtml =
    centerSlot === 'title'
      ? options.titleWithLogo
        ? `
          <div class="AppHeaderTitleWithLogo">
            <img src="/logo.svg" alt="" class="AppHeaderTitleLogo" aria-hidden="true" />
            <div class="AppHeaderTitle" id="appHeaderTitle"></div>
          </div>
        `
        : `<div class="AppHeaderTitle" id="appHeaderTitle"></div>`
      : centerSlot === 'titleInput' && options.titleInput
        ? `<input
            class="AppHeaderTitleInput"
            id="${options.titleInput.id}"
            type="text"
            placeholder="${options.titleInput.placeholder ?? ''}"
            aria-label="${options.titleInput.ariaLabel}"
          />`
        : showLogo
          ? `
        <a href="/" class="AppHeaderLogo AppHeaderLogo--center MobileOnly" id="appHeaderLogo" aria-label="WOD Brains home">
          <img src="/logo.svg" alt="WOD Brains" />
        </a>
      `
          : '';

  // Brand (logo + “WOD Brains”) is shown when using logo header.
  // On desktop, CSS swaps the center logo for this brand element.
  const brandHtml =
    showLogo && centerSlot === 'logo'
      ? `
        <a href="/" class="AppHeaderBrand" id="appHeaderBrand" aria-label="WOD Brains home">
          <img src="/logo.svg" alt="" class="AppHeaderBrandLogo" aria-hidden="true" />
          <span class="BrandName">WOD Brains</span>
        </a>
      `
      : '';

  return `
    <header class="AppHeader ${options.compact ? 'AppHeader--compact' : ''}" id="appHeader" role="banner">
      <nav class="AppHeaderBack" aria-label="Navigation">
        ${
          showBack
            ? `
          <button class="AppHeaderBackBtn" id="appHeaderBack" type="button" aria-label="Go back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        `
            : ''
        }
      </nav>
      <div class="AppHeaderCenter">
        ${centerHtml}
        ${brandHtml}
      </div>
      <div class="AppHeaderRight">${options.rightHtml ?? ''}</div>
    </header>
  `;
}

/**
 * Set up event listeners for the app header.
 * Call this after rendering the page.
 */
export function setupAppHeader(root: HTMLElement, options: AppHeaderOptions = {}): void {
  const route = getRoute();
  const backTarget = options.backTarget !== undefined ? options.backTarget : getBackTarget(route);

  const backBtn = root.querySelector<HTMLButtonElement>('#appHeaderBack');
  const logoLink = root.querySelector<HTMLAnchorElement>('#appHeaderLogo');
  const brandLink = root.querySelector<HTMLAnchorElement>('#appHeaderBrand');

  let navigating = false;
  const runBeforeBack = async (): Promise<boolean> => {
    if (!options.onBeforeBack) return true;
    try {
      const result = await options.onBeforeBack();
      return result !== false;
    } catch {
      return false;
    }
  };

  const navigateWithGuard = async (target: string) => {
    if (navigating) return;
    navigating = true;
    try {
      const ok = await runBeforeBack();
      if (!ok) return;
      navigate(target);
    } finally {
      navigating = false;
    }
  };

  if (backBtn && backTarget) {
    backBtn.addEventListener('click', () => {
      void navigateWithGuard(backTarget);
    });
  }

  const handleLogoClick = (e: Event) => {
    e.preventDefault();
    void navigateWithGuard('/');
  };

  if (logoLink) {
    logoLink.addEventListener('click', handleLogoClick);
  }

  if (brandLink) {
    brandLink.addEventListener('click', handleLogoClick);
  }
}

/**
 * Show or hide the app header (for run page during timer).
 */
export function setAppHeaderVisible(root: HTMLElement, visible: boolean): void {
  const header = root.querySelector<HTMLElement>('#appHeader');
  if (header) {
    header.classList.toggle('hidden', !visible);
  }
}

/**
 * Update the header title text (safe textContent).
 */
export function setAppHeaderTitle(root: HTMLElement, title: string): void {
  const titleEl = root.querySelector<HTMLElement>('#appHeaderTitle');
  if (titleEl) {
    titleEl.textContent = title;
  }
}

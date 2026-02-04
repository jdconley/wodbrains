type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredPrompt: DeferredPromptEvent | null = null;
let installPromptInitialized = false;

export const initPwaInstallPrompt = () => {
  if (installPromptInitialized || typeof window === 'undefined') return;
  installPromptInitialized = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as DeferredPromptEvent;
  });
};

export const canPromptInstall = () => !!deferredPrompt;

export const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  try {
    const choice = await prompt.userChoice;
    return choice?.outcome ?? 'dismissed';
  } catch {
    return 'dismissed';
  }
};

export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayStandalone || iosStandalone;
};

export const isIos = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

export const isIphone = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iphone/i.test(navigator.userAgent);
};

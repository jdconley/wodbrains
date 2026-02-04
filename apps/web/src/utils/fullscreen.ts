type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msFullscreenElement?: Element | null;
  msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

export const getFullscreenElement = (): Element | null => {
  if (typeof document === 'undefined') return null;
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement ?? null;
};

export const isFullscreen = (): boolean => !!getFullscreenElement();

export const isFullscreenSupported = (element: HTMLElement = document.documentElement): boolean => {
  const el = element as FullscreenElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
};

export const requestFullscreen = async (
  element: HTMLElement = document.documentElement,
): Promise<boolean> => {
  const el = element as FullscreenElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!request) return false;
  try {
    const result = request.call(el);
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }
    return true;
  } catch {
    return false;
  }
};

export const exitFullscreen = async (): Promise<boolean> => {
  const doc = document as FullscreenDocument;
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
  if (!exit) return false;
  try {
    const result = exit.call(doc);
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }
    return true;
  } catch {
    return false;
  }
};

export const onFullscreenChange = (handler: () => void): (() => void) => {
  const listener = () => handler();
  document.addEventListener('fullscreenchange', listener);
  document.addEventListener('webkitfullscreenchange', listener as EventListener);
  document.addEventListener('MSFullscreenChange', listener as EventListener);
  return () => {
    document.removeEventListener('fullscreenchange', listener);
    document.removeEventListener('webkitfullscreenchange', listener as EventListener);
    document.removeEventListener('MSFullscreenChange', listener as EventListener);
  };
};

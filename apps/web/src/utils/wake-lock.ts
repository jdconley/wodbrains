type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  onrelease?: ((this: WakeLockSentinelLike, ev: Event) => void) | null;
};

type WakeLockProvider = {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
};

const getWakeLockProvider = (): WakeLockProvider | null => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockProvider };
  return nav.wakeLock ?? null;
};

export type WakeLockController = {
  request: () => Promise<boolean>;
  release: () => Promise<void>;
  handleVisibilityChange: () => void;
  isSupported: () => boolean;
  isActive: () => boolean;
};

export const createWakeLockController = (): WakeLockController => {
  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;

  const isSupported = () => !!getWakeLockProvider()?.request;
  const isActive = () => !!sentinel;

  const request = async () => {
    wanted = true;
    if (!isSupported()) return false;
    if (sentinel && !sentinel.released) return true;
    try {
      const provider = getWakeLockProvider();
      if (!provider) return false;
      sentinel = await provider.request('screen');
      sentinel.onrelease = () => {
        sentinel = null;
        if (wanted && document.visibilityState === 'visible') {
          void request();
        }
      };
      return true;
    } catch {
      sentinel = null;
      return false;
    }
  };

  const release = async () => {
    wanted = false;
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch {
      // ignore
    }
    sentinel = null;
  };

  const handleVisibilityChange = () => {
    if (!wanted) return;
    if (document.visibilityState === 'visible' && !sentinel) {
      void request();
    }
  };

  return { request, release, handleVisibilityChange, isSupported, isActive };
};

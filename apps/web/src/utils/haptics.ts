const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canVibrate = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.vibrate === 'function' &&
  !prefersReducedMotion();

const vibrate = (pattern: number | number[]) => {
  if (!canVibrate()) return;
  navigator.vibrate(pattern);
};

const rumblePattern = [8, 120];
const rumbleIntervalMs = 600;
let rumbleIntervalId: ReturnType<typeof setInterval> | null = null;

export const haptics = {
  light: () => vibrate(10),
  medium: () => vibrate(25),
  heavy: () => vibrate(50),
  tick: () => vibrate(5),
  success: () => vibrate([30, 50, 30]),
  error: () => vibrate([50, 30, 50]),
  celebration: () => vibrate([50, 30, 50, 30, 100]),
};

export const startRumble = () => {
  if (rumbleIntervalId || !canVibrate()) return;
  vibrate(rumblePattern);
  rumbleIntervalId = setInterval(() => vibrate(rumblePattern), rumbleIntervalMs);
};

export const stopRumble = () => {
  if (rumbleIntervalId) {
    clearInterval(rumbleIntervalId);
    rumbleIntervalId = null;
  }
  if (canVibrate()) navigator.vibrate(0);
};

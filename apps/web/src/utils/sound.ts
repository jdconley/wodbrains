export type SoundKind =
  | 'countdown_tick'
  | 'countdown_go'
  | 'segment_work'
  | 'segment_break'
  | 'rep'
  | 'pause'
  | 'resume'
  | 'finish';

const storageKey = 'wodbrains.sound.enabled';

const loadEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === '0') return false;
    if (raw === '1') return true;
    return true; // default on
  } catch {
    return true;
  }
};

const saveEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(storageKey, enabled ? '1' : '0');
  } catch {
    // ignore
  }
};

const getAudioContextCtor = (): typeof AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ?? null;
};

let enabled = loadEnabled();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const ensureContext = (): AudioContext | null => {
  if (!enabled) return null;
  if (ctx) return ctx;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.18; // master volume (keep subtle)
    master.connect(ctx.destination);
    return ctx;
  } catch {
    ctx = null;
    master = null;
    return null;
  }
};

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const lastPlayedAtMs = new Map<SoundKind, number>();
const canPlay = (kind: SoundKind, minIntervalMs: number) => {
  const t = nowMs();
  const last = lastPlayedAtMs.get(kind) ?? -Infinity;
  if (t - last < minIntervalMs) return false;
  lastPlayedAtMs.set(kind, t);
  return true;
};

const scheduleTone = (opts: {
  at: number;
  freqHz: number;
  freqEndHz?: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
}) => {
  const audio = ensureContext();
  if (!audio || !master) return;

  // Try to resume if the browser suspended audio (no-op if already running).
  // If this fails (e.g. no user gesture yet), we silently skip audio.
  void audio.resume().catch(() => {
    // ignore
  });

  const startAt = Math.max(audio.currentTime, opts.at);
  const durationS = Math.max(0.01, opts.durationMs / 1000);
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freqHz, startAt);
  if (typeof opts.freqEndHz === 'number' && Number.isFinite(opts.freqEndHz)) {
    osc.frequency.linearRampToValueAtTime(opts.freqEndHz, startAt + durationS);
  }

  const peak = Math.max(0, Math.min(1, opts.gain ?? 0.9));
  const attackS = Math.min(0.01, durationS * 0.25);
  const releaseS = Math.min(0.06, durationS * 0.6);
  const sustainEnd = Math.max(startAt + attackS, startAt + durationS - releaseS);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + attackS);
  gain.gain.setValueAtTime(peak, sustainEnd);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS);

  osc.connect(gain);
  gain.connect(master);
  osc.start(startAt);
  osc.stop(startAt + durationS + 0.02);
};

export const initSounds = () => {
  const audio = ensureContext();
  if (!audio) return;
  void audio
    .resume()
    .then(() => {
      // iOS “unlock” pattern: play a silent buffer on a user gesture.
      try {
        const buffer = audio.createBuffer(1, 1, audio.sampleRate);
        const src = audio.createBufferSource();
        src.buffer = buffer;
        src.connect(audio.destination);
        src.start();
        src.stop(audio.currentTime + 0.01);
      } catch {
        // ignore
      }
    })
    .catch(() => {
      // ignore
    });
};

const playInternal = (kind: SoundKind) => {
  const audio = ensureContext();
  if (!audio) return;

  const t0 = audio.currentTime + 0.001;

  switch (kind) {
    case 'countdown_tick': {
      if (!canPlay(kind, 120)) return;
      scheduleTone({ at: t0, freqHz: 880, durationMs: 55, type: 'sine', gain: 0.9 });
      return;
    }
    case 'countdown_go': {
      if (!canPlay(kind, 200)) return;
      scheduleTone({ at: t0, freqHz: 880, durationMs: 70, type: 'triangle', gain: 1.0 });
      scheduleTone({ at: t0 + 0.08, freqHz: 1320, durationMs: 90, type: 'triangle', gain: 0.9 });
      return;
    }
    case 'segment_work': {
      if (!canPlay(kind, 120)) return;
      scheduleTone({ at: t0, freqHz: 660, durationMs: 45, type: 'square', gain: 0.45 });
      return;
    }
    case 'segment_break': {
      if (!canPlay(kind, 200)) return;
      scheduleTone({ at: t0, freqHz: 440, durationMs: 55, type: 'square', gain: 0.45 });
      scheduleTone({ at: t0 + 0.075, freqHz: 440, durationMs: 55, type: 'square', gain: 0.35 });
      return;
    }
    case 'rep': {
      // Very subtle “click” so it doesn’t get annoying at high rep counts.
      if (!canPlay(kind, 60)) return;
      scheduleTone({ at: t0, freqHz: 1046.5, durationMs: 28, type: 'triangle', gain: 0.25 });
      return;
    }
    case 'pause': {
      if (!canPlay(kind, 200)) return;
      scheduleTone({
        at: t0,
        freqHz: 700,
        freqEndHz: 420,
        durationMs: 120,
        type: 'sine',
        gain: 0.7,
      });
      return;
    }
    case 'resume': {
      if (!canPlay(kind, 200)) return;
      scheduleTone({
        at: t0,
        freqHz: 420,
        freqEndHz: 700,
        durationMs: 120,
        type: 'sine',
        gain: 0.7,
      });
      return;
    }
    case 'finish': {
      if (!canPlay(kind, 500)) return;
      scheduleTone({ at: t0, freqHz: 523.25, durationMs: 90, type: 'triangle', gain: 0.9 });
      scheduleTone({ at: t0 + 0.11, freqHz: 659.25, durationMs: 90, type: 'triangle', gain: 0.85 });
      scheduleTone({
        at: t0 + 0.22,
        freqHz: 783.99,
        durationMs: 120,
        type: 'triangle',
        gain: 0.85,
      });
      return;
    }
  }
};

export const sounds = {
  isEnabled: () => enabled,
  setEnabled: (next: boolean) => {
    enabled = !!next;
    saveEnabled(enabled);
  },
  toggleEnabled: () => {
    enabled = !enabled;
    saveEnabled(enabled);
    return enabled;
  },
  play: (kind: SoundKind) => {
    if (!enabled) return;
    playInternal(kind);
  },
};

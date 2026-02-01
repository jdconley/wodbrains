import type { TimerPlan, WorkoutBlock, WorkoutDefinition } from './types';

export function formatTimeMs(ms: number, opts?: { showTenths?: boolean }): string {
  const showTenths = opts?.showTenths ?? false;
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);

  const totalSeconds = Math.floor(abs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((abs % 1000) / 100);

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');

  let base = hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  if (showTenths) base = `${base}.${tenths}`;
  return `${sign}${base}`;
}

export type TimerDescriptionSummary =
  | { kind: 'repeat_amrap'; rounds: number; durationMs: number; isTopLevel: boolean }
  | { kind: 'amrap'; durationMs: number }
  | {
      kind: 'interval';
      rounds?: number;
      workMs?: number;
      restMs?: number;
      startWith?: 'work' | 'rest';
    }
  | { kind: 'for_time'; rounds: number }
  | { kind: 'repeat_rounds'; rounds: number }
  | { kind: 'structured' }
  | { kind: 'workout' };

export type TimerDescriptionResult = {
  title: string;
  summary: TimerDescriptionSummary;
};

const formatIntervalDescription = (
  rounds?: number,
  workMs?: number,
  restMs?: number,
  startWith?: 'work' | 'rest',
) => {
  if (!rounds || !workMs) return 'Intervals';
  const work = formatTimeMs(workMs);
  const rest = restMs && restMs > 0 ? formatTimeMs(restMs) : null;
  if (!rest) return `${rounds} rounds · ${work} work`;
  const beforeRest = startWith === 'rest';
  return `${rounds} rounds · ${beforeRest ? `${rest} rest / ${work} work` : `${work} work / ${rest} rest`}`;
};

const walkBlocks = (items: WorkoutBlock[], cb: (b: WorkoutBlock) => boolean | void): boolean => {
  for (const b of items) {
    const stop = cb(b);
    if (stop) return true;
    if (Array.isArray(b.blocks) && b.blocks.length) {
      if (walkBlocks(b.blocks, cb)) return true;
    }
  }
  return false;
};

const findAmrapDuration = (blocks: WorkoutBlock[]): number | undefined => {
  let amrapDurationMs: number | undefined;
  walkBlocks(blocks, (inner) => {
    if (
      inner.type === 'timer' &&
      (inner.mode ?? 'countup') === 'countdown' &&
      typeof inner.durationMs === 'number' &&
      (inner.label ?? '').toLowerCase().includes('amrap')
    ) {
      amrapDurationMs = inner.durationMs;
      return true;
    }
  });
  return amrapDurationMs;
};

export function buildTimerDescription(
  def?: WorkoutDefinition,
  plan?: TimerPlan,
): TimerDescriptionResult {
  const blocks = def?.blocks ?? [];

  const topLevelRepeat = blocks.length === 1 ? blocks[0] : undefined;
  if (
    topLevelRepeat?.type === 'repeat' &&
    typeof topLevelRepeat.rounds === 'number' &&
    topLevelRepeat.rounds > 0
  ) {
    const durationMs = findAmrapDuration(topLevelRepeat.blocks ?? []);
    if (durationMs && durationMs > 0) {
      return {
        title: `${topLevelRepeat.rounds} x ${formatTimeMs(durationMs)} AMRAP`,
        summary: {
          kind: 'repeat_amrap',
          rounds: topLevelRepeat.rounds,
          durationMs,
          isTopLevel: true,
        },
      };
    }
  }

  let repeatAmrap: { rounds: number; durationMs: number } | undefined;
  walkBlocks(blocks, (b) => {
    if (b.type !== 'repeat' || typeof b.rounds !== 'number' || b.rounds <= 0) return;
    const durationMs = findAmrapDuration(b.blocks ?? []);
    if (durationMs && durationMs > 0) {
      repeatAmrap = { rounds: b.rounds, durationMs };
      return true;
    }
  });
  if (repeatAmrap) {
    return {
      title: `${repeatAmrap.rounds} x ${formatTimeMs(repeatAmrap.durationMs)} AMRAP`,
      summary: {
        kind: 'repeat_amrap',
        rounds: repeatAmrap.rounds,
        durationMs: repeatAmrap.durationMs,
        isTopLevel: false,
      },
    };
  }

  let amrapDurationMs: number | undefined;
  walkBlocks(blocks, (b) => {
    if (
      b.type === 'timer' &&
      (b.mode ?? 'countup') === 'countdown' &&
      typeof b.durationMs === 'number' &&
      (b.label ?? '').toLowerCase().includes('amrap')
    ) {
      amrapDurationMs = b.durationMs;
      return true;
    }
  });
  if (amrapDurationMs && amrapDurationMs > 0) {
    return {
      title: `${formatTimeMs(amrapDurationMs)} AMRAP`,
      summary: { kind: 'amrap', durationMs: amrapDurationMs },
    };
  }

  let interval:
    | { rounds?: number; workMs?: number; restMs?: number; startWith?: 'work' | 'rest' }
    | undefined;
  walkBlocks(blocks, (b) => {
    if (b.type === 'interval') {
      interval = {
        ...(typeof b.rounds === 'number' ? { rounds: b.rounds } : {}),
        ...(typeof b.workMs === 'number' ? { workMs: b.workMs } : {}),
        ...(typeof b.restMs === 'number' ? { restMs: b.restMs } : {}),
        ...(b.startWith === 'work' || b.startWith === 'rest' ? { startWith: b.startWith } : {}),
      };
      return true;
    }
  });
  if (interval) {
    return {
      title: formatIntervalDescription(
        interval.rounds,
        interval.workMs,
        interval.restMs,
        interval.startWith,
      ),
      summary: { kind: 'interval', ...interval },
    };
  }

  let forTimeRounds: number | undefined;
  walkBlocks(blocks, (b) => {
    if (
      b.type === 'repeat' &&
      b.scoringIntent === 'for_time' &&
      typeof b.rounds === 'number' &&
      b.rounds > 0
    ) {
      forTimeRounds = b.rounds;
      return true;
    }
  });
  if (forTimeRounds && forTimeRounds > 0) {
    return {
      title: `${forTimeRounds} for time`,
      summary: { kind: 'for_time', rounds: forTimeRounds },
    };
  }

  let rounds: number | undefined;
  walkBlocks(blocks, (b) => {
    if (b.type === 'repeat' && typeof b.rounds === 'number' && b.rounds > 0) {
      rounds = b.rounds;
      return true;
    }
  });
  if (rounds && rounds > 0) {
    return { title: `${rounds} rounds`, summary: { kind: 'repeat_rounds', rounds } };
  }

  if (plan?.root?.segments?.length) {
    return { title: 'Structured workout', summary: { kind: 'structured' } };
  }
  return { title: 'Workout', summary: { kind: 'workout' } };
}

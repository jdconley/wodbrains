import type {
  DerivedRunState,
  RunEvent,
  TimerPlan,
  TimerPlanSegment,
  TimerPlanSequence,
} from './types';

function sortByTime(a: RunEvent, b: RunEvent): number {
  if (a.atMs !== b.atMs) return a.atMs - b.atMs;
  // stable-ish tie-breaker
  return a.id.localeCompare(b.id);
}

function applyUndos(events: RunEvent[]): RunEvent[] {
  const undone = new Set<string>();
  for (const e of events) {
    if (e.type === 'undo') undone.add(e.targetEventId);
  }
  return events.filter((e) => e.type !== 'undo' && !undone.has(e.id));
}

type PauseInterval = { start: number; end?: number };

function buildPauseIntervals(eventsAfterStart: RunEvent[]): PauseInterval[] {
  const intervals: PauseInterval[] = [];
  let open: PauseInterval | undefined;

  for (const e of eventsAfterStart) {
    if (e.type === 'pause') {
      if (!open) {
        open = { start: e.atMs };
        intervals.push(open);
      }
      continue;
    }

    if (e.type === 'resume') {
      if (open && open.end === undefined) {
        open.end = e.atMs;
        open = undefined;
      }
    }
  }

  return intervals;
}

function pausedDurationUpTo(t: number, pauses: PauseInterval[]): number {
  let sum = 0;
  for (const p of pauses) {
    if (p.start >= t) break;
    const end = Math.min(p.end ?? t, t);
    if (end > p.start) sum += end - p.start;
  }
  return sum;
}

export function deriveRunState(
  plan: TimerPlan,
  rawEvents: RunEvent[],
  nowMs: number,
  opts?: { timeScale?: number },
): DerivedRunState {
  const events = applyUndos([...rawEvents].sort(sortByTime));

  const start = events.find((e) => e.type === 'start');
  if (!start) {
    return {
      status: 'idle',
      nowMs,
      activeElapsedMs: 0,
      display: { elapsedMs: 0 },
      counters: [],
    };
  }

  const startedAtMs = start.atMs;
  if (nowMs < startedAtMs) {
    return {
      status: 'idle',
      nowMs,
      startedAtMs,
      activeElapsedMs: 0,
      display: { elapsedMs: 0 },
      counters: [],
    };
  }
  const eventsAfterStart = events.filter((e) => e.atMs >= startedAtMs);

  const pauses = buildPauseIntervals(eventsAfterStart);
  let openPause: PauseInterval | undefined = undefined;
  for (let i = pauses.length - 1; i >= 0; i--) {
    const p = pauses[i];
    if (p && p.end === undefined) {
      openPause = p;
      break;
    }
  }
  const pausedAtMs = openPause?.start;

  const finishEvent = eventsAfterStart.find((e) => e.type === 'finish');
  const finishedAtEventMs = finishEvent?.atMs;

  const timeScaleRaw = opts?.timeScale ?? 1;
  const timeScale = Number.isFinite(timeScaleRaw) && timeScaleRaw > 0 ? timeScaleRaw : 1;

  const computeActiveElapsedAt = (t: number) => {
    const clamped = Math.max(t, startedAtMs);
    const base = Math.max(0, clamped - startedAtMs - pausedDurationUpTo(clamped, pauses));
    return base * timeScale;
  };

  const effectiveNowMs = finishedAtEventMs ? Math.min(nowMs, finishedAtEventMs) : nowMs;
  const activeElapsedNow = computeActiveElapsedAt(effectiveNowMs);

  // Determine status + display time
  let status: DerivedRunState['status'] = pausedAtMs ? 'paused' : 'running';
  let finishedAtMs: number | undefined = finishedAtEventMs;

  const displayElapsedMs = activeElapsedNow;

  if (finishedAtEventMs) status = 'finished';

  const advanceEvents = eventsAfterStart.filter(
    (e) => e.type === 'advance' || e.type === 'advanceRound',
  ) as Array<Extract<RunEvent, { type: 'advance' | 'advanceRound' }>>;
  const advanceTimesRaw = advanceEvents
    .map((e) => computeActiveElapsedAt(e.atMs))
    .sort((a, b) => a - b);

  type StackFrame = {
    blockId: string;
    type: 'sequence' | 'repeat';
    label?: string;
    index: number;
    round?: number;
    totalRounds?: number | null;
  };
  type FlatSegment = {
    blockId: string;
    label?: string;
    type: 'timer' | 'step' | 'note';
    mode?: 'countup' | 'countdown';
    durationMs?: number;
    stack: StackFrame[];
    /** Group identifier based on innermost repeat context */
    groupId: string;
  };

  /** Compute a groupId from the stack - based on innermost repeat round or sequence position */
  const computeGroupId = (stack: StackFrame[]): string => {
    // First, check for repeat blocks - group by innermost repeat + round
    const repeatFrames = stack.filter((f) => f.type === 'repeat');
    if (repeatFrames.length > 0) {
      const innermost = repeatFrames[repeatFrames.length - 1];
      if (innermost) {
        return `repeat:${innermost.blockId}:${innermost.round ?? 1}`;
      }
    }
    // No repeat block - group by the root sequence's child index.
    // This keeps nested sequences (e.g. countdown timer + steps) together.
    const rootSeq = stack.find((f) => f.type === 'sequence');
    if (rootSeq) return `seq:${rootSeq.blockId}:${rootSeq.index}`;
    return 'root';
  };

  const flattenSegments = (segment: TimerPlanSegment, stack: StackFrame[] = []): FlatSegment[] => {
    if (segment.type === 'sequence') {
      const newFrame: StackFrame = {
        blockId: segment.blockId,
        type: 'sequence',
        index: 0,
        ...(segment.label ? { label: segment.label } : {}),
      };
      const frames = segment.segments.flatMap((child, index) =>
        flattenSegments(child, [...stack, { ...newFrame, index }]),
      );
      return frames;
    }

    if (segment.type === 'repeat') {
      const rounds = segment.rounds ?? 1;
      const out: FlatSegment[] = [];
      for (let round = 1; round <= rounds; round += 1) {
        segment.segments.forEach((child, index) => {
          const newFrame: StackFrame = {
            blockId: segment.blockId,
            type: 'repeat',
            index,
            round,
            totalRounds: segment.rounds,
            ...(segment.label ? { label: segment.label } : {}),
          };
          out.push(...flattenSegments(child, [...stack, newFrame]));
        });
      }
      return out;
    }

    if (segment.type === 'timer') {
      const seg: FlatSegment = {
        blockId: segment.blockId,
        type: 'timer',
        mode: segment.mode,
        stack,
        groupId: computeGroupId(stack),
        ...(segment.label ? { label: segment.label } : {}),
        ...(segment.durationMs !== undefined ? { durationMs: segment.durationMs } : {}),
      };
      return [seg];
    }

    if (segment.type === 'step') {
      const seg: FlatSegment = {
        blockId: segment.blockId,
        type: 'step',
        stack,
        groupId: computeGroupId(stack),
        ...(segment.label ? { label: segment.label } : {}),
      };
      return [seg];
    }

    const seg: FlatSegment = {
      blockId: segment.blockId,
      type: 'note',
      stack,
      groupId: computeGroupId(stack),
      ...(segment.text ? { label: segment.text } : {}),
    };
    return [seg];
  };

  const root = plan.root as TimerPlanSequence | undefined;
  const flatSegments = root ? flattenSegments(root) : [];

  const detectAmrapOnly = (
    rootSeq: TimerPlanSequence | undefined,
  ): { countdownBlockId: string; durationMs: number } | null => {
    if (!rootSeq) return null;
    if (rootSeq.segments.length !== 1) return null;
    const only = rootSeq.segments[0];

    const isAmrapLabel = (value: string | undefined) =>
      (value ?? '').toLowerCase().includes('amrap');

    // Common compiled shape for an "AMRAP section" countdown with nested blocks:
    // root -> sequence("AMRAP") -> timer(countdown, label "AMRAP", durationMs) -> (metadata segments...)
    if (only?.type === 'sequence' && only.segments.length > 0) {
      const first = only.segments[0];
      if (
        first?.type === 'timer' &&
        first.mode === 'countdown' &&
        typeof first.durationMs === 'number' &&
        first.durationMs > 0 &&
        (isAmrapLabel(first.label) || isAmrapLabel(only.label))
      ) {
        return { countdownBlockId: first.blockId, durationMs: first.durationMs };
      }
    }

    // Also support a direct countdown timer as the only root segment.
    if (
      only?.type === 'timer' &&
      only.mode === 'countdown' &&
      typeof only.durationMs === 'number' &&
      only.durationMs > 0 &&
      isAmrapLabel(only.label)
    ) {
      return { countdownBlockId: only.blockId, durationMs: only.durationMs };
    }

    return null;
  };

  const amrapOnly = detectAmrapOnly(root);
  const amrapCountdownLeaf =
    amrapOnly &&
    flatSegments.find(
      (s) =>
        s.type === 'timer' && s.mode === 'countdown' && s.blockId === amrapOnly.countdownBlockId,
    );

  // AMRAP-only special case:
  // - Keep the countdown timer active (advances do not skip segments)
  // - Use advances as the "round completed" counter
  // - Treat nested segments as metadata (do not execute them after time ends)
  const advanceTimes = amrapOnly && amrapCountdownLeaf ? [] : advanceTimesRaw;
  const trimTrailingIntervalRest = (segments: FlatSegment[]): FlatSegment[] => {
    if (!segments.length) return segments;
    const last = segments[segments.length - 1];
    if (!last) return segments;
    if (last.type !== 'timer' || last.mode !== 'countdown' || last.label !== 'Rest')
      return segments;

    const lastRepeatFrame = [...last.stack].reverse().find((frame) => frame.type === 'repeat');
    if (!lastRepeatFrame) return segments;

    const hasMatchingWork = segments.slice(0, -1).some((segment) => {
      if (segment.type !== 'timer' || segment.mode !== 'countdown' || segment.label !== 'Work')
        return false;
      return segment.stack.some(
        (frame) =>
          frame.type === 'repeat' &&
          frame.blockId === lastRepeatFrame.blockId &&
          frame.round === lastRepeatFrame.round,
      );
    });

    if (!hasMatchingWork) return segments;
    return segments.slice(0, -1);
  };
  const trimTrailingRepeatRest = (segments: FlatSegment[]): FlatSegment[] => {
    if (!segments.length) return segments;
    const last = segments[segments.length - 1];
    if (!last) return segments;
    if (last.type !== 'timer' || last.mode !== 'countdown' || last.label !== 'Rest')
      return segments;

    const lastRepeatFrame = [...last.stack].reverse().find((frame) => frame.type === 'repeat');
    if (!lastRepeatFrame) return segments;
    if (typeof lastRepeatFrame.totalRounds !== 'number') return segments;
    if (lastRepeatFrame.round !== lastRepeatFrame.totalRounds) return segments;

    const hasMatchingWork = segments.slice(0, -1).some((segment) => {
      if (segment.type !== 'timer' || segment.mode !== 'countdown' || segment.label === 'Rest')
        return false;
      return segment.stack.some(
        (frame) =>
          frame.type === 'repeat' &&
          frame.blockId === lastRepeatFrame.blockId &&
          frame.round === lastRepeatFrame.round,
      );
    });
    if (!hasMatchingWork) return segments;
    return segments.slice(0, -1);
  };
  const baseSegments = amrapOnly && amrapCountdownLeaf ? [amrapCountdownLeaf] : flatSegments;
  const trimmedSegments = trimTrailingRepeatRest(trimTrailingIntervalRest(baseSegments));
  const runnableSegments = trimmedSegments.filter((seg) => seg.type !== 'note');
  const planHasAnyTimer = flatSegments.some((s) => s.type === 'timer');
  const hasCountdownTimer = flatSegments.some(
    (s) => s.type === 'timer' && s.mode === 'countdown' && (s.durationMs ?? 0) > 0,
  );
  let activeSegment: FlatSegment | undefined;
  let segmentElapsedMs = 0;
  let segmentRemainingMs: number | undefined = undefined;
  let offset = 0;
  let advanceIndex = 0;
  let skipGroupId: string | undefined = undefined; // Track which group to skip past

  for (let segIdx = 0; segIdx < runnableSegments.length; segIdx++) {
    const seg = runnableSegments[segIdx];
    if (!seg) continue;
    const nextAdvance = advanceTimes[advanceIndex];

    // If we're skipping a group, continue until we find a different groupId
    if (skipGroupId !== undefined && seg.groupId === skipGroupId) {
      continue;
    }
    skipGroupId = undefined; // Reset skip once we're past the group

    if (seg.type === 'timer' && seg.mode === 'countdown') {
      const duration = Math.max(0, seg.durationMs ?? 0);
      const end = offset + duration;
      if (nextAdvance !== undefined && nextAdvance < end) {
        offset = nextAdvance;
        advanceIndex += 1;
        // Skip to next group instead of just next segment
        skipGroupId = seg.groupId;
        continue;
      }
      if (activeElapsedNow < end) {
        activeSegment = seg;
        segmentElapsedMs = Math.max(0, activeElapsedNow - offset);
        segmentRemainingMs = Math.max(0, duration - segmentElapsedMs);
        break;
      }
      offset = end;
      continue;
    }

    if (seg.type === 'timer' && seg.mode === 'countup') {
      if (nextAdvance !== undefined && nextAdvance >= offset && nextAdvance <= activeElapsedNow) {
        offset = nextAdvance;
        advanceIndex += 1;
        // Skip to next group instead of just next segment
        skipGroupId = seg.groupId;
        continue;
      }
      activeSegment = seg;
      segmentElapsedMs = Math.max(0, activeElapsedNow - offset);
      break;
    }

    // Steps and notes (manual mode)
    if (nextAdvance !== undefined && nextAdvance >= offset && nextAdvance <= activeElapsedNow) {
      offset = nextAdvance;
      advanceIndex += 1;
      // Skip to next group instead of just next segment
      skipGroupId = seg.groupId;
      continue;
    }
    activeSegment = seg;
    segmentElapsedMs = 0;
    break;
  }

  if (!activeSegment && status !== 'finished') {
    status = 'finished';
    finishedAtMs = finishedAtMs ?? nowMs;
  }

  const defaultCounters =
    activeSegment?.stack
      .filter((frame) => frame.type === 'repeat')
      .map((frame) => ({
        blockId: frame.blockId,
        label: frame.label ?? 'Round',
        current: frame.round ?? 1,
        target: frame.totalRounds ?? null,
      })) ?? [];

  const amrapRoundCounter = (() => {
    if (!amrapOnly || !amrapCountdownLeaf) return null;
    const completedRounds = advanceEvents.filter(
      (e) => computeActiveElapsedAt(e.atMs) <= activeElapsedNow,
    ).length;
    return {
      blockId: amrapCountdownLeaf.blockId,
      label: 'Round',
      current: Math.max(1, completedRounds + 1),
      target: null,
    };
  })();

  const counters = amrapRoundCounter ? [amrapRoundCounter] : defaultCounters;

  const cursor = activeSegment
    ? {
        activeBlockId: activeSegment.blockId,
        path: [...activeSegment.stack.map((frame) => frame.blockId), activeSegment.blockId],
        stack: activeSegment.stack,
      }
    : { path: [], stack: [] };

  const segment: DerivedRunState['segment'] =
    activeSegment &&
    (activeSegment.type === 'timer' ||
      activeSegment.type === 'step' ||
      activeSegment.type === 'note')
      ? {
          blockId: activeSegment.blockId,
          type: activeSegment.type,
          mode:
            activeSegment.type === 'timer'
              ? activeSegment.mode === 'countdown'
                ? 'countdown'
                : 'countup'
              : planHasAnyTimer
                ? 'manual'
                : 'countup',
          elapsedMs:
            activeSegment.type === 'timer'
              ? segmentElapsedMs
              : planHasAnyTimer
                ? 0
                : activeElapsedNow,
          ...(activeSegment.label ? { label: activeSegment.label } : {}),
          ...(segmentRemainingMs !== undefined ? { remainingMs: segmentRemainingMs } : {}),
        }
      : undefined;

  // Compute currentGroup - find all non-note segments in the same group as activeSegment
  let currentGroup: DerivedRunState['currentGroup'] = undefined;
  if (activeSegment) {
    const groupId = activeSegment.groupId;
    const groupSegments = trimmedSegments.filter((s) => s.groupId === groupId && s.type !== 'note');

    // Get the innermost repeat frame for the title
    const repeatFrames = activeSegment.stack.filter((f) => f.type === 'repeat');
    const innerRepeat = repeatFrames[repeatFrames.length - 1];
    const title = innerRepeat
      ? `${innerRepeat.label ?? 'Round'} ${innerRepeat.round ?? 1}`
      : 'Workout';

    currentGroup = {
      groupId,
      title,
      steps: groupSegments.map((s) => ({
        blockId: s.blockId,
        label:
          s.label ??
          (s.type === 'timer' ? (s.mode === 'countdown' ? 'Countdown' : 'Timer') : 'Step'),
        isActive: s.blockId === activeSegment.blockId,
      })),
    };
  }

  const display = { elapsedMs: displayElapsedMs };

  const splitEvents = eventsAfterStart.filter((e) => e.type === 'split') as Array<
    Extract<RunEvent, { type: 'split' }>
  >;
  const splits = splitEvents.map((e, index) => {
    const elapsedMs = computeActiveElapsedAt(e.atMs);
    const prevElapsedMs = index > 0 ? computeActiveElapsedAt(splitEvents[index - 1]!.atMs) : 0;
    return {
      id: e.id,
      atMs: e.atMs,
      elapsedMs,
      deltaMs: Math.max(0, elapsedMs - prevElapsedMs),
      ...(e.label ? { label: e.label } : {}),
    };
  });

  const state: DerivedRunState = {
    status,
    nowMs,
    startedAtMs,
    activeElapsedMs: activeElapsedNow,
    display,
    cursor,
    counters,
    isAutoAdvancing: !!amrapOnly || hasCountdownTimer,
    splits,
    ...(segment ? { segment } : {}),
    ...(currentGroup ? { currentGroup } : {}),
  };

  if (pausedAtMs !== undefined) state.pausedAtMs = pausedAtMs;
  if (finishedAtMs !== undefined) state.finishedAtMs = finishedAtMs;

  return state;
}

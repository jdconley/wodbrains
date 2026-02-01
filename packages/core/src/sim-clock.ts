export type SyncSample = {
  serverNowMonoMs: number;
  clientPerfNowMs: number;
};

export type FixedStepConfig = {
  tickMs: number;
  maxCatchupTicks: number;
  maxCorrectionPerTickMs: number;
};

export type FixedStepState = {
  simNowMs: number;
  accumulatorMs: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function updateMonotonicOffset(
  prevOffsetMs: number | null,
  sample: SyncSample,
  smoothing = 0.15,
): number {
  const target = sample.serverNowMonoMs - sample.clientPerfNowMs;
  if (prevOffsetMs == null || !Number.isFinite(prevOffsetMs)) return target;
  const blend = clamp(smoothing, 0, 1);
  return prevOffsetMs + (target - prevOffsetMs) * blend;
}

export function advanceFixedStep(
  state: FixedStepState,
  dtMs: number,
  targetNowMs: number,
  config: FixedStepConfig,
): { state: FixedStepState; ticks: number } {
  const safeDt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  const total = state.accumulatorMs + safeDt;
  const tickMs = Math.max(1, Math.floor(config.tickMs));
  const maxCatchupTicks = Math.max(1, Math.floor(config.maxCatchupTicks));
  const ticksWanted = Math.floor(total / tickMs);
  const ticks = Math.min(ticksWanted, maxCatchupTicks);
  const accumulatorMs = total - ticks * tickMs;
  let simNowMs = state.simNowMs;

  const correctionBound = Math.max(0, config.maxCorrectionPerTickMs);
  for (let i = 0; i < ticks; i += 1) {
    const error = targetNowMs - simNowMs;
    const correction = clamp(error, -correctionBound, correctionBound);
    simNowMs += tickMs + correction;
  }

  return {
    state: { simNowMs, accumulatorMs },
    ticks,
  };
}

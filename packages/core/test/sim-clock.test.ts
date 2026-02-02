import { describe, expect, it } from 'vitest';
import { advanceFixedStep, updateMonotonicOffset } from '../src';

describe('sim clock', () => {
  it('accumulates dt into fixed ticks', () => {
    const result = advanceFixedStep({ simNowMs: 0, accumulatorMs: 0 }, 250, 0, {
      tickMs: 100,
      maxCatchupTicks: 10,
      maxCorrectionPerTickMs: 0,
    });
    expect(result.ticks).toBe(2);
    expect(result.state.simNowMs).toBe(200);
    expect(result.state.accumulatorMs).toBe(50);
  });

  it('respects maxCatchupTicks and keeps backlog', () => {
    const result = advanceFixedStep({ simNowMs: 0, accumulatorMs: 0 }, 1000, 0, {
      tickMs: 100,
      maxCatchupTicks: 3,
      maxCorrectionPerTickMs: 0,
    });
    expect(result.ticks).toBe(3);
    expect(result.state.simNowMs).toBe(300);
    expect(result.state.accumulatorMs).toBe(700);
  });

  it('applies bounded drift correction per tick', () => {
    const result = advanceFixedStep({ simNowMs: 0, accumulatorMs: 0 }, 100, 500, {
      tickMs: 100,
      maxCatchupTicks: 10,
      maxCorrectionPerTickMs: 20,
    });
    expect(result.state.simNowMs).toBe(120);
  });

  it('smooths monotonic offset updates', () => {
    const initial = updateMonotonicOffset(null, {
      serverNowMonoMs: 1000,
      clientPerfNowMs: 900,
    });
    expect(initial).toBe(100);

    const smoothed = updateMonotonicOffset(
      initial,
      {
        serverNowMonoMs: 1050,
        clientPerfNowMs: 900,
      },
      0.2,
    );
    // Target is 150; 20% step from 100 -> 110
    expect(smoothed).toBe(110);
  });
});

import { describe, expect, it } from 'vitest';
import { LATEST_DATA_VERSION, deriveRunState, type RunEvent, type TimerPlan } from '../src';

const basePlan = (segments: TimerPlan['root']['segments']): TimerPlan => ({
  id: 'plan',
  title: 'Test',
  schemaVersion: LATEST_DATA_VERSION,
  root: {
    type: 'sequence',
    blockId: 'root',
    label: 'Workout',
    segments,
  },
});

describe('deriveRunState', () => {
  it('pre-start stays idle until start time', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 1000 }];

    const s = deriveRunState(plan, events, 500);
    expect(s.status).toBe('idle');
    expect(s.startedAtMs).toBe(1000);
    expect(s.activeElapsedMs).toBe(0);
  });

  it('timeScale multiplies elapsed time', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];

    const s = deriveRunState(plan, events, 1000, { timeScale: 2 });
    expect(s.activeElapsedMs).toBe(2000);
    expect(s.display.elapsedMs).toBe(2000);
  });

  it('countup: start -> running elapsed', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 1000 }];

    const s = deriveRunState(plan, events, 1500);
    expect(s.status).toBe('running');
    expect(s.activeElapsedMs).toBe(500);
    expect(s.display.elapsedMs).toBe(500);
    expect(s.segment?.mode).toBe('countup');
  });

  it('countup: pause freezes elapsed until resume', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [
      { id: 'start', type: 'start', atMs: 1000 },
      { id: 'pause', type: 'pause', atMs: 1600 },
    ];

    const paused = deriveRunState(plan, events, 3000);
    expect(paused.status).toBe('paused');
    expect(paused.activeElapsedMs).toBe(600);

    const resumed = deriveRunState(
      plan,
      [...events, { id: 'resume', type: 'resume', atMs: 4000 }],
      5000,
    );
    expect(resumed.status).toBe('running');
    // Active time: (5000-1000) - (4000-1600) = 4000 - 2400 = 1600
    expect(resumed.activeElapsedMs).toBe(1600);
  });

  it('countdown: finishes when remaining reaches 0', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countdown', durationMs: 3000 }]);
    const events: RunEvent[] = [{ id: 'start', type: 'start', atMs: 0 }];

    const mid = deriveRunState(plan, events, 2500);
    expect(mid.status).toBe('running');
    expect(mid.segment?.remainingMs).toBe(500);

    const done = deriveRunState(plan, events, 4000);
    expect(done.status).toBe('finished');
    expect(done.segment?.remainingMs ?? 0).toBe(0);
  });

  it('amrap-only: countdown stays active and advance increments rounds', () => {
    const plan = basePlan([
      {
        type: 'sequence',
        blockId: 'amrap_seq',
        label: 'AMRAP',
        segments: [
          {
            type: 'timer',
            blockId: 'amrap_timer',
            label: 'AMRAP',
            mode: 'countdown',
            durationMs: 3000,
          },
          { type: 'step', blockId: 's1', label: '10 burpees' },
        ],
      },
    ]);
    const events: RunEvent[] = [{ id: 'start', type: 'start', atMs: 0 }];

    const s1 = deriveRunState(plan, events, 500);
    expect(s1.status).toBe('running');
    expect(s1.segment?.mode).toBe('countdown');
    expect(s1.counters[0]?.label).toBe('Round');
    expect(s1.counters[0]?.current).toBe(1);

    const s2 = deriveRunState(plan, [...events, { id: 'a1', type: 'advance', atMs: 1000 }], 1500);
    expect(s2.segment?.mode).toBe('countdown');
    expect(s2.counters[0]?.current).toBe(2);

    const done = deriveRunState(plan, [...events, { id: 'a1', type: 'advance', atMs: 1000 }], 4000);
    expect(done.status).toBe('finished');
  });

  it('advance moves through manual segments', () => {
    const plan = basePlan([
      { type: 'step', blockId: 's1', label: 'Push-ups' },
      { type: 'step', blockId: 's2', label: 'Sit-ups' },
    ]);
    const events: RunEvent[] = [
      { id: 'start', type: 'start', atMs: 0 },
      { id: 'a1', type: 'advance', atMs: 1000 },
    ];

    const s = deriveRunState(plan, events, 1500);
    expect(s.segment?.blockId).toBe('s2');
  });

  it('repeat segments produce nested counters', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 2,
        segments: [{ type: 'timer', blockId: 't1', mode: 'countup' }],
      },
    ]);
    const events: RunEvent[] = [{ id: 'start', type: 'start', atMs: 0 }];

    const s = deriveRunState(plan, events, 500);
    expect(s.counters.length).toBe(1);
    expect(s.counters[0]?.current).toBe(1);
    expect(s.counters[0]?.target).toBe(2);
  });

  it('interval rest before yields Rest first', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 2,
        segments: [
          {
            type: 'sequence',
            blockId: 'seq1',
            segments: [
              {
                type: 'timer',
                blockId: 'rest',
                label: 'Rest',
                mode: 'countdown',
                durationMs: 1000,
              },
              {
                type: 'timer',
                blockId: 'work',
                label: 'Work',
                mode: 'countdown',
                durationMs: 1000,
              },
            ],
          },
        ],
      },
    ]);
    const events: RunEvent[] = [{ id: 'start', type: 'start', atMs: 0 }];

    const s = deriveRunState(plan, events, 500);
    expect(s.segment?.label).toBe('Rest');
  });

  it('interval rest after yields Work first', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 2,
        segments: [
          {
            type: 'sequence',
            blockId: 'seq1',
            segments: [
              {
                type: 'timer',
                blockId: 'work',
                label: 'Work',
                mode: 'countdown',
                durationMs: 1000,
              },
              {
                type: 'timer',
                blockId: 'rest',
                label: 'Rest',
                mode: 'countdown',
                durationMs: 1000,
              },
            ],
          },
        ],
      },
    ]);
    const events: RunEvent[] = [{ id: 'start', type: 'start', atMs: 0 }];

    const s = deriveRunState(plan, events, 500);
    expect(s.segment?.label).toBe('Work');
  });

  it('trims trailing interval rest when it is last', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 1,
        segments: [
          {
            type: 'sequence',
            blockId: 'seq1',
            segments: [
              {
                type: 'timer',
                blockId: 'work',
                label: 'Work',
                mode: 'countdown',
                durationMs: 1000,
              },
              {
                type: 'timer',
                blockId: 'rest',
                label: 'Rest',
                mode: 'countdown',
                durationMs: 1000,
              },
            ],
          },
        ],
      },
    ]);
    const events: RunEvent[] = [{ id: 'start', type: 'start', atMs: 0 }];

    const s = deriveRunState(plan, events, 1500);
    expect(s.status).toBe('finished');
  });

  it('does not trim trailing rest when followed by more segments', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 1,
        segments: [
          {
            type: 'sequence',
            blockId: 'seq1',
            segments: [
              {
                type: 'timer',
                blockId: 'work',
                label: 'Work',
                mode: 'countdown',
                durationMs: 1000,
              },
              {
                type: 'timer',
                blockId: 'rest',
                label: 'Rest',
                mode: 'countdown',
                durationMs: 1000,
              },
            ],
          },
        ],
      },
      { type: 'step', blockId: 's1', label: 'After' },
    ]);
    const events: RunEvent[] = [{ id: 'start', type: 'start', atMs: 0 }];

    const s = deriveRunState(plan, events, 1500);
    expect(s.status).toBe('running');
    expect(s.segment?.label).toBe('Rest');
  });
});

describe('isAutoAdvancing', () => {
  it('returns true for countdown timer with duration', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countdown', durationMs: 60000 }]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];
    const s = deriveRunState(plan, events, 1000);
    expect(s.isAutoAdvancing).toBe(true);
  });

  it('returns true for interval work/rest pattern', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 3,
        segments: [
          { type: 'timer', blockId: 'w1', mode: 'countdown', durationMs: 30000, label: 'Work' },
          { type: 'timer', blockId: 'r1', mode: 'countdown', durationMs: 10000, label: 'Rest' },
        ],
      },
    ]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];
    const s = deriveRunState(plan, events, 1000);
    expect(s.isAutoAdvancing).toBe(true);
  });

  it('returns false for countup timer', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];
    const s = deriveRunState(plan, events, 1000);
    expect(s.isAutoAdvancing).toBe(false);
  });

  it('returns false for steps-only workout', () => {
    const plan = basePlan([
      { type: 'step', blockId: 's1', label: '10 push-ups' },
      { type: 'step', blockId: 's2', label: '10 squats' },
    ]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];
    const s = deriveRunState(plan, events, 1000);
    expect(s.isAutoAdvancing).toBe(false);
  });
});

describe('splits', () => {
  it('extracts split events with elapsed times', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [
      { id: 'e1', type: 'start', atMs: 0 },
      { id: 's1', type: 'split', atMs: 1000 },
      { id: 's2', type: 'split', atMs: 2500 },
    ];
    const s = deriveRunState(plan, events, 3000);
    expect(s.splits).toHaveLength(2);
    expect(s.splits?.[0]).toEqual({ id: 's1', atMs: 1000, elapsedMs: 1000, deltaMs: 1000 });
    expect(s.splits?.[1]).toEqual({ id: 's2', atMs: 2500, elapsedMs: 2500, deltaMs: 1500 });
  });

  it('returns empty array when no splits', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];
    const s = deriveRunState(plan, events, 1000);
    expect(s.splits).toEqual([]);
  });

  it('accounts for pause time in split elapsed', () => {
    const plan = basePlan([{ type: 'timer', blockId: 't1', mode: 'countup' }]);
    const events: RunEvent[] = [
      { id: 'e1', type: 'start', atMs: 0 },
      { id: 'p1', type: 'pause', atMs: 1000 },
      { id: 'r1', type: 'resume', atMs: 2000 },
      { id: 's1', type: 'split', atMs: 3000 },
    ];
    const s = deriveRunState(plan, events, 3500);
    expect(s.splits?.[0]?.elapsedMs).toBe(2000);
  });
});

describe('counter visibility', () => {
  it('hides counter when target is 1 (single round)', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 1,
        segments: [{ type: 'step', blockId: 's1', label: 'Do something' }],
      },
    ]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];
    const s = deriveRunState(plan, events, 1000);
    expect(s.counters[0]?.target).toBe(1);
  });

  it('shows counter when target > 1', () => {
    const plan = basePlan([
      {
        type: 'repeat',
        blockId: 'r1',
        rounds: 3,
        segments: [{ type: 'step', blockId: 's1', label: 'Do something' }],
      },
    ]);
    const events: RunEvent[] = [{ id: 'e1', type: 'start', atMs: 0 }];
    const s = deriveRunState(plan, events, 1000);
    expect(s.counters[0]?.current).toBe(1);
    expect(s.counters[0]?.target).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { buildTimerDescription, type WorkoutDefinition } from '../src';

describe('buildTimerDescription', () => {
  it('uses top-level repeat AMRAP summary for title', () => {
    const def: WorkoutDefinition = {
      id: 'def-1',
      blocks: [
        {
          type: 'repeat',
          blockId: 'repeat-1',
          label: 'Set',
          rounds: 3,
          blocks: [
            {
              type: 'timer',
              blockId: 'timer-1',
              label: 'AMRAP',
              mode: 'countdown',
              durationMs: 180000,
            },
          ],
        },
      ],
    };

    const result = buildTimerDescription(def);
    expect(result.title).toBe('3 x 3:00 AMRAP');
    expect(result.summary.kind).toBe('repeat_amrap');
    if (result.summary.kind === 'repeat_amrap') {
      expect(result.summary.rounds).toBe(3);
      expect(result.summary.durationMs).toBe(180000);
      expect(result.summary.isTopLevel).toBe(true);
    }
  });

  it('marks nested repeat AMRAP as not top-level', () => {
    const def: WorkoutDefinition = {
      id: 'def-2',
      blocks: [
        {
          type: 'sequence',
          blockId: 'seq-1',
          blocks: [
            {
              type: 'repeat',
              blockId: 'repeat-1',
              rounds: 2,
              blocks: [
                {
                  type: 'timer',
                  blockId: 'timer-1',
                  label: 'AMRAP',
                  mode: 'countdown',
                  durationMs: 60000,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = buildTimerDescription(def);
    expect(result.title).toBe('2 x 1:00 AMRAP');
    expect(result.summary.kind).toBe('repeat_amrap');
    if (result.summary.kind === 'repeat_amrap') {
      expect(result.summary.isTopLevel).toBe(false);
    }
  });
});

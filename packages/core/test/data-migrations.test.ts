import { describe, expect, it } from 'vitest';
import { LATEST_DATA_VERSION, upgradeDefinitionData, upgradeRunData } from '../src/data-migrations';

describe('data migrations', () => {
  it('upgrades v1 definition to latest with blockIds', () => {
    const v1Def = { id: 'def1', blocks: [{ type: 'step', label: 'Push-ups' }] };
    const v1Plan = { id: 'plan1', mode: 'countup' };

    const result = upgradeDefinitionData({
      dataVersion: 1,
      workoutDefinition: v1Def,
      timerPlan: v1Plan,
    });

    expect(result.dataVersion).toBe(LATEST_DATA_VERSION);
    expect(result.workoutDefinition.schemaVersion).toBe(LATEST_DATA_VERSION);
    expect(result.timerPlan.schemaVersion).toBe(LATEST_DATA_VERSION);
    expect(result.workoutDefinition.blocks[0].blockId).toBeDefined();
  });

  it('removes null rounds when upgrading v2 definition', () => {
    const v2Def = {
      id: 'def2',
      schemaVersion: 2,
      blocks: [{ type: 'repeat', blockId: 'b1', rounds: null, blocks: [] }],
    };
    const v2Plan = {
      id: 'plan2',
      schemaVersion: 2,
      root: { type: 'sequence', blockId: 'root', segments: [] },
    };

    const result = upgradeDefinitionData({
      dataVersion: 2,
      workoutDefinition: v2Def,
      timerPlan: v2Plan,
    });

    const block = result.workoutDefinition.blocks?.[0] as { rounds?: unknown } | undefined;
    expect(block?.rounds).toBeUndefined();
    expect(result.workoutDefinition.schemaVersion).toBe(LATEST_DATA_VERSION);
    expect(result.timerPlan.schemaVersion).toBe(LATEST_DATA_VERSION);
  });

  it('upgrades v1 run events and is idempotent', () => {
    const v1Plan = { id: 'plan1', mode: 'countup' };
    const v1Events = [{ id: 'e1', type: 'advanceRound', atMs: 0 }];

    const result = upgradeRunData({ dataVersion: 1, timerPlan: v1Plan, events: v1Events });

    expect(result.dataVersion).toBe(LATEST_DATA_VERSION);
    expect(result.timerPlan.schemaVersion).toBe(LATEST_DATA_VERSION);
    expect(result.events[0].type).toBe('advance');

    const result2 = upgradeRunData({
      dataVersion: result.dataVersion,
      timerPlan: result.timerPlan,
      events: result.events,
    });

    expect(result2).toEqual(result);
  });

  it('converts legacy scoring to nested blocks when upgrading v3 definitions', () => {
    const v3DefForTime = {
      id: 'def3_for_time',
      schemaVersion: 3,
      blocks: [{ type: 'step', blockId: 's1', label: 'Push-ups' }],
      scoring: { type: 'for_time', rounds: 5 },
    };
    const v3Plan = {
      id: 'plan3',
      schemaVersion: 3,
      root: { type: 'sequence', blockId: 'root', segments: [] },
    };

    const upgradedForTime = upgradeDefinitionData({
      dataVersion: 3,
      workoutDefinition: v3DefForTime,
      timerPlan: v3Plan,
    });
    expect(upgradedForTime.dataVersion).toBe(LATEST_DATA_VERSION);
    expect((upgradedForTime.workoutDefinition as any).scoring).toBeUndefined();
    expect(upgradedForTime.workoutDefinition.blocks?.[0]?.type).toBe('repeat');
    expect(upgradedForTime.workoutDefinition.blocks?.[0]?.rounds).toBe(5);
    expect((upgradedForTime.workoutDefinition.blocks?.[0] as any)?.scoringIntent).toBe('for_time');

    const v3DefAmrap = {
      id: 'def3_amrap',
      schemaVersion: 3,
      blocks: [{ type: 'step', blockId: 's1', label: 'Air squats' }],
      scoring: { type: 'amrap', timeCapMs: 600_000 },
    };

    const upgradedAmrap = upgradeDefinitionData({
      dataVersion: 3,
      workoutDefinition: v3DefAmrap,
      timerPlan: v3Plan,
    });
    expect(upgradedAmrap.dataVersion).toBe(LATEST_DATA_VERSION);
    expect((upgradedAmrap.workoutDefinition as any).scoring).toBeUndefined();
    expect(upgradedAmrap.workoutDefinition.blocks?.[0]?.type).toBe('timer');
    expect(upgradedAmrap.workoutDefinition.blocks?.[0]?.mode).toBe('countdown');
    expect(upgradedAmrap.workoutDefinition.blocks?.[0]?.label).toBe('AMRAP');
  });

  it('backfills for_time scoringIntent when upgrading v4 definitions', () => {
    const v4DefForTime = {
      id: 'def4_for_time',
      schemaVersion: 4,
      blocks: [
        {
          type: 'repeat',
          blockId: 'r1',
          label: 'Round',
          rounds: 5,
          blocks: [{ type: 'step', blockId: 's1', label: 'Push-ups' }],
        },
      ],
    };
    const v4Plan = {
      id: 'plan4',
      schemaVersion: 4,
      root: { type: 'sequence', blockId: 'root', segments: [] },
    };

    const upgraded = upgradeDefinitionData({
      dataVersion: 4,
      workoutDefinition: v4DefForTime,
      timerPlan: v4Plan,
    });
    expect(upgraded.dataVersion).toBe(LATEST_DATA_VERSION);
    expect(upgraded.workoutDefinition.schemaVersion).toBe(LATEST_DATA_VERSION);
    expect((upgraded.workoutDefinition.blocks?.[0] as any)?.scoringIntent).toBe('for_time');
  });
});

import { LATEST_DATA_VERSION } from './data-migrations';
import type {
  TimerPlan,
  TimerPlanSegment,
  TimerPlanSequence,
  WorkoutBlock,
  WorkoutDefinition,
} from './types';

const createId = () => {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `block_${Math.random().toString(36).slice(2, 10)}`;
};

function blockIdOf(block: { blockId?: string }) {
  return block.blockId ?? createId();
}

function compileBlock(block: WorkoutBlock): TimerPlanSegment {
  switch (block.type) {
    case 'sequence':
      return {
        type: 'sequence',
        blockId: blockIdOf(block),
        segments: (block.blocks ?? []).map(compileBlock),
        ...(block.label ? { label: block.label } : {}),
      };
    case 'repeat':
      return {
        type: 'repeat',
        blockId: blockIdOf(block),
        rounds: block.rounds ?? null,
        segments: (block.blocks ?? []).map(compileBlock),
        ...(block.label ? { label: block.label } : {}),
      };
    case 'interval': {
      const blockId = blockIdOf(block);
      const workSegments = block.blocks?.map(compileBlock) ?? [];
      const restMs = Math.max(0, block.restMs ?? 0);
      const includeRest = restMs > 0;
      const restSegment = includeRest
        ? [
            {
              type: 'timer' as const,
              blockId: createId(),
              label: 'Rest',
              mode: 'countdown' as const,
              durationMs: restMs,
            },
          ]
        : [];
      const workMs = Math.max(0, block.workMs ?? 0);
      const workSegment =
        workMs > 0
          ? [
              {
                type: 'timer' as const,
                blockId: createId(),
                label: 'Work',
                mode: 'countdown' as const,
                durationMs: workMs,
              },
              ...workSegments,
            ]
          : [...workSegments];
      const startWithRest = block.startWith === 'rest';
      const orderedSegments = startWithRest
        ? [...restSegment, ...workSegment]
        : [...workSegment, ...restSegment];
      return {
        type: 'repeat',
        blockId,
        label: block.label ?? 'Intervals',
        rounds: block.rounds ?? null,
        segments: [
          {
            type: 'sequence',
            blockId: createId(),
            segments: orderedSegments,
          },
        ],
      };
    }
    case 'timer': {
      const blockId = blockIdOf(block);
      const mode = block.mode ?? 'countup';

      // Support countdown timers that contain steps/blocks:
      // compile as a sequence so the timer + its steps stay together.
      if (mode === 'countdown' && Array.isArray(block.blocks) && block.blocks.length > 0) {
        return {
          type: 'sequence',
          blockId,
          segments: [
            {
              type: 'timer',
              blockId: createId(),
              mode: 'countdown',
              ...(block.label ? { label: block.label } : {}),
              ...(block.durationMs === undefined ? {} : { durationMs: block.durationMs }),
            },
            ...block.blocks.map(compileBlock),
          ],
          ...(block.label ? { label: block.label } : {}),
        };
      }

      return {
        type: 'timer',
        blockId,
        mode,
        ...(block.label ? { label: block.label } : {}),
        ...(block.durationMs === undefined ? {} : { durationMs: block.durationMs }),
      };
    }
    case 'step':
      return {
        type: 'step',
        blockId: blockIdOf(block),
        label: block.label?.trim() || block.text?.trim() || 'Step',
        ...(block.prescription ? { prescription: block.prescription } : {}),
      };
    case 'note':
      return {
        type: 'note',
        blockId: blockIdOf(block),
        text: block.text ?? block.label ?? '',
      };
    default:
      throw new Error(`Unsupported block type: ${(block as any)?.type ?? 'unknown'}`);
  }
}

export function compileWorkoutDefinition(def: WorkoutDefinition): TimerPlan {
  const compiled = def.blocks.map(compileBlock);
  const rootSegments = compiled;

  const root: TimerPlanSequence = {
    type: 'sequence',
    blockId: def.id,
    label: def.title ?? 'Workout',
    segments: rootSegments,
  };

  return {
    id: def.id,
    schemaVersion: def.schemaVersion ?? LATEST_DATA_VERSION,
    root,
    ...(def.title ? { title: def.title } : {}),
  };
}

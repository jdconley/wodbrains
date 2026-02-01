import { z } from 'zod';
import type { TimerPlanRepeat, TimerPlanSegment, TimerPlanSequence, WorkoutBlock } from './types';

// ---- Primitives ----

export const UUIDSchema = z.string().min(1);

// ---- WorkoutDefinition ----

export const WorkoutPrescriptionSchema = z.object({
  reps: z.number().int().positive().optional(),
  timeMs: z.number().int().positive().optional(),
  distance: z
    .object({
      value: z.number(),
      unit: z.enum(['m', 'km', 'mi']),
    })
    .optional(),
  load: z
    .object({
      value: z.number(),
      unit: z.enum(['lb', 'kg']),
    })
    .optional(),
  calories: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const WorkoutBlockSchema: z.ZodType<WorkoutBlock> = z.lazy(() =>
  z.object({
    type: z.enum(['sequence', 'repeat', 'interval', 'timer', 'step', 'note']),
    blockId: UUIDSchema,
    label: z.string().optional(),
    blocks: z.array(z.lazy(() => WorkoutBlockSchema)).optional(),
    rounds: z.number().int().positive().optional(),
    workMs: z.number().int().positive().optional(),
    restMs: z.number().int().nonnegative().optional(),
    startWith: z.enum(['work', 'rest']).optional(),
    mode: z.enum(['countup', 'countdown']).optional(),
    durationMs: z.number().int().nonnegative().optional(),
    prescription: WorkoutPrescriptionSchema.optional(),
    text: z.string().optional(),
    scoringIntent: z.enum(['for_time']).optional(),
  }),
) as z.ZodType<WorkoutBlock>;

export const WorkoutDefinitionSchema = z.object({
  id: UUIDSchema,
  title: z.string().optional(),
  description: z.string().optional(),
  blocks: z.array(WorkoutBlockSchema),
  schemaVersion: z.number().int().positive().optional(),
});

// ---- TimerPlan ----

export const TimerPlanSequenceSchema: z.ZodType<TimerPlanSequence> = z.object({
  type: z.literal('sequence'),
  blockId: UUIDSchema,
  label: z.string().optional(),
  segments: z.array(z.lazy(() => TimerPlanSegmentSchema)),
}) as z.ZodType<TimerPlanSequence>;

export const TimerPlanRepeatSchema: z.ZodType<TimerPlanRepeat> = z.object({
  type: z.literal('repeat'),
  blockId: UUIDSchema,
  label: z.string().optional(),
  rounds: z.number().int().positive().nullable(),
  segments: z.array(z.lazy(() => TimerPlanSegmentSchema)),
}) as z.ZodType<TimerPlanRepeat>;

export const TimerPlanTimerSchema = z.object({
  type: z.literal('timer'),
  blockId: UUIDSchema,
  label: z.string().optional(),
  mode: z.enum(['countup', 'countdown']),
  durationMs: z.number().int().nonnegative().optional(),
});

export const TimerPlanStepSchema = z.object({
  type: z.literal('step'),
  blockId: UUIDSchema,
  label: z.string().min(1),
  prescription: WorkoutPrescriptionSchema.optional(),
});

export const TimerPlanNoteSchema = z.object({
  type: z.literal('note'),
  blockId: UUIDSchema,
  text: z.string(),
});

export const TimerPlanSegmentSchema: z.ZodType<TimerPlanSegment> = z.lazy(() =>
  z.discriminatedUnion('type', [
    TimerPlanSequenceSchema,
    TimerPlanRepeatSchema,
    TimerPlanTimerSchema,
    TimerPlanStepSchema,
    TimerPlanNoteSchema,
  ] as any),
) as z.ZodType<TimerPlanSegment>;

export const TimerPlanSchema = z.object({
  id: UUIDSchema,
  title: z.string().optional(),
  schemaVersion: z.number().int().positive(),
  root: TimerPlanSequenceSchema,
});

// ---- Run events + derived state ----

export const RunStatusSchema = z.enum(['idle', 'running', 'paused', 'finished']);

export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ id: UUIDSchema, type: z.literal('start'), atMs: z.number().int() }),
  z.object({ id: UUIDSchema, type: z.literal('pause'), atMs: z.number().int() }),
  z.object({ id: UUIDSchema, type: z.literal('resume'), atMs: z.number().int() }),
  z.object({ id: UUIDSchema, type: z.literal('finish'), atMs: z.number().int() }),
  z.object({ id: UUIDSchema, type: z.literal('advanceRound'), atMs: z.number().int() }),
  z.object({ id: UUIDSchema, type: z.literal('advance'), atMs: z.number().int() }),
  z.object({
    id: UUIDSchema,
    type: z.literal('split'),
    atMs: z.number().int(),
    label: z.string().optional(),
  }),
  z.object({
    id: UUIDSchema,
    type: z.literal('undo'),
    atMs: z.number().int(),
    targetEventId: UUIDSchema,
  }),
]);

export const DerivedRunStateSchema = z.object({
  status: RunStatusSchema,
  nowMs: z.number().int(),
  startedAtMs: z.number().int().optional(),
  pausedAtMs: z.number().int().optional(),
  finishedAtMs: z.number().int().optional(),
  activeElapsedMs: z.number().int(),
  display: z.object({ elapsedMs: z.number().int() }),
  segment: z
    .object({
      blockId: UUIDSchema.optional(),
      label: z.string().optional(),
      mode: z.enum(['countup', 'countdown', 'manual']),
      elapsedMs: z.number().int(),
      remainingMs: z.number().int().optional(),
    })
    .optional(),
  cursor: z
    .object({
      activeBlockId: UUIDSchema.optional(),
      path: z.array(UUIDSchema),
      stack: z.array(
        z.object({
          blockId: UUIDSchema,
          type: z.enum(['sequence', 'repeat']),
          label: z.string().optional(),
          index: z.number().int(),
          round: z.number().int().optional(),
          totalRounds: z.number().int().nullable().optional(),
        }),
      ),
    })
    .optional(),
  counters: z.array(
    z.object({
      blockId: UUIDSchema.optional(),
      label: z.string(),
      current: z.number().int(),
      target: z.number().int().nullable().optional(),
    }),
  ),
});

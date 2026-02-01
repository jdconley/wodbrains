type DefinitionUpgradeInput = {
  dataVersion: number;
  workoutDefinition: any;
  timerPlan: any;
};

type RunUpgradeInput = {
  dataVersion: number;
  timerPlan: any;
  events: any[];
};

type WorkoutBlock = {
  blockId?: string;
  type?: string;
  blocks?: WorkoutBlock[];
};

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `block_${Math.random().toString(36).slice(2, 10)}`;
};

const withSchemaVersion = <T extends Record<string, unknown>>(
  value: T,
  schemaVersion: number,
): T => ({
  ...value,
  schemaVersion,
});

function upgradeBlocks(blocks: WorkoutBlock[]): WorkoutBlock[];
function upgradeBlocks(blocks: WorkoutBlock[] | undefined): WorkoutBlock[] | undefined;
function upgradeBlocks(blocks: WorkoutBlock[] | undefined): WorkoutBlock[] | undefined {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    const next: WorkoutBlock = {
      ...block,
      blockId: block.blockId ?? createId(),
    };

    if (Array.isArray(block.blocks)) {
      next.blocks = upgradeBlocks(block.blocks);
    }

    return next;
  });
}

const upgradeWorkoutDefinition = (value: any, schemaVersion: number) => {
  if (!value || typeof value !== 'object') return value;
  const def = value as Record<string, unknown>;
  const blocks = upgradeBlocks(def.blocks as WorkoutBlock[] | undefined);
  return withSchemaVersion({ ...def, ...(blocks ? { blocks } : {}) }, schemaVersion);
};

const upgradeTimerPlan = (value: any, schemaVersion: number) => {
  if (!value || typeof value !== 'object') return value;
  const plan = value as Record<string, any>;

  if (plan.root && typeof plan.root === 'object') {
    return withSchemaVersion({ ...plan }, schemaVersion);
  }

  const rootBlockId = typeof plan.id === 'string' ? plan.id : createId();
  const segments: Array<Record<string, unknown>> = [];

  if (plan.mode === 'countdown') {
    segments.push({
      type: 'timer',
      blockId: createId(),
      label: 'Countdown',
      mode: 'countdown',
      durationMs: plan.durationMs ?? 0,
    });
  } else if (plan.mode === 'intervals' && plan.intervals) {
    segments.push({
      type: 'repeat',
      blockId: createId(),
      label: 'Intervals',
      rounds: plan.intervals.rounds ?? 1,
      segments: [
        {
          type: 'sequence',
          blockId: createId(),
          segments: [
            {
              type: 'timer',
              blockId: createId(),
              label: 'Work',
              mode: 'countdown',
              durationMs: plan.intervals.workMs ?? 0,
            },
            {
              type: 'timer',
              blockId: createId(),
              label: 'Rest',
              mode: 'countdown',
              durationMs: plan.intervals.restMs ?? 0,
            },
          ],
        },
      ],
    });
  } else {
    segments.push({
      type: 'timer',
      blockId: createId(),
      label: 'Timer',
      mode: 'countup',
    });
  }

  if (Array.isArray(plan.steps)) {
    plan.steps.forEach((step: { label?: string }) => {
      if (step?.label) {
        segments.push({
          type: 'step',
          blockId: createId(),
          label: step.label,
        });
      }
    });
  }

  const root = {
    type: 'sequence',
    blockId: rootBlockId,
    label: typeof plan.title === 'string' ? plan.title : 'Workout',
    segments,
  };

  return withSchemaVersion(
    {
      id: plan.id ?? createId(),
      title: plan.title,
      root,
    },
    schemaVersion,
  );
};

const upgradeRunEvents = (events: any[]) =>
  events.map((event) => {
    if (event && typeof event === 'object' && event.type === 'advanceRound') {
      return { ...event, type: 'advance' };
    }
    return event;
  });

export const from = 1;
export const to = 2;

export const upgradeDefinition = (input: DefinitionUpgradeInput): DefinitionUpgradeInput => ({
  dataVersion: to,
  workoutDefinition: upgradeWorkoutDefinition(input.workoutDefinition, to),
  timerPlan: upgradeTimerPlan(input.timerPlan, to),
});

export const upgradeRun = (input: RunUpgradeInput): RunUpgradeInput => ({
  dataVersion: to,
  timerPlan: upgradeTimerPlan(input.timerPlan, to),
  events: upgradeRunEvents(input.events ?? []),
});

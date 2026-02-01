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
  label?: unknown;
  blocks?: WorkoutBlock[];
  rounds?: unknown;
  scoringIntent?: unknown;
};

const withSchemaVersion = <T extends Record<string, unknown>>(
  value: T,
  schemaVersion: number,
): T => ({
  ...value,
  schemaVersion,
});

const isForTimeWrapperRepeat = (blocks: WorkoutBlock[] | undefined): WorkoutBlock | null => {
  if (!Array.isArray(blocks) || blocks.length !== 1) return null;
  const b = blocks[0];
  if (!b || typeof b !== 'object') return null;
  if (b.type !== 'repeat') return null;
  if (typeof b.label !== 'string' || b.label !== 'Round') return null;
  if (typeof b.scoringIntent === 'string' && b.scoringIntent.length > 0) return null;
  if (typeof b.rounds !== 'number' || !Number.isFinite(b.rounds) || Math.trunc(b.rounds) <= 0)
    return null;
  return b;
};

const upgradeWorkoutDefinition = (value: any, schemaVersion: number) => {
  if (!value || typeof value !== 'object') return value;
  const def = value as Record<string, unknown>;

  const blocks = def.blocks as WorkoutBlock[] | undefined;
  const wrapper = isForTimeWrapperRepeat(blocks);
  if (!wrapper) {
    return withSchemaVersion({ ...def }, schemaVersion);
  }

  const nextBlocks = [
    {
      ...(wrapper as any),
      scoringIntent: 'for_time',
    },
  ];

  return withSchemaVersion({ ...def, blocks: nextBlocks }, schemaVersion);
};

const upgradeTimerPlan = (value: any, schemaVersion: number) => {
  if (!value || typeof value !== 'object') return value;
  const plan = value as Record<string, unknown>;
  return withSchemaVersion({ ...plan }, schemaVersion);
};

export const from = 4;
export const to = 5;

export const upgradeDefinition = (input: DefinitionUpgradeInput): DefinitionUpgradeInput => ({
  dataVersion: to,
  workoutDefinition: upgradeWorkoutDefinition(input.workoutDefinition, to),
  timerPlan: upgradeTimerPlan(input.timerPlan, to),
});

export const upgradeRun = (input: RunUpgradeInput): RunUpgradeInput => ({
  dataVersion: to,
  timerPlan: upgradeTimerPlan(input.timerPlan, to),
  events: input.events ?? [],
});

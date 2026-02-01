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
  rounds?: unknown;
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

    if ('rounds' in next && next.rounds === null) {
      delete (next as { rounds?: unknown }).rounds;
    }

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
  const plan = value as Record<string, unknown>;
  return withSchemaVersion({ ...plan }, schemaVersion);
};

export const from = 2;
export const to = 3;

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

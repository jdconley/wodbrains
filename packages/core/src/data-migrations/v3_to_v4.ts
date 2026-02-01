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
  workMs?: unknown;
  restMs?: unknown;
  startWith?: unknown;
  mode?: unknown;
  durationMs?: unknown;
  scoringIntent?: unknown;
};

type WorkoutScoring = {
  type?: unknown;
  rounds?: unknown;
  timeCapMs?: unknown;
  workMs?: unknown;
  restMs?: unknown;
  startWith?: unknown;
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

const num = (value: unknown): number | null => {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return value;
};

const posInt = (value: unknown): number | null => {
  const n = num(value);
  if (n === null) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
};

const nonNegInt = (value: unknown): number | null => {
  const n = num(value);
  if (n === null) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
};

const startWith = (value: unknown): 'work' | 'rest' | null => {
  if (value === 'work' || value === 'rest') return value;
  return null;
};

const convertScoringToBlocks = (scoringRaw: unknown, blocks: WorkoutBlock[]): WorkoutBlock[] => {
  const scoring = (
    scoringRaw && typeof scoringRaw === 'object' ? (scoringRaw as WorkoutScoring) : null
  ) as WorkoutScoring | null;
  const type = typeof scoring?.type === 'string' ? scoring.type : null;

  if (!type) return blocks;

  // for_time + rounds -> wrap blocks in repeat
  if (type === 'for_time') {
    const rounds = posInt(scoring?.rounds);
    if (!rounds) return blocks;
    return [
      {
        type: 'repeat',
        blockId: createId(),
        label: 'Round',
        rounds,
        scoringIntent: 'for_time',
        blocks,
      },
    ];
  }

  // amrap + timeCapMs -> countdown section containing open-ended repeat
  if (type === 'amrap') {
    const timeCapMs = posInt(scoring?.timeCapMs);
    if (!timeCapMs) return blocks;
    return [
      {
        type: 'timer',
        blockId: createId(),
        label: 'AMRAP',
        mode: 'countdown',
        durationMs: timeCapMs,
        blocks: [
          {
            type: 'repeat',
            blockId: createId(),
            label: 'Round',
            // rounds omitted => open-ended
            blocks,
          },
        ],
      },
    ];
  }

  // interval -> convert to an interval block wrapping the original work blocks
  if (type === 'interval') {
    const rounds = posInt(scoring?.rounds);
    const workMs = posInt(scoring?.workMs);
    if (!rounds || !workMs) return blocks;
    const restMs = nonNegInt(scoring?.restMs) ?? 0;
    const sw = startWith(scoring?.startWith) ?? undefined;
    return [
      {
        type: 'interval',
        blockId: createId(),
        label: 'Intervals',
        rounds,
        workMs,
        restMs,
        ...(sw ? { startWith: sw } : {}),
        blocks,
      },
    ];
  }

  return blocks;
};

const upgradeWorkoutDefinition = (value: any, schemaVersion: number) => {
  if (!value || typeof value !== 'object') return value;
  const def = value as Record<string, unknown>;

  const rawBlocks = def.blocks as WorkoutBlock[] | undefined;
  const upgradedBlocks = upgradeBlocks(rawBlocks) ?? [];

  const scoring = def.scoring;
  const nextBlocks = scoring ? convertScoringToBlocks(scoring, upgradedBlocks) : upgradedBlocks;

  // scoring is removed in v4 (nested-only sections)
  const { scoring: _scoring, ...rest } = def as any;
  return withSchemaVersion({ ...rest, blocks: nextBlocks }, schemaVersion);
};

const upgradeTimerPlan = (value: any, schemaVersion: number) => {
  if (!value || typeof value !== 'object') return value;
  const plan = value as Record<string, unknown>;
  return withSchemaVersion({ ...plan }, schemaVersion);
};

export const from = 3;
export const to = 4;

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

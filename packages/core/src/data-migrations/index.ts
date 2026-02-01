import {
  from as v1From,
  to as v1To,
  upgradeDefinition as upgradeDefV1,
  upgradeRun as upgradeRunV1,
} from './v1_to_v2';
import {
  from as v2From,
  to as v2To,
  upgradeDefinition as upgradeDefV2,
  upgradeRun as upgradeRunV2,
} from './v2_to_v3';
import {
  from as v3From,
  to as v3To,
  upgradeDefinition as upgradeDefV3,
  upgradeRun as upgradeRunV3,
} from './v3_to_v4';
import {
  from as v4From,
  to as v4To,
  upgradeDefinition as upgradeDefV4,
  upgradeRun as upgradeRunV4,
} from './v4_to_v5';

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

type DefinitionMigration = {
  from: number;
  to: number;
  upgrade: (input: DefinitionUpgradeInput) => DefinitionUpgradeInput;
};

type RunMigration = {
  from: number;
  to: number;
  upgrade: (input: RunUpgradeInput) => RunUpgradeInput;
};

const definitionMigrations: DefinitionMigration[] = [
  { from: v1From, to: v1To, upgrade: upgradeDefV1 },
  { from: v2From, to: v2To, upgrade: upgradeDefV2 },
  { from: v3From, to: v3To, upgrade: upgradeDefV3 },
  { from: v4From, to: v4To, upgrade: upgradeDefV4 },
];

const runMigrations: RunMigration[] = [
  { from: v1From, to: v1To, upgrade: upgradeRunV1 },
  { from: v2From, to: v2To, upgrade: upgradeRunV2 },
  { from: v3From, to: v3To, upgrade: upgradeRunV3 },
  { from: v4From, to: v4To, upgrade: upgradeRunV4 },
];

export const LATEST_DATA_VERSION = v4To;

const applyDefinitionMigration = (input: DefinitionUpgradeInput) => {
  const migration = definitionMigrations.find((m) => m.from === input.dataVersion);
  if (!migration) throw new Error(`No definition migration from v${input.dataVersion}`);
  return migration.upgrade(input);
};

const applyRunMigration = (input: RunUpgradeInput) => {
  const migration = runMigrations.find((m) => m.from === input.dataVersion);
  if (!migration) throw new Error(`No run migration from v${input.dataVersion}`);
  return migration.upgrade(input);
};

export const upgradeDefinitionData = (input: DefinitionUpgradeInput): DefinitionUpgradeInput => {
  let state = { ...input };
  while (state.dataVersion < LATEST_DATA_VERSION) {
    state = applyDefinitionMigration(state);
  }
  return state;
};

export const upgradeRunData = (input: RunUpgradeInput): RunUpgradeInput => {
  let state = { ...input };
  while (state.dataVersion < LATEST_DATA_VERSION) {
    state = applyRunMigration(state);
  }
  return state;
};

export type UUID = string;

// ---- WorkoutDefinition (generic IR) ----

export type WorkoutBlockType = 'sequence' | 'repeat' | 'interval' | 'timer' | 'step' | 'note';

export interface WorkoutDefinition {
  id: UUID;
  title?: string;
  description?: string;
  blocks: WorkoutBlock[];
  schemaVersion?: number;
}

export interface WorkoutBlock {
  type: WorkoutBlockType;
  blockId: UUID;
  label?: string;
  blocks?: WorkoutBlock[];
  rounds?: number; // omit for unknown/until done
  workMs?: number;
  restMs?: number;
  startWith?: 'work' | 'rest';
  mode?: 'countup' | 'countdown';
  durationMs?: number;
  prescription?: WorkoutPrescription;
  text?: string;

  /**
   * Optional scoring semantic for nested-only representations.
   * Used to preserve legacy meaning (e.g. v3 scoring.for_time -> v4 repeat wrapper).
   */
  scoringIntent?: 'for_time';
}

export interface WorkoutPrescription {
  reps?: number;
  timeMs?: number;
  distance?: { value: number; unit: 'm' | 'km' | 'mi' };
  load?: { value: number; unit: 'lb' | 'kg' };
  calories?: number;
  notes?: string;
}

// ---- TimerPlan (runtime IR) ----

export type TimerPlanSegment =
  | TimerPlanSequence
  | TimerPlanRepeat
  | TimerPlanTimer
  | TimerPlanStep
  | TimerPlanNote;

export interface TimerPlan {
  id: UUID;
  title?: string;
  schemaVersion: number;
  root: TimerPlanSequence;
}

export interface TimerPlanSequence {
  type: 'sequence';
  blockId: UUID;
  label?: string;
  segments: TimerPlanSegment[];
}

export interface TimerPlanRepeat {
  type: 'repeat';
  blockId: UUID;
  label?: string;
  rounds: number | null;
  segments: TimerPlanSegment[];
}

export interface TimerPlanTimer {
  type: 'timer';
  blockId: UUID;
  label?: string;
  mode: 'countup' | 'countdown';
  durationMs?: number;
}

export interface TimerPlanStep {
  type: 'step';
  blockId: UUID;
  label: string;
  prescription?: WorkoutPrescription;
}

export interface TimerPlanNote {
  type: 'note';
  blockId: UUID;
  text: string;
}

// ---- Run events & derived state ----

export type RunEvent =
  | { id: UUID; type: 'start'; atMs: number }
  | { id: UUID; type: 'pause'; atMs: number }
  | { id: UUID; type: 'resume'; atMs: number }
  | { id: UUID; type: 'finish'; atMs: number }
  | { id: UUID; type: 'advanceRound'; atMs: number }
  | { id: UUID; type: 'advance'; atMs: number }
  | { id: UUID; type: 'split'; atMs: number; label?: string }
  | { id: UUID; type: 'undo'; atMs: number; targetEventId: UUID };

export type RunStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface DerivedRunState {
  status: RunStatus;
  nowMs: number;

  startedAtMs?: number;
  pausedAtMs?: number;
  finishedAtMs?: number;

  activeElapsedMs: number; // excludes paused durations

  display: {
    elapsedMs: number;
  };

  /** True when segments auto-advance (countdown/interval/AMRAP). */
  isAutoAdvancing?: boolean;

  segment?: {
    blockId?: UUID;
    label?: string;
    type: 'timer' | 'step' | 'note';
    mode: 'countup' | 'countdown' | 'manual';
    elapsedMs: number;
    remainingMs?: number;
  };

  /** Current group context for display (e.g., Round 1 with its steps) */
  currentGroup?: {
    /** Group identifier (e.g., repeatBlockId + round) */
    groupId: string;
    /** Display title (e.g., "Round 1" or the repeat block's label) */
    title: string;
    /** Steps/items in this group (excluding notes) */
    steps: Array<{ blockId: UUID; label: string; isActive: boolean }>;
  };

  cursor?: {
    activeBlockId?: UUID;
    path: UUID[];
    stack: Array<{
      blockId: UUID;
      type: 'sequence' | 'repeat';
      label?: string;
      index: number;
      round?: number;
      totalRounds?: number | null;
    }>;
  };

  counters: Array<{
    blockId?: UUID;
    label: string;
    current: number;
    target?: number | null;
  }>;

  splits?: Array<{
    id: UUID;
    atMs: number;
    elapsedMs: number;
    deltaMs: number;
    label?: string;
  }>;
}

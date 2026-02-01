import { formatTimeMs, type TimerPlanSegment, type WorkoutBlock } from '@wodbrains/core';

export type DisplayNode = {
  label: string;
  children?: DisplayNode[];
};

const defaultWorkoutLabel = (block: WorkoutBlock): string => {
  switch (block.type) {
    case 'sequence':
      return block.label ?? 'Sequence';
    case 'repeat':
      return `${block.label ?? 'Repeat'}${block.rounds ? ` × ${block.rounds}` : ''}`;
    case 'interval':
      return block.label ?? 'Intervals';
    case 'timer': {
      const mode = block.mode ?? 'countup';
      if (mode === 'countdown' && typeof block.durationMs === 'number') {
        const label = block.label?.trim();
        if (label) return `${label} ${formatTimeMs(block.durationMs)}`;
        return `countdown ${formatTimeMs(block.durationMs)}`;
      }
      return block.label ?? (mode === 'countdown' ? 'Countdown' : 'Count up');
    }
    case 'note':
      return block.text ?? block.label ?? 'Note';
    case 'step':
      return block.label ?? block.text ?? 'Step';
    default:
      return 'Block';
  }
};

const shouldCollapseSequenceBlock = (block: WorkoutBlock): boolean => {
  if (block.type !== 'sequence') return false;
  const kids = Array.isArray(block.blocks) ? block.blocks : [];
  if (kids.length !== 1) return false;
  const label = (block.label ?? '').trim();
  // Treat unlabeled/default sequences as redundant wrappers.
  return !label || label.toLowerCase() === 'sequence';
};

const workoutBlockToDisplayNodes = (block: WorkoutBlock): DisplayNode[] => {
  // Rule A: collapse redundant sequences with one child.
  if (shouldCollapseSequenceBlock(block)) {
    const only = (block.blocks ?? [])[0];
    return only ? workoutBlockToDisplayNodes(only) : [];
  }

  const label = defaultWorkoutLabel(block);
  const kids = Array.isArray(block.blocks) ? block.blocks : [];
  const children = kids.flatMap(workoutBlockToDisplayNodes);
  return [{ label, ...(children.length ? { children } : {}) }];
};

export const workoutBlocksToDisplayNodes = (blocks: WorkoutBlock[]): DisplayNode[] => {
  const list = Array.isArray(blocks) ? blocks : [];
  return list.flatMap(workoutBlockToDisplayNodes);
};

// ---- TimerPlan display (run info overlay) ----

const shouldCollapseSequenceSegment = (
  seg: Extract<TimerPlanSegment, { type: 'sequence' }>,
): boolean => {
  if (seg.type !== 'sequence') return false;
  if (seg.segments.length !== 1) return false;
  const label = (seg.label ?? '').trim();
  return !label || label.toLowerCase() === 'sequence';
};

const timerPlanSegmentToDisplayNodes = (seg: TimerPlanSegment): DisplayNode[] => {
  if (seg.type === 'note') {
    const label = seg.text?.trim() || 'Note';
    return [{ label }];
  }

  // Rule B: collapse redundant sequences with a single child
  if (seg.type === 'sequence' && shouldCollapseSequenceSegment(seg)) {
    const only = seg.segments[0];
    return only ? timerPlanSegmentToDisplayNodes(only) : [];
  }

  if (seg.type === 'sequence') {
    const label = seg.label ?? 'Sequence';
    const children = seg.segments.flatMap(timerPlanSegmentToDisplayNodes);
    return [{ label, ...(children.length ? { children } : {}) }];
  }

  if (seg.type === 'repeat') {
    const roundsText = seg.rounds !== null ? ` × ${seg.rounds}` : '';
    const label = `${seg.label ?? 'Repeat'}${roundsText}`;
    const children = seg.segments.flatMap(timerPlanSegmentToDisplayNodes);
    return [{ label, ...(children.length ? { children } : {}) }];
  }

  if (seg.type === 'timer') {
    const durationText =
      typeof seg.durationMs === 'number' ? ` ${formatTimeMs(seg.durationMs)}` : '';
    const label = seg.label
      ? `${seg.label}${durationText}`
      : `${seg.mode === 'countdown' ? 'countdown' : 'count up'}${durationText}`;
    return [{ label }];
  }

  // step
  return [{ label: seg.label }];
};

export const timerPlanSegmentsToDisplayNodes = (segments: TimerPlanSegment[]): DisplayNode[] =>
  (Array.isArray(segments) ? segments : []).flatMap(timerPlanSegmentToDisplayNodes);

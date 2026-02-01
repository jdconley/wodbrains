import { describe, expect, it } from 'vitest';
import { compileWorkoutDefinition, type WorkoutBlock, type WorkoutDefinition } from '@wodbrains/core';
import { coerceTimerHeaders, nestCountdownGroups } from '../src/parseNesting';

describe('parse-nesting', () => {
	it('nests AMRAP steps under countdown timers and keeps rest separate', () => {
		const flat: WorkoutBlock[] = [
			{ type: 'note', blockId: 'n1', text: '6 Min AMRAP (As Many Rounds and Reps As Possible in 6 Minutes)' },
			{ type: 'step', blockId: 's1', label: '10 Dumbbell Deadlift' },
			{ type: 'step', blockId: 's2', label: '10 Box Jump' },
			{ type: 'note', blockId: 'n2', text: '...Continue adding 1 box jump rep each round!' },
			{ type: 'note', blockId: 'n3', text: 'Rest 3 Minutes' },
			{ type: 'note', blockId: 'n4', text: '6 Min AMRAP (As Many Rounds and Reps As Possible in 6 Minutes)' },
			{ type: 'step', blockId: 's3', label: '10 Box Jump' },
			{ type: 'step', blockId: 's4', label: '10 Dumbbell Deadlift' },
			{ type: 'note', blockId: 'n5', text: '...Continue adding 1 deadlift rep each round!' },
		];

		const normalized = nestCountdownGroups(coerceTimerHeaders(flat));

		expect(normalized).toHaveLength(3);
		expect(normalized[0]?.type).toBe('timer');
		expect(normalized[1]?.type).toBe('timer');
		expect(normalized[2]?.type).toBe('timer');

		const first = normalized[0]!;
		const rest = normalized[1]!;
		const last = normalized[2]!;

		expect(first.durationMs).toBe(6 * 60 * 1000);
		expect(rest.durationMs).toBe(3 * 60 * 1000);
		expect(last.durationMs).toBe(6 * 60 * 1000);

		expect(first.blocks?.length ?? 0).toBeGreaterThan(0);
		expect(last.blocks?.length ?? 0).toBeGreaterThan(0);
		expect(rest.blocks).toBeUndefined();
	});

	it('compiles into three countdown segments', () => {
		const blocks = nestCountdownGroups(
			coerceTimerHeaders([
				{ type: 'note', blockId: 'n1', text: '6 Min AMRAP' },
				{ type: 'step', blockId: 's1', label: '10 Dumbbell Deadlift' },
				{ type: 'note', blockId: 'n2', text: 'Rest 3 Minutes' },
				{ type: 'note', blockId: 'n3', text: '6 Min AMRAP' },
				{ type: 'step', blockId: 's2', label: '10 Box Jump' },
			]),
		);

		const def: WorkoutDefinition = {
			id: 'def-1',
			blocks,
		};

		const plan = compileWorkoutDefinition(def);
		expect(plan.root.segments).toHaveLength(3);
		const collectCountdownDurations = (segment: any): number[] => {
			if (!segment || typeof segment !== 'object') return [];
			if (segment.type === 'timer' && segment.mode === 'countdown') {
				return typeof segment.durationMs === 'number' ? [segment.durationMs] : [];
			}
			if (segment.type === 'sequence' && Array.isArray(segment.segments)) {
				return segment.segments.flatMap(collectCountdownDurations);
			}
			if (segment.type === 'repeat' && Array.isArray(segment.segments)) {
				return segment.segments.flatMap(collectCountdownDurations);
			}
			return [];
		};

		const durations = plan.root.segments.flatMap(collectCountdownDurations);
		expect(durations).toEqual([6 * 60 * 1000, 3 * 60 * 1000, 6 * 60 * 1000]);
	});
});

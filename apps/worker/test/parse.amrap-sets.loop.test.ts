import { describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { WorkoutDefinitionSchema, type WorkoutBlock } from '@wodbrains/core';

const bindings = env as unknown as Record<string, string | undefined>;
const shouldRun = Boolean(bindings.GOOGLE_GENERATIVE_AI_API_KEY) && bindings.RUN_LIVE_AI_TESTS === '1';
const describeLive = shouldRun ? describe : describe.skip;

const LIVE_TIMEOUT_MS = 300_000;
const LOOP_COUNT = 6;

const workoutText = `3 Sets
Each Set is a 3 Min AMRAP
(As Many Rounds and Reps As Possible in 3 Minutes)

9 Dumbbell Hang Power Clean
6 Air Squat
3 Burpee
Rest 1 Minute Between Sets`;

const findFirstAmrapCountdown = (blocks: WorkoutBlock[]): WorkoutBlock | null => {
	const walk = (items: WorkoutBlock[]): WorkoutBlock | null => {
		for (const block of items) {
			if (
				block.type === 'timer' &&
				block.mode === 'countdown' &&
				typeof block.durationMs === 'number' &&
				(block.label ?? '').toLowerCase().includes('amrap')
			) {
				return block;
			}
			if (block.blocks?.length) {
				const found = walk(block.blocks);
				if (found) return found;
			}
		}
		return null;
	};
	return walk(blocks);
};

describeLive('AMRAP sets loop (live)', () => {
	it(
		'parses sets of AMRAP consistently',
		async () => {
			for (let i = 0; i < LOOP_COUNT; i += 1) {
				const res = await SELF.fetch('https://example.com/api/parse', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ text: workoutText }),
				});
				expect(res.status).toBe(200);
				const json = (await res.json()) as { workoutDefinition?: unknown };
				const workoutDefinition = WorkoutDefinitionSchema.parse(json.workoutDefinition);

				const repeat = workoutDefinition.blocks.length === 1 ? workoutDefinition.blocks[0] : null;
				expect(repeat && repeat.type === 'repeat').toBe(true);
				expect(repeat?.rounds).toBe(3);
				expect(repeat?.label ?? '').toBe('Set');

				const amrap = findFirstAmrapCountdown(workoutDefinition.blocks);
				expect(amrap).not.toBeNull();
				const nested = amrap?.blocks ?? [];
				expect(nested.length).toBeGreaterThan(0);
				const labels = nested
					.map((b) => (b.type === 'note' ? (b.text ?? b.label ?? '') : (b.label ?? b.text ?? '')))
					.map((label) => label.toLowerCase());
				for (const needle of ['hang power clean', 'air squat', 'burpee']) {
					expect(labels.some((label) => label.includes(needle))).toBe(true);
				}

				const repeatBlocks = repeat?.type === 'repeat' ? (repeat.blocks ?? []) : [];
				const hasRest = repeatBlocks.some(
					(b) => b.type === 'timer' && b.mode === 'countdown' && (b.label ?? '').toLowerCase().includes('rest') && b.durationMs === 60000,
				);
				expect(hasRest).toBe(true);
			}
		},
		LIVE_TIMEOUT_MS,
	);
});

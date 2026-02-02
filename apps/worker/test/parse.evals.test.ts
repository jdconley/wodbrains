import { describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import {
  TimerPlanSchema,
  WorkoutDefinitionSchema,
  type TimerPlan,
  type TimerPlanSegment,
  type TimerPlanSequence,
  type WorkoutBlock,
} from '@wodbrains/core';
import manifestJson from './evals/manifest.json';

type EvalCase = {
	id: string;
	kind: 'text' | 'url' | 'image';
	path?: string;
	text?: string;
	url?: string;
	expect?: {
		countdownDurationsMs?: number[];
		topLevelNoteIncludes?: string[];
		nestedNoteExcludes?: string[];
		topLevelRepeatRounds?: number;
		topLevelRepeatLabel?: string;
		countdownTimersHaveNoChildren?: boolean;
		amrapCountdownHasStepsIncluding?: string[];
    timerPlanRoot?: Array<{
      type: TimerPlanSegment['type'];
      labelIncludes?: string;
      rounds?: number;
      mode?: 'countup' | 'countdown';
    }>;
    timerPlanWarmupCountdownsMs?: number[];
    timerPlanWarmupRepeat?: {
      rounds?: number;
      countdownDurationsMs?: number[];
    };
	};
};

const bindings = env as unknown as Record<string, string | undefined>;
const shouldRun = Boolean(bindings.GOOGLE_GENERATIVE_AI_API_KEY) && bindings.RUN_LIVE_AI_TESTS === '1';
const describeLive = shouldRun ? describe : describe.skip;
const LIVE_TIMEOUT_MS = 300_000;

const manifest = manifestJson as EvalCase[];

const testAssetDataUrls = import.meta.glob('../../../test-assets/evals/**/*.{png,jpg,jpeg,webp}', {
	eager: true,
	query: '?inline',
	import: 'default',
}) as Record<string, string>;

const decodeBase64DataUrl = (dataUrl: string): { mimeType: string; bytes: Uint8Array } => {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) throw new Error(`Expected a base64 data URL, got: ${dataUrl.slice(0, 64)}...`);
	const mimeType = match[1] ?? 'application/octet-stream';
	const b64 = match[2] ?? '';

	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return { mimeType, bytes };
};

const extractCountdownDurations = (blocks: WorkoutBlock[]): number[] => {
	const out: number[] = [];
	const walk = (items: WorkoutBlock[]) => {
		for (const block of items) {
			if (block.type === 'timer' && block.mode === 'countdown' && typeof block.durationMs === 'number') {
				out.push(block.durationMs as number);
			}
			if (Array.isArray(block.blocks) && block.blocks.length) {
				walk(block.blocks);
			}
		}
	};
	walk(blocks);
	return out;
};

const extractCountdownDurationsFromPlan = (
  segments: TimerPlanSegment[],
  opts?: { deep?: boolean },
): number[] => {
  const out: number[] = [];
  const deep = opts?.deep ?? true;
  const walk = (items: TimerPlanSegment[]) => {
    for (const seg of items) {
      if (seg.type === 'timer' && seg.mode === 'countdown' && typeof seg.durationMs === 'number') {
        out.push(seg.durationMs);
      }
      if (deep && seg.type === 'sequence') walk(seg.segments);
      if (deep && seg.type === 'repeat') walk(seg.segments);
    }
  };
  walk(segments);
  return out;
};

const findRootSequenceByLabel = (plan: TimerPlan, needle: string): TimerPlanSequence | null => {
  const lower = needle.toLowerCase();
  return (
    plan.root.segments.find(
      (seg): seg is TimerPlanSequence =>
        seg.type === 'sequence' && (seg.label ?? '').toLowerCase().includes(lower),
    ) ?? null
  );
};

const getTopLevelRepeat = (blocks: WorkoutBlock[]): WorkoutBlock | null => {
	if (blocks.length !== 1) return null;
	const b = blocks[0];
	if (!b || b.type !== 'repeat') return null;
	return b;
};

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

const collectNotes = (blocks: WorkoutBlock[], nested: boolean, out: string[]) => {
	for (const block of blocks) {
		if (block.type === 'note') {
			if (nested) out.push(block.text ?? block.label ?? '');
		}
		if (block.blocks?.length) collectNotes(block.blocks, true, out);
	}
};

describe('Parse eval fixtures', () => {
	it('bundles referenced image assets', () => {
		const missing: string[] = [];
		for (const entry of manifest) {
			if (entry.kind !== 'image') continue;
			const relPath = entry.path ? `../../../${entry.path}` : '';
			const dataUrl = relPath ? testAssetDataUrls[relPath] : undefined;
			if (!dataUrl) {
				missing.push(entry.path ?? '(missing path)');
				continue;
			}
			expect(dataUrl).toMatch(/^data:[^;]+;base64,/);
		}
		expect(missing).toEqual([]);
	});
});

describeLive('Parse evals (live)', () => {
	it.each(manifest)(
		'$id',
		async (entry) => {
			let res: Response;
			if (entry.kind === 'text') {
				res = await SELF.fetch('https://example.com/api/parse', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ text: entry.text ?? '' }),
				});
			} else if (entry.kind === 'url') {
				res = await SELF.fetch('https://example.com/api/parse', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ url: entry.url ?? '' }),
				});
			} else {
				const relPath = entry.path ? `../../../${entry.path}` : '';
				const dataUrl = relPath ? testAssetDataUrls[relPath] : undefined;
				if (!dataUrl) throw new Error(`Missing test asset for path: ${entry.path ?? '(none)'}`);

				const { mimeType, bytes } = decodeBase64DataUrl(dataUrl);
				const form = new FormData();
				form.set('text', 'Parse the attached workout image into the workout definition schema.');
				form.set('image', new Blob([bytes], { type: mimeType }), entry.path?.split('/').pop() ?? 'workout.png');
				res = await SELF.fetch('https://example.com/api/parse', {
					method: 'POST',
					body: form,
				});
			}

			expect(res.status).toBe(200);
			const json = (await res.json()) as { workoutDefinition?: unknown; timerPlan?: unknown };
			const workoutDefinition = WorkoutDefinitionSchema.parse(json.workoutDefinition);
			const timerPlan = TimerPlanSchema.parse(json.timerPlan);
			expect(typeof workoutDefinition.title).toBe('string');
			expect((workoutDefinition.title ?? '').trim().length).toBeGreaterThan(0);
			expect(typeof timerPlan.title).toBe('string');
			expect((timerPlan.title ?? '').trim().length).toBeGreaterThan(0);

			const expectations = entry.expect ?? {};
			if (expectations.countdownDurationsMs) {
				expect(extractCountdownDurations(workoutDefinition.blocks)).toEqual(expectations.countdownDurationsMs);
			}

			if (typeof expectations.topLevelRepeatRounds === 'number') {
				const repeat = getTopLevelRepeat(workoutDefinition.blocks);
				expect(repeat).not.toBeNull();
				expect(typeof repeat?.rounds === 'number' ? repeat.rounds : null).toBe(expectations.topLevelRepeatRounds);
			}

			if (typeof expectations.topLevelRepeatLabel === 'string') {
				const repeat = getTopLevelRepeat(workoutDefinition.blocks);
				expect(repeat).not.toBeNull();
				expect(repeat?.label ?? '').toBe(expectations.topLevelRepeatLabel);
			}

			if (expectations.countdownTimersHaveNoChildren) {
				const repeat = getTopLevelRepeat(workoutDefinition.blocks);
				expect(repeat).not.toBeNull();
				const children = Array.isArray(repeat?.blocks) ? (repeat!.blocks as WorkoutBlock[]) : [];
				expect(children.length).toBeGreaterThan(0);
				// For this class of workouts, the round template should be pure countdown timers with labels.
				expect(children.every((b) => b.type === 'timer' && b.mode === 'countdown')).toBe(true);
				for (const t of children) {
					expect(!t.blocks || t.blocks.length === 0).toBe(true);
				}
			}

			if (expectations.amrapCountdownHasStepsIncluding?.length) {
				const amrap = findFirstAmrapCountdown(workoutDefinition.blocks);
				expect(amrap).not.toBeNull();
				const nested = amrap?.blocks ?? [];
				expect(nested.length).toBeGreaterThan(0);
				const labels = nested
					.map((b) => (b.type === 'note' ? (b.text ?? b.label ?? '') : (b.label ?? b.text ?? '')))
					.map((label) => label.toLowerCase());
				for (const needle of expectations.amrapCountdownHasStepsIncluding) {
					const lowerNeedle = needle.toLowerCase();
					expect(labels.some((label) => label.includes(lowerNeedle))).toBe(true);
				}
			}

			if (expectations.topLevelNoteIncludes?.length) {
				const topLevelNotes = workoutDefinition.blocks
					.filter((block) => block.type === 'note')
					.map((block) => (block.type === 'note' ? (block.text ?? block.label ?? '') : ''));
				for (const needle of expectations.topLevelNoteIncludes) {
					expect(topLevelNotes.some((note) => note.includes(needle))).toBe(true);
				}
			}

			if (expectations.nestedNoteExcludes?.length) {
				const nestedNotes: string[] = [];
				collectNotes(workoutDefinition.blocks, false, nestedNotes);
				for (const needle of expectations.nestedNoteExcludes) {
					expect(nestedNotes.some((note) => note.includes(needle))).toBe(false);
				}
			}

			if (expectations.timerPlanRoot?.length) {
				const rootSegments = timerPlan.root.segments;
				expect(rootSegments.length).toBeGreaterThanOrEqual(expectations.timerPlanRoot.length);
				expectations.timerPlanRoot.forEach((expected, index) => {
					const actual = rootSegments[index];
					expect(actual?.type).toBe(expected.type);
					if (expected.labelIncludes) {
						expect(((actual as Extract<TimerPlanSegment, { type: 'sequence' | 'repeat' }>)?.label ?? '').toLowerCase()).toContain(expected.labelIncludes.toLowerCase());
					}
					if (typeof expected.rounds === 'number') {
						expect(actual?.type).toBe('repeat');
						expect((actual as Extract<TimerPlanSegment, { type: 'repeat' }>).rounds).toBe(
							expected.rounds,
						);
					}
					if (expected.mode) {
						expect(actual?.type).toBe('timer');
						expect((actual as Extract<TimerPlanSegment, { type: 'timer' }>).mode).toBe(expected.mode);
					}
				});
			}

			if (expectations.timerPlanWarmupCountdownsMs?.length) {
				const warmup = findRootSequenceByLabel(timerPlan, 'Warm-up');
				expect(warmup).not.toBeNull();
				const durations = extractCountdownDurationsFromPlan(warmup?.segments ?? [], { deep: false });
				expect(durations).toEqual(expectations.timerPlanWarmupCountdownsMs);
			}

			if (expectations.timerPlanWarmupRepeat) {
				const warmup = findRootSequenceByLabel(timerPlan, 'Warm-up');
				expect(warmup).not.toBeNull();
				const repeat = warmup?.segments.find(
					(seg): seg is Extract<TimerPlanSegment, { type: 'repeat' }> => seg.type === 'repeat',
				);
				expect(repeat).not.toBeNull();
				if (typeof expectations.timerPlanWarmupRepeat.rounds === 'number') {
					expect(repeat?.rounds).toBe(expectations.timerPlanWarmupRepeat.rounds);
				}
				if (expectations.timerPlanWarmupRepeat.countdownDurationsMs?.length) {
					const durations = extractCountdownDurationsFromPlan(repeat?.segments ?? [], { deep: false });
					expect(durations).toEqual(expectations.timerPlanWarmupRepeat.countdownDurationsMs);
				}
			}
		},
		LIVE_TIMEOUT_MS,
	);
});

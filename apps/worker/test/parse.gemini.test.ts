import { describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { TimerPlanSchema, WorkoutDefinitionSchema } from '@wodbrains/core';

const bindings = env as unknown as Record<string, string | undefined>;
const shouldRun = Boolean(bindings.GOOGLE_GENERATIVE_AI_API_KEY) && bindings.RUN_LIVE_AI_TESTS === '1';
const describeLive = shouldRun ? describe : describe.skip;

const LIVE_TIMEOUT_MS = 300_000;

const textFiles = ['1.txt', '2.txt', '3.txt', '4.txt', '5.txt', '6.txt', '7.txt', '8.txt', '9.txt'] as const;
const textByFile: Record<(typeof textFiles)[number], string> = {
	'1.txt': `6 Min AMRAP
(As Many Rounds and Reps As Possible in 6 Minutes)

10 Dumbbell Deadlift
10 Box Jump
10 Dumbbell Deadlift
11 Box Jump
10 Dumbbell Deadlift
12 Box Jump
...Continue adding 1 box jump rep each round!

After 6 Minutes, Rest 3 Minutes, Then:

6 Min AMRAP
(As Many Rounds and Reps As Possible in 6 Minutes)

10 Box Jump
10 Dumbbell Deadlift
10 Box Jump
11 Dumbbell Deadlift
10 Box Jump
12 Dumbbell Deadlift
...Continue adding 1 deadlift rep each round!`,
	'2.txt': `4 Rounds
400 Meter Run
15 Dumbbell Thruster
15 Toes to Bar
---

Toes to Bar Options:
20 Alternating V-Up
-OR- 15 Weighted Sit Up
This version can also be done with:
15 Sandbag Thruster`,
	'3.txt': `7 Rounds
FOR QUALITY
3-6 Wall Walk
12 Dumbbell Bench Press
-OR- Dumbbell Push Up
16 Alternating Dumbbell Bent Over Row
-OR- Kettlebell Gorilla Row`,
	'4.txt': `15 Min EMOM
(Every Minute On the Minute for 15 Minutes)

Min 1: 3 Barbell Power Clean
Min 2: 8-10 Lateral Burpee Over Barbell
Min 3: Rest`,
	'5.txt': `20 Min AMRAP
(As Many Rounds and Reps As Possible in 20 Minutes)

24 Kettlebell Overhead Swing
15 Cal (M) / 11 Cal (W) Fan Bike
-OR- 250 Meter Row
12 Kipping Pull Up
15 Cal (M) / 11 Cal (W) Fan Bike
-OR- 250 Meter Row
--

Every 4/3 calories or 65 meters counts as 1 rep toward your score!

This version may be done with:
6-8 Strict Pull Up
-OR- 12 Feet-Elevated Inverted Row`,
	'6.txt': `10 Rounds
1-2 (R) Dumbbell Turkish Get Up
10 (R) Single Dumbbell Shoulder Rack Lunge
1-2 (L) Dumbbell Turkish Get Up
10 (L) Single Dumbbell Shoulder Rack Lunge`,
	'7.txt': `21-15-9 reps for time of:
Front squats
Chest-to-bar pull-ups

♀ 145 lb
♂ 205 lb`,
	'8.txt': `https://www.crossfit.com/250103`,
	'9.txt': `https://www.crossfit.com/250104`,
};
const imageFiles = [
	'Screenshot 2026-01-25 at 8.28.33\u202fPM.png',
	'Screenshot 2026-01-25 at 8.28.45\u202fPM.png',
	'Screenshot 2026-01-25 at 8.29.12\u202fPM.png',
];

const imageAssets = import.meta.glob('../../../test-assets/*.{png,jpg,jpeg,webp}', {
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

const assertParseResponse = async (res: Response) => {
	expect(res.status).toBe(200);
	const json = (await res.json()) as { workoutDefinition?: unknown; timerPlan?: unknown };
	const workoutDefinition = WorkoutDefinitionSchema.parse(json.workoutDefinition);
	const timerPlan = TimerPlanSchema.parse(json.timerPlan);
	expect(typeof workoutDefinition.title).toBe('string');
	expect((workoutDefinition.title ?? '').trim().length).toBeGreaterThan(0);
	expect(typeof timerPlan.title).toBe('string');
	expect((timerPlan.title ?? '').trim().length).toBeGreaterThan(0);
	expect(workoutDefinition.blocks.length).toBeGreaterThan(0);
	expect(timerPlan.root.segments.length).toBeGreaterThan(0);
};

describeLive('Gemini parse (live)', () => {
	it(
		'parses text and URL-as-text inputs',
		async () => {
			for (const file of textFiles) {
				const text = textByFile[file];
				const res = await SELF.fetch('https://example.com/api/parse', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ text }),
				});
				await assertParseResponse(res);
			}
		},
		LIVE_TIMEOUT_MS,
	);

	it(
		'parses image inputs',
		async () => {
			for (const file of imageFiles) {
				const relPath = `../../../test-assets/${file}`;
				const dataUrl = imageAssets[relPath];
				if (!dataUrl) throw new Error(`Missing test asset for path: ${relPath}`);

				const { mimeType, bytes } = decodeBase64DataUrl(dataUrl);
				const form = new FormData();
				form.set('text', 'Parse the attached workout image into the workout definition schema.');
				form.set('image', new Blob([bytes], { type: mimeType }), file);
				const res = await SELF.fetch('https://example.com/api/parse', {
					method: 'POST',
					body: form,
				});
				await assertParseResponse(res);
			}
		},
		LIVE_TIMEOUT_MS,
	);
});

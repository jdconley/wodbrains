import { generateText, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import {
	LATEST_DATA_VERSION,
	TimerPlanSchema,
	compileWorkoutDefinition,
	type TimerPlan,
	type WorkoutBlock,
	type WorkoutDefinition,
} from '@wodbrains/core';
import { v7 as uuidv7 } from 'uuid';
import type { Env } from './env';
import { coerceTimerHeaders, nestCountdownGroups } from './parseNesting';

const LLMWorkoutScoringSchema = z.object({
	// Allow non-canonical values (e.g. "forTime", "emom") and normalize later.
	type: z.string().optional(),
	label: z.string().optional(),
	rounds: z.number().int().positive().optional(),
	numRounds: z.number().int().positive().optional(),
	timeCapMs: z.number().int().positive().optional(),
	workMs: z.number().int().positive().optional(),
	restMs: z.number().int().nonnegative().optional(),
	startWith: z.enum(['work', 'rest']).optional(),
});

const LLMWorkoutBlockSchema: z.ZodType<any> = z.lazy(() =>
	z.object({
		type: z.enum(['sequence', 'repeat', 'timer', 'step', 'note']).catch('step'),
		label: z.string().optional(),
		text: z.string().optional(),
		// Allow non-canonical mode strings (e.g. "emom") and normalize later.
		mode: z.string().optional(),
		durationMs: z.number().int().nonnegative().optional(),
		rounds: z.number().int().positive().optional(),
		blocks: z.array(LLMWorkoutBlockSchema).optional(),
	}),
);

const LLMWorkoutDefinitionSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	scoring: LLMWorkoutScoringSchema.optional(),
	blocks: z.array(LLMWorkoutBlockSchema),
});

const LLMWorkoutTitleSchema = z.object({
	title: z.string().optional(),
});

const ParseResultSchema = z.object({
	workoutDefinition: LLMWorkoutDefinitionSchema,
	assumptions: z.array(z.string()).optional(),
});

const DEFAULT_WORKOUT_TITLE = 'Workout';
const MAX_TITLE_LENGTH = 80;

export const PARSE_MODEL_ID = 'gemini-3-pro-preview';
export const TITLE_MODEL_ID = 'gemini-2.5-flash-lite';

export const sanitizeWorkoutTitle = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	let text = value.replace(/\r\n/g, '\n').trim();
	if (!text) return undefined;
	text = (text.split('\n')[0] ?? '').trim();
	if (!text) return undefined;
	text = text.replace(/\s+/g, ' ');
	if (text.startsWith('"') || text.startsWith("'")) {
		text = text.slice(1).trim();
	}
	if (text.endsWith('"') || text.endsWith("'")) {
		text = text.slice(0, -1).trim();
	}
	if (!text) return undefined;
	if (text.length > MAX_TITLE_LENGTH) {
		text = text.slice(0, MAX_TITLE_LENGTH).trim();
	}
	return text || undefined;
};

export const selectWorkoutTitle = (parsedTitle: unknown, generatedTitle: unknown): string =>
	sanitizeWorkoutTitle(parsedTitle) ?? sanitizeWorkoutTitle(generatedTitle) ?? DEFAULT_WORKOUT_TITLE;

type PromptSnapshot = {
	parseSystem: string;
	parseUser: string;
	titleSystem: string;
	titleUser: string;
	inputSections: string[];
};

type ParseMeta = {
	promptSnapshot: PromptSnapshot;
	model: { parseModelId: string; titleModelId: string };
	raw: { parseText?: string; titleText?: string };
	providerMetadata?: { parse?: any; title?: any };
	urlStatuses?: Array<{ retrievedUrl?: string; status?: string }>;
};

export const buildPromptSnapshot = (input: { text?: string; url?: string; hasImage: boolean }): PromptSnapshot => {
	const system = [
		'You convert workout descriptions into a structured workout definition.',
		'IMPORTANT: If a workout URL is provided, you must use the URL Context tool to read it before answering.',
		'If the input is a workout name or a web search query (e.g. "crossfit cindy", "crossfit workout of the day today"), use the Google Search tool to find the workout before answering.',
		'Do not guess or use prior knowledge. Only use information that is present in the provided inputs, retrieved via URL Context, or retrieved via Google Search.',
		'Return a JSON object that matches the provided schema.',
		'If anything is ambiguous or missing, omit the field and add a short assumption.',
		'Exception: always include workoutDefinition.title. If there is no explicit title, create a short, playful title using analogy or metaphor (PG, no emojis).',
		'The workoutDefinition.blocks field is an ordered list of blocks (can be nested).',
		"Allowed block types: 'sequence', 'repeat', 'timer', 'step', 'note'.",
		"Use 'sequence' blocks to group named sections (Warm-up, Main Set, Finish). Put a section's steps inside its blocks array.",
		"Use 'repeat' blocks to represent templates that repeat N times. Put the per-round items in repeat.blocks and set rounds = N.",
		"Prefer 'timer' blocks for timeboxed work/rest. Use 'step' blocks for non-timed movement instructions or rep schemes not already captured by a timer.",
		"For 'timer' blocks, include durationMs (ms) when known and set mode to 'countdown' unless it is open-ended. Do not use the generic label 'Timer' when a specific label is available.",
		[
			'Rounds / repeats:',
			'- If the workout specifies "N Rounds", "N Sets", "Repeat N times", or "Repeat N×", treat it as repeating a template N times.',
			'- Set workoutDefinition.scoring = { type: "rounds", rounds: N }.',
			'- If the workout says "Sets", set workoutDefinition.scoring.label = "Set" (default label is "Round").',
			'- Do NOT output the rounds header line (e.g. "4 Rounds") as a step or note.',
			'- Put the per-round items in workoutDefinition.blocks (they will be wrapped into a repeat by downstream logic).',
			'- If the workout is sectioned (e.g. Warm-up/Main Set/Finish), prefer explicit repeat blocks inside the section and leave workoutDefinition.scoring unset.',
		].join('\\n'),
		[
			'Timed movement lines:',
			'- If a line is of the form "1 Min <movement>" or "2 Minutes <movement>", represent it as a single countdown timer block.',
			'- Set durationMs to the exact duration in milliseconds (1 minute = 60000, 2 minutes = 120000).',
			'- Set label to ONLY the movement (e.g. "Dumbbell Power Clean"), and do NOT include the duration text in the label.',
			'- Do NOT also emit a step or note for the same timed movement line.',
			'- Countdown timers with their own labels do not need nested items.',
		].join('\\n'),
		[
			'Rest between rounds/sets:',
			'- If you see "Rest N Minutes Between Rounds" or "Rest N Minutes Between Sets", output a single countdown timer labeled "Rest" with durationMs set correctly.',
			'- Include that rest timer inside the round template (as the last block in workoutDefinition.blocks).',
			'- Do NOT also emit a separate note/step for this rest line, and do NOT emit duplicate rest timers.',
		].join('\\n'),
		[
			'Sets of AMRAP:',
			'- If the workout says "N Sets" and "Each Set is a X Min AMRAP", treat it as repeating a template N times.',
			'- Set workoutDefinition.scoring = { type: "rounds", rounds: N, label: "Set" }.',
			'- Add a countdown timer block for the AMRAP (label "AMRAP", durationMs = X minutes in ms).',
			'- Put the movement lines as step blocks immediately after that timer.',
			'- If there is a "Rest N Minutes Between Sets" line, add a countdown timer labeled "Rest" after the steps.',
			'- Do NOT output the set header line as a step or note.',
		].join('\\n'),
		[
			'Clock workouts:',
			'- Interpret phrases like "On a N Minute Clock", "On an N-minute clock", or "N-minute clock" as an AMRAP-style time cap.',
			'- Set workoutDefinition.scoring = { type: "amrap", timeCapMs: N*60*1000 }.',
			'- Do NOT output that clock header as a step or note.',
			'- Do NOT also emit a countdown timer block for the same clock when scoring is set.',
		].join('\\n'),
		[
			'Example (rounds with timed movements):',
			'Input:',
			'4 Rounds',
			'1 Min Dumbbell Power Clean',
			'1 Min Dumbbell Squat',
			'1 Min Lateral Burpee Over Dumbbell',
			'Rest 2 Minutes Between Rounds',
			'Output:',
			'{',
			'  "workoutDefinition": {',
			'    "scoring": { "type": "rounds", "rounds": 4 },',
			'    "blocks": [',
			'      { "type": "timer", "mode": "countdown", "durationMs": 60000, "label": "Dumbbell Power Clean" },',
			'      { "type": "timer", "mode": "countdown", "durationMs": 60000, "label": "Dumbbell Squat" },',
			'      { "type": "timer", "mode": "countdown", "durationMs": 60000, "label": "Lateral Burpee Over Dumbbell" },',
			'      { "type": "timer", "mode": "countdown", "durationMs": 120000, "label": "Rest" }',
			'    ]',
			'  }',
			'}',
		].join('\\n'),
		'If a workout includes multiple timeboxed sections (e.g. 6 min AMRAP, rest 3 min, then another 6 min AMRAP), leave scoring unset and use timers instead.',
		'Treat workouts as a timeline of segments: work segments and rest segments, each represented by a timer block followed by its step/note lines.',
		'If a section heading includes a total duration (e.g. "Warm-up — 15 minutes"), ensure the timers inside that section add up to the total.',
		'If you must infer leftover time to meet a section total, include a short assumption explaining the inference.',
		'If a workout includes a pause/break between sections, output a timer block labeled "Break" with mode "countup" and no durationMs.',
		'For phrasing like "At minute 10–12", interpret it as a specific sub-interval within the current section and model it with explicit timers.',
		'Marker times are not timers. Phrases like "At 6:00", "After 6 minutes", or "When the clock hits ..." indicate a transition and do not create a timer on their own.',
		'If a transition line includes both a marker time and a segment duration (e.g. "At 6:00, Rest 3 Minutes, Then:"), create only the explicit segment timer (Rest 3 Minutes).',
		'If a line contains multiple time values, only use the time tied to a segment keyword (Rest/AMRAP/EMOM/etc.). Ignore the marker time.',
		'Do not emit standalone transition phrases like "Then:" or fragments like "3 Minutes, Then:" as notes or steps.',
		'Do not output duplicate timers for the same transition and do not output consecutive Rest timers.',
		'Global metadata (e.g. "Suggestions", "Men/Women", "Weights", "Box height", "Equipment") should be a top-level note placed before any timers or steps.',
		'When parsing a web page, prefer the primary/Rx workout prescription. Ignore comments, user posts, and scaling/variant options unless there is no Rx section.',
		'Set workoutDefinition.title to the web page title (document title) or the workout name heading. Prefer a descriptive title over a date code. If none exists, generate a short, playful title using analogy or metaphor.',
		'Do NOT invent or substitute workouts, movements, or rep schemes.',
		'Preserve units and punctuation exactly in step labels (including commas).',
		'Do not include headings like "For time:" as a step block; encode scoring instead and then list only the workout movement lines as blocks.',
		'Use milliseconds for time fields (timeCapMs, workMs, restMs, durationMs, timeMs).',
	].join('\\n');

	const titleSystem = [
		'You generate a workout title from the provided inputs.',
		'IMPORTANT: If a workout URL is provided, you must use the URL Context tool to read it before answering.',
		'Do not guess or use prior knowledge. Only use information that is present in the provided inputs or retrieved via URL Context.',
		'If an explicit workout name or page title exists, use it.',
		'Otherwise, generate a short, playful title using analogy or metaphor.',
		'Keep it concise (about 3-8 words), PG, and without emojis.',
		'Return a JSON object that matches the provided schema.',
	].join('\\n');

	const inputSections: string[] = [];
	if (input.text) inputSections.push(`Workout text (verbatim):\\n${input.text}`);
	if (input.url) inputSections.push(`Workout URL:\\n${input.url}`);
	if (!inputSections.length && input.hasImage) {
		inputSections.push('Workout screenshot attached.');
	}

	const parseUser = [
		'Use URL Context for any URLs in the input or embedded in text.',
		'If the input is a workout name or a web search query (not a full workout), use the Google Search tool to find the workout details before answering.',
		'Extract the workout definition from the inputs and return it as workoutDefinition.',
		'If the URL content includes multiple workout variants (e.g. scaled/intermediate/beginner), choose the main/Rx version.',
		'',
		...inputSections,
	].join('\\n');

	const titleUser = [
		'Use URL Context for any URLs in the input or embedded in text.',
		'Generate a workout title from the inputs and return it as { "title": "..." }.',
		'',
		...inputSections,
	].join('\\n');

	return {
		parseSystem: `${system}\n\nReturn ONLY a single JSON object. No markdown.`,
		titleSystem: `${titleSystem}\n\nReturn ONLY a single JSON object. No markdown.`,
		parseUser,
		titleUser,
		inputSections,
	};
};

const normalizeBlocks = (blocks: WorkoutBlock[]): WorkoutBlock[] =>
	blocks.map((block) => {
		const next: WorkoutBlock = { ...block, blockId: block.blockId ?? uuidv7() };
		if (block.type === 'sequence' || block.type === 'repeat' || block.type === 'interval') {
			next.blocks = Array.isArray(block.blocks) ? normalizeBlocks(block.blocks) : [];
		} else if (Array.isArray(block.blocks)) {
			next.blocks = normalizeBlocks(block.blocks);
		}
		return next;
	});

const normalizeWorkoutDefinition = (definition: WorkoutDefinition): WorkoutDefinition => ({
	...definition,
	id: definition.id ?? uuidv7(),
	schemaVersion: LATEST_DATA_VERSION,
	blocks: Array.isArray(definition.blocks) ? normalizeBlocks(definition.blocks) : [],
});

const isCountdownTimer = (block: WorkoutBlock): boolean =>
	block.type === 'timer' && block.mode === 'countdown' && typeof block.durationMs === 'number';

type NormalizedScoring = {
	type: 'for_time' | 'amrap' | 'interval' | 'rounds';
	rounds?: number;
	timeCapMs?: number;
	workMs?: number;
	restMs?: number;
	startWith?: 'work' | 'rest';
	label?: string;
};

const applyScoringIntent = (scoring: NormalizedScoring | undefined, blocks: WorkoutBlock[]): WorkoutBlock[] => {
	if (!scoring) return blocks;

	if (scoring.type === 'rounds') {
		const rounds = scoring.rounds && scoring.rounds > 0 ? scoring.rounds : undefined;
		if (!rounds) return blocks;
		// Nested-only: model "N rounds" as a repeat block (not necessarily "for time").
		return [
			{
				type: 'repeat',
				blockId: uuidv7(),
				label: scoring.label ?? 'Round',
				rounds,
				blocks,
			},
		];
	}

	if (scoring.type === 'for_time') {
		const rounds = scoring.rounds && scoring.rounds > 0 ? scoring.rounds : undefined;
		if (!rounds) return blocks;
		// Nested-only: model "N rounds" as a repeat block.
		return [
			{
				type: 'repeat',
				blockId: uuidv7(),
				label: scoring.label ?? 'Round',
				rounds,
				scoringIntent: 'for_time',
				blocks,
			},
		];
	}

	if (scoring.type === 'amrap') {
		const timeCapMs = scoring.timeCapMs && scoring.timeCapMs > 0 ? scoring.timeCapMs : undefined;
		if (!timeCapMs) return blocks;

		// If the blocks already include countdown timers, treat this as a multi-section workout
		// and don't add another top-level time cap wrapper.
		if (blocks.some(isCountdownTimer)) return blocks;

		// Nested-only: AMRAP is a countdown "section" containing an open-ended repeat.
		return [
			{
				type: 'timer',
				blockId: uuidv7(),
				label: 'AMRAP',
				mode: 'countdown',
				durationMs: timeCapMs,
				blocks: [
					{
						type: 'repeat',
						blockId: uuidv7(),
						label: 'Round',
						// rounds omitted => open-ended (runner counts rounds via advances)
						blocks,
					},
				],
			},
		];
	}

	if (scoring.type === 'interval') {
		const rounds = scoring.rounds && scoring.rounds > 0 ? scoring.rounds : undefined;
		const workMs = scoring.workMs && scoring.workMs > 0 ? scoring.workMs : undefined;
		if (!rounds || !workMs) return blocks;
		const restMs = Math.max(0, scoring.restMs ?? 0);
		const startWith = scoring.startWith;
		return [
			{
				type: 'interval',
				blockId: uuidv7(),
				label: 'Intervals',
				rounds,
				workMs,
				restMs,
				...(startWith ? { startWith } : {}),
				blocks,
			},
		];
	}

	return blocks;
};

export async function parseWorkout(
	env: Env,
	input: { text?: string; url?: string; image?: File },
	opts?: { requestId?: string },
): Promise<{
	workoutDefinition: WorkoutDefinition;
	timerPlan: TimerPlan;
	assumptions: string[];
	source: { kind: 'text' | 'url' | 'image'; preview: string };
	meta: ParseMeta;
}> {
	const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
	if (!apiKey) {
		throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY. Add it to apps/worker/.dev.vars for local dev.');
	}

	// Prefer a stable model configuration for structured outputs in Workers.
	// Gemini 2.5 supports disabling "thinking" which helps avoid response-shape surprises.
	const modelId = PARSE_MODEL_ID;
	const titleModelId = TITLE_MODEL_ID;
	const google = createGoogleGenerativeAI({ apiKey });
	const model = google(modelId);
	const titleModel = google(titleModelId);

	const text = input.text?.trim() || undefined;
	const url = input.url?.trim() || undefined;
	const hasImage = !!input.image;
	if (!text && !url && !hasImage) {
		throw new Error('No input provided');
	}

	const requestId = opts?.requestId;
	console.info('[worker] parseWorkout start', {
		requestId,
		hasText: !!text,
		hasUrl: !!url,
		hasImage,
		textLen: text?.length ?? 0,
		urlLen: url?.length ?? 0,
		imageType: input.image?.type,
		imageSize: input.image?.size,
	});

	const promptSnapshot = buildPromptSnapshot({ text, url, hasImage });
	const userText = promptSnapshot.parseUser;
	const titleUserText = promptSnapshot.titleUser;

	const imageBytes = input.image ? await input.image.arrayBuffer() : undefined;
	const imageMediaType = input.image?.type || 'application/octet-stream';

	const content: Array<{ type: 'text'; text: string } | { type: 'file'; data: ArrayBuffer; mediaType: string }> = [
		{ type: 'text', text: userText },
	];
	const titleContent: Array<{ type: 'text'; text: string } | { type: 'file'; data: ArrayBuffer; mediaType: string }> = [
		{ type: 'text', text: titleUserText },
	];
	if (imageBytes) {
		content.push({ type: 'file', data: imageBytes, mediaType: imageMediaType });
		titleContent.push({ type: 'file', data: imageBytes, mediaType: imageMediaType });
	}

	const extractJsonObject = (value: string): unknown => {
		const trimmed = value.trim();
		// If the model wraps JSON in a code fence, strip it.
		const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
		const candidate = (fenced?.[1] ?? trimmed).trim();
		const start = candidate.indexOf('{');
		const end = candidate.lastIndexOf('}');
		if (start < 0 || end < 0 || end <= start) {
			throw new Error('No JSON object found in model output');
		}
		const jsonText = candidate.slice(start, end + 1);
		return JSON.parse(jsonText);
	};

	const shouldRetryModelError = (err: unknown): boolean => {
		if (!(err instanceof Error)) return false;
		if (err.message.includes('Invalid JSON response')) return true;
		if (err.message.includes('No JSON object found')) return true;
		if (err.message.includes('No output generated')) return true;
		if (err.message.includes('Unexpected end of JSON input')) return true;
		const causeAny = (err as any).cause;
		const causeName = typeof causeAny?.name === 'string' ? causeAny.name : '';
		// When structured output parsing fails, the SDK sometimes surfaces this as a type validation error.
		if (causeName.includes('TypeValidationError')) return true;
		return false;
	};

	const generateWorkoutTitle = async (): Promise<{
		title?: string;
		rawText?: string;
		providerMetadata?: any;
	}> => {
		try {
			const result = await generateText({
				model: titleModel,
				system: promptSnapshot.titleSystem,
				...(url
					? {
							tools: { url_context: google.tools.urlContext({}) },
							toolChoice: { type: 'tool', toolName: 'url_context' } as const,
						}
					: {}),
				stopWhen: stepCountIs(4),
				providerOptions: {
					google: {
						thinkingConfig: {
							thinkingBudget: 0,
							includeThoughts: false,
						},
						structuredOutputs: false,
					},
				},
				messages: [
					{
						role: 'user',
						content: titleContent,
					},
				],
			} as any);

			const rawText = result.text?.trim() ? result.text : undefined;
			if (!rawText) {
				return { title: undefined, rawText, providerMetadata: result.providerMetadata };
			}
			const raw = extractJsonObject(rawText);
			const parsed = LLMWorkoutTitleSchema.safeParse(raw);
			if (!parsed.success) {
				return { title: undefined, rawText, providerMetadata: result.providerMetadata };
			}
			return {
				title: sanitizeWorkoutTitle(parsed.data.title),
				rawText,
				providerMetadata: result.providerMetadata,
			};
		} catch (err) {
			const errName = err instanceof Error ? err.name : typeof err;
			const errMessage = err instanceof Error ? err.message : String(err);
			console.warn('[worker] title generation failed', { requestId, errName, errMessage });
			return { title: undefined };
		}
	};

	const parsePromise = (async () => {
		let output: unknown;
		let providerMetadata: any;
		let rawText: string | undefined;
		const maxAttempts = 3;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const baseProviderOptions = {
					google: {
						thinkingConfig: {
							thinkingLevel: 'low',
							includeThoughts: false,
						},
					},
				};

				const parseTools = {
					google_search: google.tools.googleSearch({ mode: 'MODE_DYNAMIC', dynamicThreshold: 0.7 }),
					...(url ? { url_context: google.tools.urlContext({}) } : {}),
				};

				// Always request plain text and JSON-parse it ourselves.
				// This avoids provider/runtime edge cases with structured outputs + thinking/tooling.
				const result = await generateText({
					model,
					system: promptSnapshot.parseSystem,
					tools: parseTools,
					...(url ? { toolChoice: { type: 'tool', toolName: 'url_context' } as const } : {}),
					stopWhen: stepCountIs(8),
					providerOptions: {
						...baseProviderOptions,
						google: {
							...baseProviderOptions.google,
							structuredOutputs: false,
						},
					},
					messages: [
						{
							role: 'user',
							content,
						},
					],
				} as any);

				if (!result.text?.trim()) throw new Error('No output generated.');
				rawText = result.text;
				output = extractJsonObject(result.text);
				providerMetadata = result.providerMetadata;
				break;
			} catch (err) {
				const errName = err instanceof Error ? err.name : typeof err;
				const errMessage = err instanceof Error ? err.message : String(err);
				const causeAny = err instanceof Error ? (err as any).cause : undefined;
				const causeName = typeof causeAny?.name === 'string' ? causeAny.name : undefined;
				const causeMessage = typeof causeAny?.message === 'string' ? causeAny.message : undefined;
				const causeKeys =
					causeAny && typeof causeAny === 'object' && !Array.isArray(causeAny) ? Object.keys(causeAny).slice(0, 12) : undefined;

				const willRetry = attempt < maxAttempts && shouldRetryModelError(err);
				console.error('[worker] generateObject failed', {
					requestId,
					attempt,
					maxAttempts,
					willRetry,
					errName,
					errMessage,
					causeName,
					causeMessage,
					causeKeys,
				});
				if (willRetry) continue;
				throw err;
			}
		}

		if (output === undefined) {
			throw new Error('Model did not return an output');
		}

		return { output, providerMetadata, rawModelText: rawText };
	})();

	const [parseOutcome, titleOutcome] = await Promise.allSettled([parsePromise, generateWorkoutTitle()]);
	if (parseOutcome.status === 'rejected') {
		throw parseOutcome.reason;
	}
	const { output, providerMetadata, rawModelText: parseRawModelText } = parseOutcome.value;
	const rawModelText = parseRawModelText;
	const titleResult = titleOutcome.status === 'fulfilled' ? titleOutcome.value : { title: undefined, rawText: undefined };
	const generatedTitle = titleResult.title;
	const titleRawText = titleResult.rawText;
	const titleProviderMetadata = titleResult.providerMetadata;

	const urlMetadata = providerMetadata?.google?.urlContextMetadata?.urlMetadata;
	const urlStatuses = Array.isArray(urlMetadata)
		? urlMetadata
				.map((m: any) => ({
					retrievedUrl: typeof m?.retrievedUrl === 'string' ? m.retrievedUrl : undefined,
					status: typeof m?.urlRetrievalStatus === 'string' ? m.urlRetrievalStatus : undefined,
				}))
				.filter((m: any) => m.retrievedUrl || m.status)
		: [];

	console.info('[worker] url context metadata', { requestId, urlStatuses });

	if (url) {
		const hasSuccess = urlStatuses.some((s: any) => typeof s.status === 'string' && s.status.includes('SUCCESS'));
		if (!hasSuccess) {
			const err: any = new Error('Could not retrieve the workout URL. Please try again or paste the workout text.');
			err.code = 'url_retrieval_failed';
			throw err;
		}
	}

	const coerceParseResult = (value: unknown): z.infer<typeof ParseResultSchema> => {
		const parsed = ParseResultSchema.safeParse(value);
		if (parsed.success) return parsed.data;

		// Some models occasionally return the workoutDefinition directly.
		const direct = LLMWorkoutDefinitionSchema.safeParse(value);
		if (direct.success) {
			return { workoutDefinition: direct.data, assumptions: ['Model returned workoutDefinition directly.'] };
		}

		// Some models use alternate casing.
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const anyValue = value as any;
			const alt = anyValue.workout_definition ?? anyValue.workout;
			const altParsed = LLMWorkoutDefinitionSchema.safeParse(alt);
			if (altParsed.success) {
				return { workoutDefinition: altParsed.data, assumptions: ['Model returned workoutDefinition under an alternate key.'] };
			}
		}

		console.error('[worker] parse result schema failed', {
			requestId,
			issues: parsed.error.issues.slice(0, 6),
			rawPreview: rawModelText ? rawModelText.slice(0, 800) : undefined,
		});
		throw parsed.error;
	};

	const result = coerceParseResult(output);
	const parsed = result.workoutDefinition;
	const resolvedTitle = selectWorkoutTitle(parsed.title, generatedTitle);
	console.info('[worker] parsed workoutDefinition', {
		requestId,
		title: resolvedTitle,
		scoringType: (parsed.scoring as any)?.type,
		blocksPreview: (parsed.blocks ?? []).slice(0, 6).map((b) => ({ type: b.type, label: b.label, text: b.text })),
	});

	const normalizeScoring = (raw: z.infer<typeof LLMWorkoutScoringSchema> | undefined): NormalizedScoring | undefined => {
		if (!raw) return undefined;
		const rawType = typeof raw.type === 'string' ? raw.type : '';
		const key = rawType.toLowerCase().replace(/[^a-z]/g, '');
		let type: NormalizedScoring['type'] | null = null;
		if (key === 'fortime') type = 'for_time';
		else if (key === 'amrap') type = 'amrap';
		else if (key === 'interval') type = 'interval';
		else if (key === 'rounds') type = 'rounds';
		else return undefined;

		const rounds =
			typeof raw.rounds === 'number' ? raw.rounds : typeof (raw as any).numRounds === 'number' ? Number((raw as any).numRounds) : undefined;
		const label = typeof raw.label === 'string' ? raw.label.trim() : undefined;

		return {
			type,
			...(typeof rounds === 'number' && Number.isFinite(rounds) && rounds > 0 ? { rounds: Math.trunc(rounds) } : {}),
			...(typeof raw.timeCapMs === 'number' ? { timeCapMs: raw.timeCapMs } : {}),
			...(typeof raw.workMs === 'number' ? { workMs: raw.workMs } : {}),
			...(typeof raw.restMs === 'number' ? { restMs: raw.restMs } : {}),
			...(raw.startWith === 'work' || raw.startWith === 'rest' ? { startWith: raw.startWith } : {}),
			...(label ? { label } : {}),
		};
	};
	const scoring = normalizeScoring(parsed.scoring);

	const parseDurationMs = (value: string): number | null => {
		const clock = value.match(/\b(\d{1,2}):(\d{2})\b/);
		if (clock) {
			const mins = Number.parseInt(clock[1] ?? '', 10);
			const secs = Number.parseInt(clock[2] ?? '', 10);
			if (Number.isFinite(mins) && Number.isFinite(secs) && mins >= 0 && secs >= 0 && secs < 60) {
				return (mins * 60 + secs) * 1000;
			}
		}
		const match = value.match(/\b(\d{1,3})\s*(sec|secs|second|seconds|min|mins|minute|minutes)\b/i);
		if (!match) return null;
		const n = Number.parseInt(match[1] ?? '', 10);
		if (!Number.isFinite(n) || n <= 0) return null;
		const unit = (match[2] ?? '').toLowerCase();
		if (unit.startsWith('sec')) return n * 1000;
		return n * 60 * 1000;
	};

	const inferTimer = (raw: string): { label: string; durationMs: number } | null => {
		const s = raw.trim();
		if (!s) return null;

		const rest = s.match(/^rest\b[\s:,-]*(.+)$/i);
		if (rest) {
			const durationMs = parseDurationMs(rest[1] ?? '');
			if (durationMs !== null) return { label: 'Rest', durationMs };
		}

		const emom = s.match(/\bemom\b/i);
		if (emom) {
			const durationMs = parseDurationMs(s);
			if (durationMs !== null) return { label: 'EMOM', durationMs };
		}

		const suffix = s.match(/^(.+?)\s*[:-]\s*(.+)$/);
		if (suffix) {
			const durationMs = parseDurationMs(suffix[2] ?? '');
			if (durationMs !== null) return { label: (suffix[1] ?? '').trim() || s, durationMs };
		}

		const prefix = s.match(/^(.+?)\s+(.*)$/);
		if (prefix) {
			const durationMs = parseDurationMs(prefix[1] ?? '');
			if (durationMs !== null) return { label: (prefix[2] ?? '').trim() || s, durationMs };
		}

		const durationMs = parseDurationMs(s);
		if (durationMs !== null) return { label: s, durationMs };
		return null;
	};

	const toWorkoutBlock = (b: z.infer<typeof LLMWorkoutBlockSchema>): WorkoutBlock => {
		const blockId = uuidv7();
		const childBlocks = Array.isArray(b.blocks) ? b.blocks.map(toWorkoutBlock) : undefined;
		const trimmedLabel = b.label?.trim();

		if (b.type === 'note') {
			return {
				type: 'note',
				blockId,
				text: b.text?.trim() || trimmedLabel || '',
			};
		}

		if (b.type === 'sequence') {
			return {
				type: 'sequence',
				blockId,
				...(trimmedLabel ? { label: trimmedLabel } : {}),
				blocks: childBlocks ?? [],
			};
		}

		if (b.type === 'repeat') {
			const rounds = typeof b.rounds === 'number' && Number.isFinite(b.rounds) && b.rounds > 0 ? Math.trunc(b.rounds) : undefined;
			return {
				type: 'repeat',
				blockId,
				...(trimmedLabel ? { label: trimmedLabel } : {}),
				...(rounds ? { rounds } : {}),
				blocks: childBlocks ?? [],
			};
		}

		if (b.type === 'timer') {
			let durationMs = typeof b.durationMs === 'number' ? b.durationMs : undefined;
			let label = trimmedLabel || b.text?.trim() || 'Timer';
			const normalizedMode = b.mode === 'countdown' || b.mode === 'countup' ? b.mode : undefined;
			let mode: WorkoutBlock['mode'] = normalizedMode ?? (durationMs !== undefined ? 'countdown' : 'countup');

			if (durationMs === undefined) {
				const inferred = inferTimer(label);
				if (inferred) {
					durationMs = inferred.durationMs;
					label = inferred.label;
					mode = 'countdown';
				}
			}

			return {
				type: 'timer',
				blockId,
				label,
				mode,
				...(durationMs === undefined ? {} : { durationMs }),
				...(childBlocks?.length ? { blocks: childBlocks } : {}),
			};
		}

		return {
			type: 'step',
			blockId,
			label: trimmedLabel || b.text?.trim() || 'Step',
		};
	};

	const blocks: WorkoutBlock[] = (parsed.blocks ?? []).map(toWorkoutBlock);

	const normalizeBlockTree = (items: WorkoutBlock[]): WorkoutBlock[] => {
		const normalized = nestCountdownGroups(coerceTimerHeaders(items));
		return normalized.map((block) => {
			if (block.blocks?.length) {
				return { ...block, blocks: normalizeBlockTree(block.blocks) };
			}
			return block;
		});
	};

	const filteredBlocks = blocks.filter((b) => {
		if (b.type !== 'step') return true;
		const label = (b.label ?? '').trim().toLowerCase();
		if (!label) return false;
		if (label === 'for time:' || label === 'for time') return false;
		if (label.startsWith('♀') || label.startsWith('♂')) return false;
		return true;
	});

	const normalizedBlocks = normalizeBlockTree(filteredBlocks);
	let blocksWithScoring = applyScoringIntent(scoring, normalizedBlocks);
	if (!blocksWithScoring.length) {
		blocksWithScoring = [{ type: 'step', blockId: uuidv7(), label: 'Unparsed workout (empty result)' }];
	}

	const workoutDefinition = normalizeWorkoutDefinition({
		id: uuidv7(),
		title: resolvedTitle,
		description: parsed.description,
		blocks: blocksWithScoring,
	});
	const timerPlan = TimerPlanSchema.parse(compileWorkoutDefinition(workoutDefinition));

	const sourceKind: 'text' | 'url' | 'image' = hasImage ? 'image' : url ? 'url' : 'text';
	const preview = hasImage
		? `image:${input.image?.type || 'application/octet-stream'}`
		: url
			? url.slice(0, 300)
			: (text ?? '').slice(0, 300);

	const meta: ParseMeta = {
		promptSnapshot,
		model: { parseModelId: modelId, titleModelId },
		raw: { parseText: rawModelText, titleText: titleRawText },
		providerMetadata: { parse: providerMetadata, title: titleProviderMetadata },
		urlStatuses,
	};

	return {
		workoutDefinition,
		timerPlan,
		assumptions: result.assumptions ?? [],
		source: { kind: sourceKind, preview },
		meta,
	};
}

import { Hono, type Context } from 'hono';
import { html } from 'hono/html';
import type { Env } from './env';
import { createAuth } from './auth';
import { parseWorkout } from './parse';
import { requireUserId } from './session';
import { APIError } from 'better-auth/api';
import { v7 as uuidv7 } from 'uuid';
import { fetchImageAsFile } from './fetch-image';
import {
	OG_IMAGE_CACHE_CONTROL,
	OG_IMAGE_CONTENT_TYPE,
	buildDefinitionOgKey,
	buildDefinitionOgObjectKey,
	generateAndStoreDefinitionOgImage,
	renderDefinitionOgPng,
} from './og';
import { z } from 'zod';
import {
	LATEST_DATA_VERSION,
	TimerPlanSchema,
	WorkoutDefinitionSchema,
	compileWorkoutDefinition,
	upgradeDefinitionData,
	type WorkoutDefinition,
} from '@wodbrains/core';

type HonoEnv = { Bindings: Env };

function jsonAny(c: Context<HonoEnv>, data: unknown, status: number) {
	// Hono's `c.json()` status typing is intentionally narrow; when forwarding upstream
	// status codes (or external libs), we may only have `number`.
	return c.json(data as any, status as any);
}

const DEFAULT_SITE_URL = 'https://wodbrains.com';
const DEFAULT_TITLE = 'WOD Brains magically builds a smart timer from any workout';
const DEFAULT_DESCRIPTION =
	'WOD Brains magically builds a smart timer from any workout. Paste a workout, drop a screenshot, or share a URL.';
const DEFAULT_OG_IMAGE = `${DEFAULT_SITE_URL}/og-image.jpg`;
const OG_IMAGE_URL_PREFIX = `${DEFAULT_SITE_URL}/og/definitions`;

type MetaPayload = {
	title: string;
	description: string;
	url: string;
	image?: string;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const upsertMetaTag = (htmlText: string, attr: 'name' | 'property', key: string, value: string) => {
	const tag = String(html`<meta ${attr}="${key}" content="${value}" />`);
	const pattern = new RegExp(`<meta\\s+${attr}="${escapeRegExp(key)}"\\s+content="[^"]*"\\s*/?>`, 'i');
	if (pattern.test(htmlText)) {
		return htmlText.replace(pattern, tag);
	}
	return htmlText.replace('</head>', `${tag}\n</head>`);
};

const upsertLinkCanonical = (htmlText: string, url: string) => {
	const tag = String(html`<link rel="canonical" href="${url}" />`);
	const pattern = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i;
	if (pattern.test(htmlText)) {
		return htmlText.replace(pattern, tag);
	}
	return htmlText.replace('</head>', `${tag}\n</head>`);
};

const upsertTitle = (htmlText: string, title: string) => {
	const tag = String(html`<title>${title}</title>`);
	const pattern = /<title>.*?<\/title>/is;
	if (pattern.test(htmlText)) {
		return htmlText.replace(pattern, tag);
	}
	return htmlText.replace('</head>', `${tag}\n</head>`);
};

const injectMetaTags = async (c: Context<HonoEnv>, meta: MetaPayload) => {
	const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
	const baseHtml = await assetResponse.text();
	const image = meta.image ?? DEFAULT_OG_IMAGE;

	let updatedHtml = baseHtml;
	updatedHtml = upsertTitle(updatedHtml, meta.title);
	updatedHtml = upsertMetaTag(updatedHtml, 'name', 'description', meta.description);
	updatedHtml = upsertMetaTag(updatedHtml, 'property', 'og:title', meta.title);
	updatedHtml = upsertMetaTag(updatedHtml, 'property', 'og:description', meta.description);
	updatedHtml = upsertMetaTag(updatedHtml, 'property', 'og:url', meta.url);
	updatedHtml = upsertMetaTag(updatedHtml, 'property', 'og:image', image);
	updatedHtml = upsertMetaTag(updatedHtml, 'name', 'twitter:title', meta.title);
	updatedHtml = upsertMetaTag(updatedHtml, 'name', 'twitter:description', meta.description);
	updatedHtml = upsertMetaTag(updatedHtml, 'name', 'twitter:image', image);
	updatedHtml = upsertLinkCanonical(updatedHtml, meta.url);

	return c.html(updatedHtml);
};

const getPlanTitle = (timerPlanJson?: string | null): string | null => {
	if (!timerPlanJson) return null;
	try {
		const parsed = JSON.parse(timerPlanJson) as { title?: unknown };
		if (typeof parsed?.title === 'string' && parsed.title.trim()) {
			return parsed.title.trim();
		}
	} catch {
		// ignore parse errors
	}
	return null;
};

const buildDefinitionOgUrl = (ogImageKey?: string | null) =>
	ogImageKey ? `${OG_IMAGE_URL_PREFIX}/${ogImageKey}.png` : DEFAULT_OG_IMAGE;

const formatMetaDescription = (opts: { preview?: string | null; title?: string | null }) => {
	const trimmedPreview = opts.preview?.trim();
	if (trimmedPreview) {
		return trimmedPreview.length > 180 ? `${trimmedPreview.slice(0, 177)}...` : trimmedPreview;
	}
	if (opts.title) {
		return `Run ${opts.title} with WOD Brains.`;
	}
	return DEFAULT_DESCRIPTION;
};

const isValidOgImageKey = (value: string) => /^[a-z0-9_-]+$/i.test(value) && value.length <= 200;

const ensureDefinitionOgKey = async (
	env: Env,
	params: { definitionId: string; ogImageKey?: string | null; updatedAt?: number | null },
): Promise<string | null> => {
	if (params.ogImageKey) return params.ogImageKey;
	if (!params.updatedAt) return null;
	const nextKey = buildDefinitionOgKey(params.definitionId, params.updatedAt);
	await env.DB.prepare(
		`update timer_definitions
     set ogImageKey = ?
     where definitionId = ?
       and (ogImageKey is null or ogImageKey = '')`,
	)
		.bind(nextKey, params.definitionId)
		.run();
	return nextKey;
};

const DefinitionSourceSchema = z
	.object({
		kind: z.string().optional(),
		preview: z.string().optional(),
	})
	.optional();

const CreateDefinitionBodySchema = z.object({
	workoutDefinition: z.unknown(),
	source: DefinitionSourceSchema,
	dataVersion: z.number().int().positive().optional(),
});

const PatchDefinitionBodySchema = z.object({
	workoutDefinition: z.unknown(),
	dataVersion: z.number().int().positive().optional(),
});

const IDEMPOTENCY_PENDING_TTL_MS = 2 * 60 * 1000;
const IDEMPOTENCY_COMPLETE_TTL_MS = 24 * 60 * 60 * 1000;

type IdempotencyRecord = {
	status: number | null;
	responseJson: string | null;
	expiresAt: number;
};

const getIdempotencyRecord = async (
	env: Env,
	params: { userId: string; key: string; method: string; path: string },
): Promise<IdempotencyRecord | null> => {
	const row = await env.DB.prepare(
		`select status, responseJson, expiresAt
     from idempotency_keys
     where userId = ? and idempotencyKey = ? and method = ? and path = ?`,
	)
		.bind(params.userId, params.key, params.method, params.path)
		.first<IdempotencyRecord>();
	return row ?? null;
};

const deleteIdempotencyRecord = async (env: Env, params: { userId: string; key: string; method: string; path: string }): Promise<void> => {
	await env.DB.prepare(
		`delete from idempotency_keys
     where userId = ? and idempotencyKey = ? and method = ? and path = ?`,
	)
		.bind(params.userId, params.key, params.method, params.path)
		.run();
};

const upsertPendingIdempotency = async (
	env: Env,
	params: { userId: string; key: string; method: string; path: string },
	now: number,
): Promise<void> => {
	const expiresAt = now + IDEMPOTENCY_PENDING_TTL_MS;
	await env.DB.prepare(
		`insert into idempotency_keys
      (userId, idempotencyKey, method, path, status, responseJson, createdAt, updatedAt, expiresAt)
     values (?, ?, ?, ?, null, null, ?, ?, ?)
     on conflict(userId, idempotencyKey, method, path)
     do update set status = null, responseJson = null, updatedAt = ?, expiresAt = ?`,
	)
		.bind(params.userId, params.key, params.method, params.path, now, now, expiresAt, now, expiresAt)
		.run();
};

const storeIdempotencyResponse = async (
	env: Env,
	params: { userId: string; key: string; method: string; path: string },
	res: Response,
	now: number,
): Promise<void> => {
	const bodyText = await res.clone().text();
	const expiresAt = now + IDEMPOTENCY_COMPLETE_TTL_MS;
	await env.DB.prepare(
		`update idempotency_keys
     set status = ?, responseJson = ?, updatedAt = ?, expiresAt = ?
     where userId = ? and idempotencyKey = ? and method = ? and path = ?`,
	)
		.bind(res.status, bodyText, now, expiresAt, params.userId, params.key, params.method, params.path)
		.run();
};

const withIdempotency = async (c: any, userId: string, handler: () => Promise<Response>): Promise<Response> => {
	const key = c.req.header('x-idempotency-key');
	if (!key) return await handler();

	const method = c.req.method.toUpperCase();
	const path = new URL(c.req.url).pathname;
	const params = { userId, key, method, path };
	const now = Date.now();

	const existing = await getIdempotencyRecord(c.env, params);
	if (existing) {
		if (existing.expiresAt <= now) {
			await deleteIdempotencyRecord(c.env, params);
		} else if (existing.status !== null && existing.status !== undefined) {
			return new Response(existing.responseJson ?? '', {
				status: existing.status,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'x-idempotency-replay': '1',
				},
			});
		} else {
			return new Response(JSON.stringify({ error: 'idempotency_pending', message: 'Request in progress' }), {
				status: 425,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}
	}

	await upsertPendingIdempotency(c.env, params, now);
	try {
		const res = await handler();
		await storeIdempotencyResponse(c.env, params, res, Date.now());
		return res;
	} catch (err) {
		await deleteIdempotencyRecord(c.env, params);
		throw err;
	}
};

export function createApp() {
	const app = new Hono<HonoEnv>();

	app.get('/api/ping', (c) => c.text('ok'));

	// Better Auth endpoints (GET/POST).
	app.on(['GET', 'POST'], '/api/auth/*', (c) => {
		const auth = createAuth(c.env);
		return auth.handler(c.req.raw);
	});

	// Parsing: text/url/image -> WorkoutDefinition + TimerPlan
	app.post('/api/parse', async (c) => {
		const contentType = c.req.header('content-type') ?? '';
		const requestId = c.req.header('x-request-id') ?? undefined;

		let text: string | undefined;
		let url: string | undefined;
		let image: File | undefined;
		let imageUrl: string | undefined;

		if (contentType.includes('application/json')) {
			const body = (await c.req.json()) as { text?: unknown; url?: unknown; imageUrl?: unknown };
			if (typeof body.text === 'string') text = body.text.trim();
			if (typeof body.url === 'string') url = body.url.trim();
			if (typeof body.imageUrl === 'string') imageUrl = body.imageUrl.trim();
		} else if (contentType.includes('multipart/form-data')) {
			const form = await c.req.raw.formData();
			const t = form.get('text');
			const u = form.get('url');
			const f = form.get('image');
			const iu = form.get('imageUrl');

			if (typeof t === 'string') text = t.trim();
			if (typeof u === 'string') url = u.trim();
			if (f && typeof f !== 'string') image = f;
			if (typeof iu === 'string') imageUrl = iu.trim();
		} else {
			return c.json({ error: 'unsupported_media_type', message: 'Use application/json or multipart/form-data' }, 415);
		}

		// Convenience: accept URL-as-text inputs (commonly pasted as a single URL).
		if (!url && text && /^https?:\/\//i.test(text) && !imageUrl) {
			url = text;
			text = undefined;
		}

		try {
			if (!image && imageUrl && c.env.STUB_PARSE !== '1') {
				image = await fetchImageAsFile(imageUrl, { requestId });
			}

			const input = { text, url, image };
			console.info('[worker] /api/parse', {
				requestId,
				contentType,
				hasText: !!text,
				hasUrl: !!url,
				hasImage: !!image,
				hasImageUrl: !!imageUrl,
				textLen: text?.length ?? 0,
				urlLen: url?.length ?? 0,
				imageType: image?.type,
				imageSize: image?.size,
				imageUrlLen: imageUrl?.length ?? 0,
			});

			if (c.env.STUB_PARSE === '1') {
				const def: WorkoutDefinition = {
					id: uuidv7(),
					schemaVersion: LATEST_DATA_VERSION,
					title: 'Stub workout',
					blocks: [
						{
							type: 'repeat',
							blockId: uuidv7(),
							label: 'Round',
							rounds: 5,
							scoringIntent: 'for_time',
							blocks: [
								{ type: 'step', blockId: uuidv7(), label: '5 push-ups' },
								{ type: 'step', blockId: uuidv7(), label: '10 sit-ups' },
								{ type: 'step', blockId: uuidv7(), label: '15 air squats' },
							],
						},
					],
				};
				const timerPlan = compileWorkoutDefinition(def);
				return c.json({
					workoutDefinition: def,
					timerPlan,
					assumptions: ['STUB_PARSE=1'],
					source: { kind: 'text', preview: 'stub' },
				});
			}

			const result = await parseWorkout(c.env, input, { requestId });
			return c.json(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const code =
				err && typeof err === 'object' && !Array.isArray(err) && typeof (err as any).code === 'string'
					? String((err as any).code)
					: 'parse_failed';
			return c.json({ error: code, message }, 500);
		}
	});

	// --- Definitions (D1-backed, shareable via /w/:definitionId) ---

	app.post('/api/definitions', async (c) => {
		try {
			const userId = await requireUserId(c.env, c.req.raw);
			return await withIdempotency(c, userId, async () => {
				const body = CreateDefinitionBodySchema.parse(await c.req.json());

				const now = Date.now();
				const definitionId = uuidv7();
				const ogImageKey = buildDefinitionOgKey(definitionId, now);

				// Upgrade incoming definition shape (legacy) to latest, then compile a fresh plan.
				const upgraded = upgradeDefinitionData({
					dataVersion: body.dataVersion ?? 1,
					workoutDefinition: body.workoutDefinition,
					timerPlan: { id: definitionId, mode: 'countup' } as any,
				});
				const workoutDefinition = WorkoutDefinitionSchema.parse(upgraded.workoutDefinition) as WorkoutDefinition;
				const timerPlan = TimerPlanSchema.parse(compileWorkoutDefinition(workoutDefinition));

				await c.env.DB.prepare(
					`insert into timer_definitions
            (definitionId, ownerUserId, sourceKind, sourcePreview, workoutDefinitionJson, timerPlanJson, ogImageKey, dataVersion, createdAt, updatedAt)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
					.bind(
						definitionId,
						userId,
						body.source?.kind ?? null,
						body.source?.preview ?? null,
						JSON.stringify(workoutDefinition),
						JSON.stringify(timerPlan),
						ogImageKey,
						LATEST_DATA_VERSION,
						now,
						now,
					)
					.run();

				if (c.executionCtx) {
					c.executionCtx.waitUntil(
						generateAndStoreDefinitionOgImage({
							env: c.env,
							ctx: c.executionCtx,
							ogImageKey,
							title: timerPlan.title ?? null,
						}),
					);
				}

				return c.json({ definitionId });
			});
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'create_definition_failed', message }, 500);
		}
	});

	app.get('/api/definitions', async (c) => {
		try {
			const userId = await requireUserId(c.env, c.req.raw);
			const takeRaw = c.req.query('take');
			const cursorRaw = c.req.query('cursor');

			let take = Number.parseInt(takeRaw ?? '20', 10);
			if (!Number.isFinite(take)) take = 20;
			take = Math.max(1, Math.min(50, take));

			let cursorSortId: string | null = null;
			let cursorDefinitionId: string | null = null;
			if (cursorRaw) {
				const [sortId, definitionId] = cursorRaw.split('|');
				if (sortId && definitionId) {
					cursorSortId = sortId;
					cursorDefinitionId = definitionId;
				}
			}

			let sql = `
        select
          d.definitionId,
          d.sourceKind,
          d.sourcePreview,
          d.timerPlanJson,
          max(r.runId) as lastRunId,
          max(r.startedAt) as lastRunAt,
          coalesce(max(r.runId), d.definitionId) as sortId
        from timer_definitions d
        left join timer_runs r
          on r.definitionId = d.definitionId
          and r.ownerUserId = d.ownerUserId
        where d.ownerUserId = ?
        group by d.definitionId
      `;

			const binds: unknown[] = [userId];

			if (cursorSortId && cursorDefinitionId) {
				sql += `
        having (
          coalesce(max(r.runId), d.definitionId) < ?
          or (coalesce(max(r.runId), d.definitionId) = ? and d.definitionId < ?)
        )
        `;
				binds.push(cursorSortId, cursorSortId, cursorDefinitionId);
			}

			sql += `
        order by sortId desc, d.definitionId desc
        limit ?
      `;
			binds.push(take);

			const rows = await c.env.DB.prepare(sql)
				.bind(...binds)
				.all<{
					definitionId: string;
					sourceKind: string | null;
					sourcePreview: string | null;
					timerPlanJson: string;
					lastRunId: string | null;
					lastRunAt: number | null;
					sortId: string;
				}>();

			const results = rows.results ?? [];
			const items = results.map((row) => {
				let title: string | null = null;
				try {
					const plan = JSON.parse(row.timerPlanJson) as { title?: unknown };
					if (typeof plan?.title === 'string' && plan.title.trim()) {
						title = plan.title.trim();
					}
				} catch {
					// ignore parse errors
				}

				return {
					definitionId: row.definitionId,
					title,
					source: { kind: row.sourceKind, preview: row.sourcePreview },
					lastRunId: row.lastRunId ?? null,
					lastRunAt: row.lastRunAt ?? null,
				};
			});

			let nextCursor: string | null = null;
			if (results.length === take) {
				const last = results[results.length - 1];
				if (last?.sortId) nextCursor = `${last.sortId}|${last.definitionId}`;
			}

			return c.json({ items, nextCursor });
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'list_definitions_failed', message }, 500);
		}
	});

	app.get('/api/definitions/:definitionId', async (c) => {
		const definitionId = c.req.param('definitionId');
		const row = await c.env.DB.prepare(
			`select definitionId, ownerUserId, sourceKind, sourcePreview, workoutDefinitionJson, timerPlanJson, dataVersion, createdAt, updatedAt
       from timer_definitions
       where definitionId = ?`,
		)
			.bind(definitionId)
			.first<{
				definitionId: string;
				ownerUserId: string;
				sourceKind: string | null;
				sourcePreview: string | null;
				workoutDefinitionJson: string;
				timerPlanJson: string;
				dataVersion: number | null;
				createdAt: number;
				updatedAt: number;
			}>();

		if (!row) return c.json({ error: 'not_found' }, 404);

		const parsedWorkoutDefinition = JSON.parse(row.workoutDefinitionJson);
		const parsedTimerPlan = JSON.parse(row.timerPlanJson);
		const currentVersion = row.dataVersion ?? 1;
		const upgraded = upgradeDefinitionData({
			dataVersion: currentVersion,
			workoutDefinition: parsedWorkoutDefinition,
			timerPlan: parsedTimerPlan,
		});

		const workoutDefinition = WorkoutDefinitionSchema.parse(upgraded.workoutDefinition) as WorkoutDefinition;
		const timerPlan = TimerPlanSchema.parse(upgraded.timerPlan);

		let updatedAt = row.updatedAt;
		if (currentVersion !== LATEST_DATA_VERSION) {
			const now = Date.now();
			updatedAt = now;
			await c.env.DB.prepare(
				`update timer_definitions
         set workoutDefinitionJson = ?, timerPlanJson = ?, dataVersion = ?, updatedAt = ?
         where definitionId = ? and ownerUserId = ?`,
			)
				.bind(JSON.stringify(workoutDefinition), JSON.stringify(timerPlan), LATEST_DATA_VERSION, now, definitionId, row.ownerUserId)
				.run();
		}

		return c.json({
			definitionId: row.definitionId,
			ownerUserId: row.ownerUserId,
			source: { kind: row.sourceKind, preview: row.sourcePreview },
			workoutDefinition,
			timerPlan,
			dataVersion: LATEST_DATA_VERSION,
			createdAt: row.createdAt,
			updatedAt,
		});
	});

	app.patch('/api/definitions/:definitionId', async (c) => {
		try {
			const userId = await requireUserId(c.env, c.req.raw);
			const definitionId = c.req.param('definitionId');
			return await withIdempotency(c, userId, async () => {
				const body = PatchDefinitionBodySchema.parse(await c.req.json());

				const locked = await c.env.DB.prepare(
					`select 1 from timer_runs
           where definitionId = ?
             and ownerUserId = ?
             and startedAt is not null
           limit 1`,
				)
					.bind(definitionId, userId)
					.first();

				if (locked) {
					return c.json({ error: 'timer_locked', message: 'Timer cannot be edited after it starts.' }, 409);
				}

				const existing = await c.env.DB.prepare(
					`select workoutDefinitionJson
           from timer_definitions
           where definitionId = ? and ownerUserId = ?
           limit 1`,
				)
					.bind(definitionId, userId)
					.first<{ workoutDefinitionJson: string }>();

				if (!existing) {
					return c.json({ error: 'not_found' }, 404);
				}

				let existingWorkoutDefinitionId = definitionId;
				try {
					const parsedExisting = JSON.parse(existing.workoutDefinitionJson) as { id?: unknown };
					if (typeof parsedExisting?.id === 'string' && parsedExisting.id.trim()) {
						existingWorkoutDefinitionId = parsedExisting.id;
					}
				} catch {
					// ignore parse errors
				}

				const now = Date.now();
				const upgraded = upgradeDefinitionData({
					dataVersion: body.dataVersion ?? 1,
					workoutDefinition: body.workoutDefinition,
					timerPlan: { id: definitionId, mode: 'countup' } as any,
				});
				let workoutDefinition = WorkoutDefinitionSchema.parse(upgraded.workoutDefinition) as WorkoutDefinition;
				workoutDefinition = { ...workoutDefinition, id: existingWorkoutDefinitionId };
				const timerPlan = TimerPlanSchema.parse(compileWorkoutDefinition(workoutDefinition));
				const ogImageKey = buildDefinitionOgKey(definitionId, now);

				const res = await c.env.DB.prepare(
					`update timer_definitions
           set workoutDefinitionJson = ?, timerPlanJson = ?, ogImageKey = ?, dataVersion = ?, updatedAt = ?
           where definitionId = ? and ownerUserId = ?`,
				)
					.bind(
						JSON.stringify(workoutDefinition),
						JSON.stringify(timerPlan),
						ogImageKey,
						LATEST_DATA_VERSION,
						now,
						definitionId,
						userId,
					)
					.run();

				if (!res.success || res.meta.changes === 0) {
					return c.json({ error: 'not_found' }, 404);
				}

				if (c.executionCtx) {
					c.executionCtx.waitUntil(
						generateAndStoreDefinitionOgImage({
							env: c.env,
							ctx: c.executionCtx,
							ogImageKey,
							title: timerPlan.title ?? null,
						}),
					);
				}

				return c.json({ definitionId });
			});
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'update_definition_failed', message }, 500);
		}
	});

	app.post('/api/definitions/:definitionId/copy', async (c) => {
		try {
			const userId = await requireUserId(c.env, c.req.raw);
			const definitionId = c.req.param('definitionId');
			return await withIdempotency(c, userId, async () => {
				const row = await c.env.DB.prepare(
					`select workoutDefinitionJson, timerPlanJson, sourceKind, sourcePreview, dataVersion
           from timer_definitions
           where definitionId = ?`,
				)
					.bind(definitionId)
					.first<{
						workoutDefinitionJson: string;
						timerPlanJson: string;
						sourceKind: string | null;
						sourcePreview: string | null;
						dataVersion: number | null;
					}>();

				if (!row) return c.json({ error: 'not_found' }, 404);

				const newDefinitionId = uuidv7();
				const now = Date.now();
				const ogImageKey = buildDefinitionOgKey(newDefinitionId, now);

				const upgraded = upgradeDefinitionData({
					dataVersion: row.dataVersion ?? 1,
					workoutDefinition: JSON.parse(row.workoutDefinitionJson),
					timerPlan: JSON.parse(row.timerPlanJson),
				});

				let workoutDefinition = WorkoutDefinitionSchema.parse(upgraded.workoutDefinition) as WorkoutDefinition;
				workoutDefinition = { ...workoutDefinition, id: uuidv7() };

				let timerPlan = TimerPlanSchema.parse(upgraded.timerPlan);
				timerPlan = { ...timerPlan, id: uuidv7() };

				await c.env.DB.prepare(
					`insert into timer_definitions
            (definitionId, ownerUserId, sourceKind, sourcePreview, workoutDefinitionJson, timerPlanJson, ogImageKey, dataVersion, createdAt, updatedAt)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
					.bind(
						newDefinitionId,
						userId,
						row.sourceKind,
						row.sourcePreview,
						JSON.stringify(workoutDefinition),
						JSON.stringify(timerPlan),
						ogImageKey,
						LATEST_DATA_VERSION,
						now,
						now,
					)
					.run();

				if (c.executionCtx) {
					c.executionCtx.waitUntil(
						generateAndStoreDefinitionOgImage({
							env: c.env,
							ctx: c.executionCtx,
							ogImageKey,
							title: timerPlan.title ?? null,
						}),
					);
				}

				return c.json({ definitionId: newDefinitionId });
			});
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'copy_definition_failed', message }, 500);
		}
	});

	// --- Runs (Durable Object-backed) ---

	app.post('/api/runs', async (c) => {
		try {
			// Ensure the user has a session (anonymous is fine).
			const userId = await requireUserId(c.env, c.req.raw);
			return await withIdempotency(c, userId, async () => {
				const body = (await c.req.json()) as { timerPlan?: unknown; definitionId?: unknown };
				if (!body?.timerPlan) return c.json({ error: 'bad_request', message: 'timerPlan is required' }, 400);

				const runId = uuidv7();
				const stub = c.env.RUN_ACTOR.getByName(runId);

				const init = await stub.fetch('https://run/init', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ runId, timerPlan: body.timerPlan }),
				});

				const now = Date.now();
				const definitionId = typeof body.definitionId === 'string' ? body.definitionId : null;
				await c.env.DB.prepare(
					`insert into timer_runs (runId, definitionId, ownerUserId, createdAt, updatedAt)
           values (?, ?, ?, ?, ?)`,
				)
					.bind(runId, definitionId, userId, now, now)
					.run();

				const snapshot = await init.json();
				return c.json({ runId, snapshot });
			});
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'create_run_failed', message }, 500);
		}
	});

	app.get('/api/runs/:runId', async (c) => {
		const runId = c.req.param('runId');
		const stub = c.env.RUN_ACTOR.getByName(runId);
		const res = await stub.fetch('https://run/snapshot');
		if (!res.ok) return res;
		const snapshot = (await res.json()) as Record<string, unknown>;
		const row = await c.env.DB.prepare(`select definitionId from timer_runs where runId = ?`)
			.bind(runId)
			.first<{ definitionId: string | null }>();
		return jsonAny(
			c,
			{
				...snapshot,
				definitionId: row?.definitionId ?? null,
			},
			res.status,
		);
	});

	app.get('/api/runs/:runId/access', async (c) => {
		try {
			const userId = await requireUserId(c.env, c.req.raw);
			const runId = c.req.param('runId');
			const row = await c.env.DB.prepare(`select ownerUserId from timer_runs where runId = ?`)
				.bind(runId)
				.first<{ ownerUserId: string }>();
			if (!row) return c.json({ error: 'not_found' }, 404);
			return c.json({ canControl: row.ownerUserId === userId });
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'run_access_failed', message }, 500);
		}
	});

	app.post('/api/runs/:runId/events', async (c) => {
		try {
			const userId = await requireUserId(c.env, c.req.raw);
			const runId = c.req.param('runId');
			const stub = c.env.RUN_ACTOR.getByName(runId);

			const row = await c.env.DB.prepare(`select ownerUserId from timer_runs where runId = ?`)
				.bind(runId)
				.first<{ ownerUserId: string }>();
			if (!row) return c.json({ error: 'not_found' }, 404);
			if (row.ownerUserId !== userId) {
				return c.json({ error: 'view_only', message: 'This run is view-only in this browser.' }, 403);
			}

			const body = (await c.req.json()) as Record<string, unknown>;
			const event = {
				id: typeof body.id === 'string' ? body.id : uuidv7(),
				type: body.type,
				atMs: typeof body.atMs === 'number' ? body.atMs : Date.now(),
				label: body.label,
				targetEventId: body.targetEventId,
			};
			if (typeof event.atMs === 'number') {
				event.atMs = Math.round(event.atMs);
			}

			const response = await stub.fetch('https://run/event', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(event),
			});

			if (event.type === 'start') {
				await c.env.DB.prepare(
					`update timer_runs
         set startedAt = coalesce(startedAt, ?),
             updatedAt = ?
         where runId = ?`,
				)
					.bind(Date.now(), Date.now(), runId)
					.run();
			}

			const data = await response.json();
			return jsonAny(c, data, response.status);
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'run_event_failed', message }, 500);
		}
	});

	app.patch('/api/runs/:runId/settings', async (c) => {
		try {
			const userId = await requireUserId(c.env, c.req.raw);
			const runId = c.req.param('runId');
			const stub = c.env.RUN_ACTOR.getByName(runId);

			const row = await c.env.DB.prepare(`select ownerUserId from timer_runs where runId = ?`)
				.bind(runId)
				.first<{ ownerUserId: string }>();
			if (!row) return c.json({ error: 'not_found' }, 404);
			if (row.ownerUserId !== userId) {
				return c.json({ error: 'view_only', message: 'This run is view-only in this browser.' }, 403);
			}

			const body = (await c.req.json()) as Record<string, unknown>;
			const settings = {
				timeScale: typeof body.timeScale === 'number' ? body.timeScale : undefined,
			};

			const response = await stub.fetch('https://run/settings', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(settings),
			});

			const data = await response.json();
			return jsonAny(c, data, response.status);
		} catch (err) {
			if (err instanceof APIError) {
				const status: number =
					typeof (err as any).status === 'number'
						? (err as any).status
						: typeof (err as any).statusCode === 'number'
							? (err as any).statusCode
							: 500;
				const code = typeof (err as any).code === 'string' ? (err as any).code : 'auth_error';
				return jsonAny(c, { error: code, message: err.message }, status);
			}
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ error: 'run_settings_failed', message }, 500);
		}
	});

	app.get('/api/runs/:runId/ws', async (c) => {
		const runId = c.req.param('runId');
		const stub = c.env.RUN_ACTOR.getByName(runId);

		// Forward the WebSocket upgrade request to the Durable Object.
		const req = c.req.raw;
		const url = new URL(req.url);
		url.pathname = '/ws';
		url.search = '';

		const forwarded = new Request(url.toString(), req);
		return await stub.fetch(forwarded);
	});

	// Dev/admin endpoint for programmatic DB migrations (Better Auth schema + plugins).
	// Note: Better Auth programmatic migrations rely on DB introspection which is not permitted by D1.
	// We use Wrangler D1 migrations instead.
	app.post('/api/admin/migrate', async (c) => {
		return c.json(
			{
				error: 'not_supported',
				message:
					'D1 does not allow the DB introspection needed for programmatic migrations. Use Wrangler D1 migrations instead: wrangler d1 migrations apply wodbrains --local',
			},
			501,
		);
	});

	// --- Dynamic OG images (per definition) ---
	app.get('/og/definitions/:ogImageKey', async (c) => {
		const rawKey = c.req.param('ogImageKey');

		const ogImageKey = rawKey?.endsWith('.png') ? rawKey.slice(0, -4) : rawKey;
		if (!ogImageKey || !isValidOgImageKey(ogImageKey)) {
			return c.text('not_found', 404);
		}

		const row = await c.env.DB.prepare(
			`select timerPlanJson
       from timer_definitions
       where ogImageKey = ?`,
		)
			.bind(ogImageKey)
			.first<{ timerPlanJson: string | null }>();

		if (!row) return c.text('not_found', 404);

		const objectKey = buildDefinitionOgObjectKey(ogImageKey);
		const existing = await c.env.OG_IMAGES.get(objectKey);
		if (existing) {
			const headers = new Headers();
			existing.writeHttpMetadata(headers);
			headers.set('cache-control', OG_IMAGE_CACHE_CONTROL);
			headers.set('content-type', headers.get('content-type') ?? OG_IMAGE_CONTENT_TYPE);
			return new Response(existing.body, { headers });
		}

		if (!c.executionCtx) {
			return c.text('execution_context_missing', 500);
		}

		const planTitle = getPlanTitle(row.timerPlanJson);
		const bytes = await renderDefinitionOgPng({
			title: planTitle,
			ctx: c.executionCtx,
			useStub: c.env.STUB_OG === '1',
		});

		c.executionCtx.waitUntil(
			c.env.OG_IMAGES.put(objectKey, bytes, {
				httpMetadata: {
					contentType: OG_IMAGE_CONTENT_TYPE,
					cacheControl: OG_IMAGE_CACHE_CONTROL,
				},
			}),
		);

		return new Response(bytes, {
			headers: {
				'content-type': OG_IMAGE_CONTENT_TYPE,
				'cache-control': OG_IMAGE_CACHE_CONTROL,
			},
		});
	});

	// --- Meta tags for sharing (server-side) ---
	app.get('/w/:definitionId', async (c) => {
		const definitionId = c.req.param('definitionId');
		const row = await c.env.DB.prepare(
			`select timerPlanJson, sourcePreview, ogImageKey, updatedAt
       from timer_definitions
       where definitionId = ?`,
		)
			.bind(definitionId)
			.first<{ timerPlanJson: string; sourcePreview: string | null; ogImageKey: string | null; updatedAt: number }>();

		if (!row) {
			return injectMetaTags(c, {
				title: DEFAULT_TITLE,
				description: DEFAULT_DESCRIPTION,
				url: `${DEFAULT_SITE_URL}/w/${definitionId}`,
			});
		}

		const planTitle = getPlanTitle(row.timerPlanJson);
		const ogImageKey = await ensureDefinitionOgKey(c.env, {
			definitionId,
			ogImageKey: row.ogImageKey,
			updatedAt: row.updatedAt,
		});
		const title = planTitle ? `${planTitle} - WOD Brains` : DEFAULT_TITLE;
		const description = formatMetaDescription({ preview: row.sourcePreview, title: planTitle });
		const url = `${DEFAULT_SITE_URL}/w/${definitionId}`;

		if (c.executionCtx && ogImageKey && ogImageKey !== row.ogImageKey) {
			c.executionCtx.waitUntil(
				generateAndStoreDefinitionOgImage({
					env: c.env,
					ctx: c.executionCtx,
					ogImageKey,
					title: planTitle ?? null,
				}),
			);
		}

		return injectMetaTags(c, { title, description, url, image: buildDefinitionOgUrl(ogImageKey) });
	});

	app.get('/r/:runId', async (c) => {
		const runId = c.req.param('runId');
		const row = await c.env.DB.prepare(
			`select r.definitionId, d.timerPlanJson, d.sourcePreview, d.ogImageKey, d.updatedAt
       from timer_runs r
       left join timer_definitions d on d.definitionId = r.definitionId
       where r.runId = ?`,
		)
			.bind(runId)
			.first<{
				definitionId: string | null;
				timerPlanJson: string | null;
				sourcePreview: string | null;
				ogImageKey: string | null;
				updatedAt: number | null;
			}>();

		if (!row) {
			return injectMetaTags(c, {
				title: DEFAULT_TITLE,
				description: DEFAULT_DESCRIPTION,
				url: `${DEFAULT_SITE_URL}/r/${runId}`,
			});
		}

		const planTitle = getPlanTitle(row.timerPlanJson);
		const ogImageKey = row.definitionId
			? await ensureDefinitionOgKey(c.env, {
					definitionId: row.definitionId,
					ogImageKey: row.ogImageKey,
					updatedAt: row.updatedAt ?? null,
				})
			: null;
		const title = planTitle ? `${planTitle} - WOD Brains` : 'Workout Run - WOD Brains';
		const description = formatMetaDescription({ preview: row.sourcePreview, title: planTitle });
		const url = `${DEFAULT_SITE_URL}/r/${runId}`;

		if (c.executionCtx && ogImageKey && ogImageKey !== row.ogImageKey) {
			c.executionCtx.waitUntil(
				generateAndStoreDefinitionOgImage({
					env: c.env,
					ctx: c.executionCtx,
					ogImageKey,
					title: planTitle ?? null,
				}),
			);
		}

		return injectMetaTags(c, { title, description, url, image: buildDefinitionOgUrl(ogImageKey) });
	});

	// Serve the SPA + static assets (Workers Static Assets binding).
	app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

	return app;
}

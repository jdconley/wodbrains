import { DurableObject } from 'cloudflare:workers';
import { RunEventSchema, TimerPlanSchema, deriveRunState, upgradeRunData, type TimerPlan } from '@wodbrains/core';
import { z } from 'zod';
import type { Env } from './env';

const RunSettingsSchema = z.object({
	timeScale: z.number().finite().positive(),
});

const StoredRunAnySchema = z.object({
	runId: z.string().min(1),
	timerPlan: z.unknown(),
	events: z.array(z.unknown()),
	dataVersion: z.number().optional(),
	createdAtMs: z.number(),
	updatedAtMs: z.number(),
	settings: z.unknown().optional(),
});

const StoredRunSchema = z.object({
	runId: z.string().min(1),
	timerPlan: TimerPlanSchema,
	events: z.array(RunEventSchema),
	dataVersion: z.number(),
	createdAtMs: z.number(),
	updatedAtMs: z.number(),
	settings: RunSettingsSchema,
});

type StoredRun = z.infer<typeof StoredRunSchema>;

type StoredClock = {
	baseMonoMs: number;
	baseWallMs: number;
};

const InitBodySchema = z.object({
	runId: z.string().min(1),
	timerPlan: z.unknown(),
});

const SettingsUpdateSchema = z.object({
	timeScale: z.number().finite().positive().optional(),
});

const DEFAULT_SETTINGS = { timeScale: 1 };
const clampTimeScale = (value: number) => Math.max(0.1, Math.min(600, value));

function json(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data), {
		headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) },
		...init,
	});
}

export class RunActor extends DurableObject {
	private readonly runKey = 'run';
	private readonly clockKey = 'clock';
	private readonly presenceIntervalMs = 1000;
	private clockLoaded = false;
	private clockBaseMonoMs = 0;
	private clockBaseWallMs = 0;
	private clockBasePerfMs = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	private async ensureClock(): Promise<void> {
		if (this.clockLoaded) return;
		const stored = await this.ctx.storage.get<StoredClock | undefined>(this.clockKey);
		let baseMonoMs = 0;
		if (stored && typeof stored.baseMonoMs === 'number' && typeof stored.baseWallMs === 'number') {
			const wallDelta = Date.now() - stored.baseWallMs;
			baseMonoMs = stored.baseMonoMs + (Number.isFinite(wallDelta) ? wallDelta : 0);
		}
		this.clockBaseMonoMs = baseMonoMs;
		this.clockBaseWallMs = Date.now();
		this.clockBasePerfMs = performance.now();
		this.clockLoaded = true;
		await this.ctx.storage.put(this.clockKey, {
			baseMonoMs: this.clockBaseMonoMs,
			baseWallMs: this.clockBaseWallMs,
		});
	}

	private async nowMonoMs(): Promise<number> {
		await this.ensureClock();
		const elapsed = performance.now() - this.clockBasePerfMs;
		return this.clockBaseMonoMs + elapsed;
	}

	private async persistClock(nowMonoMs: number): Promise<void> {
		await this.ensureClock();
		this.clockBaseMonoMs = nowMonoMs;
		this.clockBaseWallMs = Date.now();
		this.clockBasePerfMs = performance.now();
		await this.ctx.storage.put(this.clockKey, {
			baseMonoMs: this.clockBaseMonoMs,
			baseWallMs: this.clockBaseWallMs,
		});
	}

	private async readRun(): Promise<StoredRun | null> {
		const stored = await this.ctx.storage.get<unknown>(this.runKey);
		if (!stored) return null;

		const parsed = StoredRunAnySchema.parse(stored);
		const dataVersion = parsed.dataVersion ?? 1;
		const upgraded = upgradeRunData({
			dataVersion,
			timerPlan: parsed.timerPlan,
			events: parsed.events,
		});
		const settingsParsed = RunSettingsSchema.safeParse(parsed.settings ?? DEFAULT_SETTINGS);
		const settings = settingsParsed.success ? settingsParsed.data : DEFAULT_SETTINGS;
		const run = StoredRunSchema.parse({
			...parsed,
			timerPlan: upgraded.timerPlan,
			events: upgraded.events,
			dataVersion: upgraded.dataVersion,
			settings,
		});

		if (upgraded.dataVersion !== dataVersion) {
			await this.writeRun({ ...run, updatedAtMs: Date.now() });
		}

		return run;
	}

	private async writeRun(run: StoredRun): Promise<void> {
		const parsed = StoredRunSchema.parse(run);
		await this.ctx.storage.put(this.runKey, parsed);
	}

	private snapshot(run: StoredRun, nowMs: number) {
		return {
			runId: run.runId,
			timerPlan: run.timerPlan,
			events: run.events,
			serverNowMonoMs: nowMs,
			timeScale: run.settings.timeScale,
			derived: deriveRunState(run.timerPlan, run.events, nowMs),
			onlineCount: this.ctx.getWebSockets().length,
		};
	}

	private broadcast(snapshot: unknown) {
		const msg = JSON.stringify({ type: 'snapshot', snapshot });
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(msg);
			} catch {
				// ignore
			}
		}
	}

	async alarm(): Promise<void> {
		const run = await this.readRun();
		if (!run) return;

		const sockets = this.ctx.getWebSockets();
		if (sockets.length === 0) return;

		const nowMonoMs = await this.nowMonoMs();
		this.broadcast(this.snapshot(run, nowMonoMs));
		void this.persistClock(nowMonoMs);

		// Keep emitting presence snapshots while anyone is connected.
		await this.ctx.storage.setAlarm(Date.now() + this.presenceIntervalMs);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname.replace(/\/+$/, '') || '/';

		// WebSocket upgrade
		if (pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
			const run = await this.readRun();
			if (!run) return new Response('Run not initialized', { status: 404 });

			const pair = new WebSocketPair();
			const client = pair[0];
			const server = pair[1];

			this.ctx.acceptWebSocket(server);

			// Send initial snapshot immediately.
			const nowMonoMs = await this.nowMonoMs();
			server.send(JSON.stringify({ type: 'snapshot', snapshot: this.snapshot(run, nowMonoMs) }));
			void this.persistClock(nowMonoMs);
			// Broadcast presence update to all clients.
			this.broadcast(this.snapshot(run, nowMonoMs));
			// Ensure we keep updating presence even if close events are delayed.
			void this.ctx.storage.setAlarm(Date.now() + this.presenceIntervalMs);

			return new Response(null, { status: 101, webSocket: client });
		}

		if (pathname === '/init' && request.method === 'POST') {
			const body = InitBodySchema.parse(await request.json());
			const nowMonoMs = await this.nowMonoMs();

			const existing = await this.readRun();
			if (existing) {
				// Idempotent init.
				return json(this.snapshot(existing, nowMonoMs));
			}

			const upgraded = upgradeRunData({ dataVersion: 1, timerPlan: body.timerPlan, events: [] });
			const run: StoredRun = {
				runId: body.runId,
				timerPlan: upgraded.timerPlan as TimerPlan,
				events: [],
				dataVersion: upgraded.dataVersion,
				createdAtMs: nowMonoMs,
				updatedAtMs: nowMonoMs,
				settings: DEFAULT_SETTINGS,
			};

			await this.writeRun(run);
			void this.persistClock(nowMonoMs);
			return json(this.snapshot(run, nowMonoMs));
		}

		if (pathname === '/snapshot' && request.method === 'GET') {
			const run = await this.readRun();
			if (!run) return new Response('Run not initialized', { status: 404 });
			const nowMonoMs = await this.nowMonoMs();
			void this.persistClock(nowMonoMs);
			return json(this.snapshot(run, nowMonoMs));
		}

		if (pathname === '/settings' && request.method === 'PATCH') {
			const run = await this.readRun();
			if (!run) return new Response('Run not initialized', { status: 404 });
			if (run.events.some((event) => event.type === 'start')) {
				return json(
					{ error: 'run_started', message: 'Run settings cannot change after start.' },
					{ status: 409 },
				);
			}

			const body = SettingsUpdateSchema.parse(await request.json());
			const nextTimeScale =
				typeof body.timeScale === 'number' && Number.isFinite(body.timeScale)
					? clampTimeScale(body.timeScale)
					: run.settings.timeScale;
			run.settings = { ...run.settings, timeScale: nextTimeScale };
			const nowMonoMs = await this.nowMonoMs();
			run.updatedAtMs = nowMonoMs;
			await this.writeRun(run);

			const snap = this.snapshot(run, nowMonoMs);
			this.broadcast(snap);
			void this.persistClock(nowMonoMs);
			return json(snap);
		}

		if (pathname === '/event' && request.method === 'POST') {
			const run = await this.readRun();
			if (!run) return new Response('Run not initialized', { status: 404 });

			const event = RunEventSchema.parse(await request.json());

			if (run.events.some((existing) => existing.id === event.id)) {
				return json(this.snapshot(run, Date.now()));
			}

			run.events.push(event);
			const nowMonoMs = await this.nowMonoMs();
			run.updatedAtMs = nowMonoMs;
			await this.writeRun(run);

			const snap = this.snapshot(run, nowMonoMs);
			this.broadcast(snap);
			void this.persistClock(nowMonoMs);

			return json(snap);
		}

		// Basic RPC-style ping for debugging.
		if (pathname === '/ping') {
			const nowMonoMs = await this.nowMonoMs();
			return json({ ok: true, nowMonoMs });
		}

		return new Response('Not found', { status: 404 });
	}

	webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		// Optional: allow clients to send pings or events later.
		try {
			const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
			const data = JSON.parse(text) as { type?: string };
			if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong', nowMs: Date.now() }));
		} catch {
			// ignore
		}
	}

	async webSocketClose(_ws: WebSocket) {
		const run = await this.readRun();
		if (!run) return;
		const nowMonoMs = await this.nowMonoMs();
		this.broadcast(this.snapshot(run, nowMonoMs));
		void this.persistClock(nowMonoMs);
	}

	webSocketError(_ws: WebSocket, _err: unknown) {
		// No-op
	}
}

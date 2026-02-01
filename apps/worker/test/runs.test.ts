import { describe, expect, it } from 'vitest';
import { SELF } from 'cloudflare:test';
import { LATEST_DATA_VERSION } from '@wodbrains/core';

describe('Worker runs API', () => {
	it('signs in anonymously and creates a run', async () => {
		const signIn = await SELF.fetch('https://example.com/api/auth/sign-in/anonymous', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});

		expect(signIn.status).toBe(200);
		const setCookie = signIn.headers.get('set-cookie');
		expect(setCookie).toBeTruthy();
		const cookie = setCookie!.split(';')[0];

		const create = await SELF.fetch('https://example.com/api/runs', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ timerPlan: { id: 'plan', mode: 'countup' } }),
		});

		expect(create.status).toBe(200);
		const created = (await create.json()) as { runId: string; snapshot: any };
		expect(created.runId).toMatch(/[0-9a-f-]{10,}/i);
		expect(created.snapshot?.runId).toBe(created.runId);
		expect(Array.isArray(created.snapshot?.events)).toBe(true);
		expect(created.snapshot.events.length).toBe(0);

		const snapRes = await SELF.fetch(`https://example.com/api/runs/${created.runId}`, {
			headers: { cookie },
		});
		expect(snapRes.status).toBe(200);
		const snap = (await snapRes.json()) as any;
		expect(snap.runId).toBe(created.runId);
		expect(snap.timerPlan?.schemaVersion).toBe(LATEST_DATA_VERSION);
	});

	it('respects idempotency keys for create run', async () => {
		const signIn = await SELF.fetch('https://example.com/api/auth/sign-in/anonymous', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
		const cookie = signIn.headers.get('set-cookie')!.split(';')[0];
		const idempotencyKey = crypto.randomUUID();

		const first = await SELF.fetch('https://example.com/api/runs', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie, 'x-idempotency-key': idempotencyKey },
			body: JSON.stringify({ timerPlan: { id: 'plan', mode: 'countup' } }),
		});
		expect(first.status).toBe(200);
		const created = (await first.json()) as { runId: string };

		const second = await SELF.fetch('https://example.com/api/runs', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie, 'x-idempotency-key': idempotencyKey },
			body: JSON.stringify({ timerPlan: { id: 'plan', mode: 'countup' } }),
		});
		expect(second.status).toBe(200);
		const replay = (await second.json()) as { runId: string };
		expect(replay.runId).toBe(created.runId);
	});

	it('dedupes run events with the same id', async () => {
		const signIn = await SELF.fetch('https://example.com/api/auth/sign-in/anonymous', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
		const cookie = signIn.headers.get('set-cookie')!.split(';')[0];

		const create = await SELF.fetch('https://example.com/api/runs', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ timerPlan: { id: 'plan', mode: 'countup' } }),
		});
		const created = (await create.json()) as { runId: string };

		const start = await SELF.fetch(`https://example.com/api/runs/${created.runId}/events`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ type: 'start', atMs: Date.now() }),
		});
		expect(start.status).toBe(200);

		const advanceId = crypto.randomUUID();
		const advance = await SELF.fetch(`https://example.com/api/runs/${created.runId}/events`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ id: advanceId, type: 'advance', atMs: Date.now() }),
		});
		expect(advance.status).toBe(200);

		const advanceAgain = await SELF.fetch(`https://example.com/api/runs/${created.runId}/events`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ id: advanceId, type: 'advance', atMs: Date.now() }),
		});
		expect(advanceAgain.status).toBe(200);

		const snapRes = await SELF.fetch(`https://example.com/api/runs/${created.runId}`, {
			headers: { cookie },
		});
		const snap = (await snapRes.json()) as any;
		const advanceEvents = (snap.events ?? []).filter((event: { type?: string }) => event.type === 'advance');
		expect(advanceEvents.length).toBe(1);
	});
});

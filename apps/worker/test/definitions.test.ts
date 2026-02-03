import { describe, expect, it } from 'vitest';
import { SELF } from 'cloudflare:test';
import { LATEST_DATA_VERSION } from '@wodbrains/core';

async function signInAnonymous(): Promise<string> {
	const signIn = await SELF.fetch('https://example.com/api/auth/sign-in/anonymous', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}',
	});

	expect(signIn.status).toBe(200);
	const setCookie = signIn.headers.get('set-cookie');
	expect(setCookie).toBeTruthy();
	return setCookie!.split(';')[0];
}

async function createDefinition(
	cookie: string,
	label: string,
	title: string,
	attribution?: { sources: Array<{ url: string; title?: string }> } | null,
) {
	const res = await SELF.fetch('https://example.com/api/definitions', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({
			workoutDefinition: { id: `def-${label}`, title, blocks: [{ type: 'step', label: 'Push-ups' }] },
			source: { kind: 'text', preview: `preview-${label}` },
			...(attribution ? { attribution } : {}),
		}),
	});
	expect(res.status).toBe(200);
	return (await res.json()) as { definitionId: string };
}

async function createRun(cookie: string, definitionId: string) {
	const res = await SELF.fetch('https://example.com/api/runs', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({ timerPlan: { id: 'plan', mode: 'countup' }, definitionId }),
	});
	expect(res.status).toBe(200);
	return (await res.json()) as { runId: string };
}

async function patchWorkoutDefinition(cookie: string, definitionId: string, title: string) {
	return await SELF.fetch(`https://example.com/api/definitions/${definitionId}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({
			workoutDefinition: {
				id: definitionId,
				title,
				blocks: [{ type: 'step', label: 'Updated step' }],
			},
		}),
	});
}

async function startRun(runId: string, cookie: string) {
	return await SELF.fetch(`https://example.com/api/runs/${runId}/events`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({ type: 'start', atMs: Date.now() }),
	});
}

describe('Worker definitions list', () => {
	it('orders by most recent run and paginates with cursor', async () => {
		const cookie = await signInAnonymous();

		const defA = await createDefinition(cookie, 'a', 'Workout A');
		const defB = await createDefinition(cookie, 'b', 'Workout B');
		const defC = await createDefinition(cookie, 'c', 'Workout C');

		await createRun(cookie, defA.definitionId);
		await createRun(cookie, defB.definitionId);
		await createRun(cookie, defA.definitionId);

		const page1Res = await SELF.fetch('https://example.com/api/definitions?take=2', { headers: { cookie } });
		expect(page1Res.status).toBe(200);
		const page1 = (await page1Res.json()) as {
			items: Array<{ definitionId: string; title: string | null }>;
			nextCursor: string | null;
		};

		expect(page1.items.length).toBe(2);
		expect(page1.items[0].definitionId).toBe(defA.definitionId);
		expect(page1.nextCursor).toBeTruthy();

		const page2Res = await SELF.fetch(`https://example.com/api/definitions?take=2&cursor=${encodeURIComponent(page1.nextCursor!)}`, {
			headers: { cookie },
		});
		expect(page2Res.status).toBe(200);
		const page2 = (await page2Res.json()) as {
			items: Array<{ definitionId: string; title: string | null }>;
			nextCursor: string | null;
		};

		for (const item of page2.items) {
			expect(page1.items.some((first) => first.definitionId === item.definitionId)).toBe(false);
		}

		const combined = new Map([...page1.items, ...page2.items].map((item) => [item.definitionId, item]));

		expect(combined.has(defA.definitionId)).toBe(true);
		expect(combined.has(defB.definitionId)).toBe(true);
		expect(combined.has(defC.definitionId)).toBe(true);
		expect(combined.get(defA.definitionId)?.title).toBe('Workout A');
	});

	it('locks timer edits after a run starts and allows copy', async () => {
		const cookie = await signInAnonymous();
		const def = await createDefinition(cookie, 'lock', 'Lockable Timer', {
			sources: [{ url: 'https://example.com/lock', title: 'Lock source' }],
		});

		const firstPatch = await patchWorkoutDefinition(cookie, def.definitionId, 'First Update');
		expect(firstPatch.status).toBe(200);

		const run = await createRun(cookie, def.definitionId);
		const start = await startRun(run.runId, cookie);
		expect(start.status).toBe(200);

		const lockedPatch = await patchWorkoutDefinition(cookie, def.definitionId, 'Locked Update');
		expect(lockedPatch.status).toBe(409);

		const copyRes = await SELF.fetch(`https://example.com/api/definitions/${def.definitionId}/copy`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({}),
		});
		expect(copyRes.status).toBe(200);
		const copied = (await copyRes.json()) as { definitionId: string };
		expect(copied.definitionId).not.toBe(def.definitionId);

		const patchCopied = await patchWorkoutDefinition(cookie, copied.definitionId, 'Copied Update');
		expect(patchCopied.status).toBe(200);
	});

	it('allows copying definitions from another user', async () => {
		const ownerCookie = await signInAnonymous();
		const viewerCookie = await signInAnonymous();
		const def = await createDefinition(ownerCookie, 'share', 'Shared Timer', {
			sources: [
				{ url: 'https://example.com/share', title: 'Share source' },
				{ url: 'https://www.example.org/another', title: 'Another source' },
			],
		});

		const copyRes = await SELF.fetch(`https://example.com/api/definitions/${def.definitionId}/copy`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: viewerCookie },
			body: JSON.stringify({}),
		});
		expect(copyRes.status).toBe(200);
		const copied = (await copyRes.json()) as { definitionId: string };
		expect(copied.definitionId).not.toBe(def.definitionId);

		const patchOriginal = await patchWorkoutDefinition(viewerCookie, def.definitionId, 'Viewer Update');
		expect(patchOriginal.status).toBe(404);

		const patchCopied = await patchWorkoutDefinition(viewerCookie, copied.definitionId, 'Viewer Update');
		expect(patchCopied.status).toBe(200);
	});

	it('keeps workout definition id stable on patch', async () => {
		const cookie = await signInAnonymous();
		const def = await createDefinition(cookie, 'stable-id', 'Stable ID Timer');

		const getRes = await SELF.fetch(`https://example.com/api/definitions/${def.definitionId}`, {
			headers: { cookie },
		});
		expect(getRes.status).toBe(200);
		const getJson = (await getRes.json()) as { workoutDefinition?: { id?: string } };
		const originalId = getJson.workoutDefinition?.id;
		expect(originalId).toBeTruthy();

		const patchRes = await SELF.fetch(`https://example.com/api/definitions/${def.definitionId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({
				workoutDefinition: {
					id: 'def_bad123',
					title: 'Updated Title',
					blocks: [{ type: 'step', label: 'Updated step' }],
				},
			}),
		});
		expect(patchRes.status).toBe(200);

		const afterRes = await SELF.fetch(`https://example.com/api/definitions/${def.definitionId}`, {
			headers: { cookie },
		});
		expect(afterRes.status).toBe(200);
		const afterJson = (await afterRes.json()) as { workoutDefinition?: { id?: string } };
		expect(afterJson.workoutDefinition?.id).toBe(originalId);
	});

	it('stores latest data version on create and copy', async () => {
		const cookie = await signInAnonymous();
		const def = await createDefinition(cookie, 'version', 'Versioned Timer', {
			sources: [{ url: 'https://example.com/version', title: 'Version source' }],
		});

		const getRes = await SELF.fetch(`https://example.com/api/definitions/${def.definitionId}`, {
			headers: { cookie },
		});
		expect(getRes.status).toBe(200);
		const getJson = (await getRes.json()) as {
			dataVersion?: number;
			workoutDefinition?: { schemaVersion?: number };
			timerPlan?: { schemaVersion?: number };
			attribution?: { sources?: Array<{ url?: string; title?: string }> } | null;
		};
		expect(getJson.dataVersion).toBe(LATEST_DATA_VERSION);
		expect(getJson.workoutDefinition?.schemaVersion).toBe(LATEST_DATA_VERSION);
		expect(getJson.timerPlan?.schemaVersion).toBe(LATEST_DATA_VERSION);
		expect(getJson.attribution?.sources?.[0]?.url).toBe('https://example.com/version');

		const copyRes = await SELF.fetch(`https://example.com/api/definitions/${def.definitionId}/copy`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({}),
		});
		expect(copyRes.status).toBe(200);
		const copied = (await copyRes.json()) as { definitionId: string };

		const copyGet = await SELF.fetch(`https://example.com/api/definitions/${copied.definitionId}`, {
			headers: { cookie },
		});
		expect(copyGet.status).toBe(200);
		const copyJson = (await copyGet.json()) as { dataVersion?: number; attribution?: any };
		expect(copyJson.dataVersion).toBe(LATEST_DATA_VERSION);
		expect(copyJson.attribution?.sources?.[0]?.url).toBe('https://example.com/version');
	});
});

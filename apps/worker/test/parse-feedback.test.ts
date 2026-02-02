import { describe, expect, it } from 'vitest';
import { SELF } from 'cloudflare:test';

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

async function parseAndGetId(cookie: string): Promise<string> {
	const res = await SELF.fetch('https://example.com/api/parse', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({ text: 'For time: 10 burpees' }),
	});
	expect([200, 500]).toContain(res.status);
	const json = (await res.json()) as { parseId?: string };
	expect(typeof json.parseId).toBe('string');
	return json.parseId!;
}

describe('parse feedback', () => {
	it('links feedback to definition origins', async () => {
		const cookie = await signInAnonymous();
		const parseId = await parseAndGetId(cookie);

		const createRes = await SELF.fetch('https://example.com/api/definitions', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({
				workoutDefinition: {
					id: 'def-test',
					title: 'Feedback Test',
					blocks: [{ type: 'step', label: 'Burpees' }],
				},
				source: { kind: 'text', preview: 'Feedback test' },
				parseId,
			}),
		});
		expect(createRes.status).toBe(200);
		const created = (await createRes.json()) as { definitionId: string };

		const feedbackRes = await SELF.fetch('https://example.com/api/parse-feedback', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({
				definitionId: created.definitionId,
				note: 'Parsed wrong reps.',
			}),
		});
		expect(feedbackRes.status).toBe(200);
		const feedback = (await feedbackRes.json()) as { parseId?: string; definitionId?: string };
		expect(feedback.definitionId).toBe(created.definitionId);
		expect(feedback.parseId).toBe(parseId);
	});
});

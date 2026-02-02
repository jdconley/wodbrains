import { describe, expect, it } from 'vitest';
import { SELF } from 'cloudflare:test';

const DEFAULT_TITLE = 'WOD Brains magically builds a smart timer from any workout';

const getMetaContent = (html: string, attr: 'name' | 'property', key: string) => {
	const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i');
	const match = html.match(pattern);
	return match?.[1] ?? null;
};

const toExampleUrl = (url: string) => {
	const parsed = new URL(url);
	parsed.protocol = 'https:';
	parsed.host = 'example.com';
	return parsed.toString();
};

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

async function createDefinition(cookie: string, title: string) {
	const res = await SELF.fetch('https://example.com/api/definitions', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({
			workoutDefinition: { id: `def-${crypto.randomUUID()}`, title, blocks: [{ type: 'step', label: 'Push-ups' }] },
			source: { kind: 'text', preview: `preview for ${title}` },
		}),
	});
	expect(res.status).toBe(200);
	return (await res.json()) as { definitionId: string };
}

async function createRun(cookie: string, definitionId: string) {
	const res = await SELF.fetch('https://example.com/api/runs', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({ timerPlan: { id: 'plan', mode: 'countup', title: 'Plan Title' }, definitionId }),
	});
	expect(res.status).toBe(200);
	return (await res.json()) as { runId: string };
}

describe('meta tag injection', () => {
	it('injects og:title for definition pages', async () => {
		const cookie = await signInAnonymous();
		const def = await createDefinition(cookie, 'Fran');
		const res = await SELF.fetch(`https://example.com/w/${def.definitionId}`);
		expect(res.status).toBe(200);
		const html = await res.text();
		const ogTitle = getMetaContent(html, 'property', 'og:title');
		const ogImage = getMetaContent(html, 'property', 'og:image');
		expect(ogTitle).toBe('Fran - WOD Brains');
		expect(ogImage).toMatch(new RegExp(`https://wodbrains\\.com/og/definitions/wb_og_def_v1_${def.definitionId}_[0-9]+\\.png`));
	});

	it('escapes special characters in workout titles', async () => {
		const cookie = await signInAnonymous();
		const def = await createDefinition(cookie, 'Evil <script>alert("x")</script>');
		const res = await SELF.fetch(`https://example.com/w/${def.definitionId}`);
		expect(res.status).toBe(200);
		const html = await res.text();
		const ogTitle = getMetaContent(html, 'property', 'og:title');
		expect(ogTitle).toContain('Evil');
		expect(ogTitle).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
	});

	it('injects og:title for run pages', async () => {
		const cookie = await signInAnonymous();
		const def = await createDefinition(cookie, 'Grace');
		const run = await createRun(cookie, def.definitionId);
		const res = await SELF.fetch(`https://example.com/r/${run.runId}`);
		expect(res.status).toBe(200);
		const html = await res.text();
		const ogTitle = getMetaContent(html, 'property', 'og:title');
		const ogImage = getMetaContent(html, 'property', 'og:image');
		expect(ogTitle).toBe('Grace - WOD Brains');
		expect(ogImage).toMatch(new RegExp(`https://wodbrains\\.com/og/definitions/wb_og_def_v1_${def.definitionId}_[0-9]+\\.png`));
	});

	it('serves a generated og:image for definitions', async () => {
		const cookie = await signInAnonymous();
		const def = await createDefinition(cookie, 'Isabel');
		const res = await SELF.fetch(`https://example.com/w/${def.definitionId}`);
		expect(res.status).toBe(200);
		const html = await res.text();
		const ogImage = getMetaContent(html, 'property', 'og:image');
		expect(ogImage).toBeTruthy();
		const ogRes = await SELF.fetch(toExampleUrl(ogImage!));
		expect(ogRes.status).toBe(200);
		expect(ogRes.headers.get('content-type')).toContain('image/png');
		const bytes = new Uint8Array(await ogRes.arrayBuffer());
		expect(bytes.byteLength).toBeGreaterThan(0);
	});

	it('falls through to SPA for unknown definitions', async () => {
		const res = await SELF.fetch('https://example.com/w/not-found');
		expect(res.status).toBe(200);
		const html = await res.text();
		const ogTitle = getMetaContent(html, 'property', 'og:title');
		expect(ogTitle).toBe(DEFAULT_TITLE);
	});
});

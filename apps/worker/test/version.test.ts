import { describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';

describe('GET /api/version', () => {
	it('returns build sha + time with no-store caching', async () => {
		// These vars are injected by `wrangler:gen` into `apps/worker/wrangler.jsonc`.
		// They should be present in CI (from `GITHUB_SHA`) and in local dev (best-effort via git).
		void env; // keep import to match other tests' conventions

		const res = await SELF.fetch('https://example.com/api/version');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('content-type')).toContain('application/json');

		const json = (await res.json()) as { sha?: unknown; builtAt?: unknown };
		expect(typeof json.sha).toBe('string');
		expect(typeof json.builtAt).toBe('string');

		const sha = json.sha as string;
		const builtAt = json.builtAt as string;

		expect(sha === 'unknown' || /^[0-9a-f]{7,40}$/i.test(sha)).toBe(true);
		expect(builtAt === 'unknown' || Number.isFinite(Date.parse(builtAt))).toBe(true);
	});
});

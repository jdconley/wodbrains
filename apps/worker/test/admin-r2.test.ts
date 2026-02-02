import { describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';

describe('admin r2 proxy', () => {
	it('serves JSON objects by key (including folders)', async () => {
		const key = `parse_payloads/019c20aa-d61d-7769-944f-f16a3a1e476f.json`;
		await env.OG_IMAGES.put(key, JSON.stringify({ ok: true, key }), {
			httpMetadata: { contentType: 'application/json' },
		});

		const res = await SELF.fetch(`https://example.com/api/admin/r2/${key}?token=test-migrate-token`);
		const body = await res.text();
		expect(res.status, body).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/json');
		expect(JSON.parse(body)).toEqual({ ok: true, key });
	});

	it('tolerates query-like suffixes inside the wildcard param', async () => {
		const key = `parse_payloads/019c20aa-d61d-7769-944f-f16a3a1e476f.json`;
		await env.OG_IMAGES.put(key, JSON.stringify({ ok: true, key }), {
			httpMetadata: { contentType: 'application/json' },
		});

		// This simulates buggy routing / proxies that accidentally include a query
		// string fragment inside the wildcard capture (e.g. `...json?token=...`).
		const res = await SELF.fetch(`https://example.com/api/admin/r2/${key}%3Ftoken=should_not_break?token=test-migrate-token`);
		const body = await res.text();
		expect(res.status, body).toBe(200);
		expect(JSON.parse(body)).toEqual({ ok: true, key });
	});

	it('rejects invalid keys', async () => {
		const res = await SELF.fetch(`https://example.com/api/admin/r2/bad%25key?token=test-migrate-token`);
		const body = await res.text();
		expect(res.status, body).toBe(400);
		expect(JSON.parse(body)).toEqual({ error: 'bad_request', reason: 'invalid_r2_key' });
	});
});

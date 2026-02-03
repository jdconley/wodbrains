import { describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { OG_IMAGE_CACHE_CONTROL, OG_IMAGE_CONTENT_TYPE, buildDefinitionOgKey, buildDefinitionOgObjectKey } from '../src/og';

describe('/og/definitions/:ogImageKey', () => {
	it('serves a generated PNG (no 500) when missing from R2', async () => {
		const prevStub = (env as any).STUB_OG;
		// In production STUB_OG is unset; in tests it's pinned to '1' by default.
		// Flip it off so we exercise the real html->png codepath.
		(env as any).STUB_OG = '0';

		try {
			const now = Date.now();
			const definitionId = '019c2141-619b-7619-ad99-8dfba62d8605';
			const ogImageKey = buildDefinitionOgKey(definitionId, now);

			await env.DB.prepare(
				`insert into timer_definitions
          (definitionId, ownerUserId, sourceKind, sourcePreview, workoutDefinitionJson, timerPlanJson, ogImageKey, createdAt, updatedAt)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					definitionId,
					'user_test',
					'text',
					'preview',
					JSON.stringify({ id: definitionId, title: 'Test', blocks: [] }),
					JSON.stringify({ title: 'Test Workout Title' }),
					ogImageKey,
					now,
					now,
				)
				.run();

			const res = await SELF.fetch(`https://example.com/og/definitions/${ogImageKey}.png`);
			const body = await res.arrayBuffer();

			expect(res.status).toBe(200);
			expect(res.headers.get('content-type')).toBe(OG_IMAGE_CONTENT_TYPE);
			expect(res.headers.get('cache-control')).toBe(OG_IMAGE_CACHE_CONTROL);
			expect(body.byteLength).toBeGreaterThan(20);
		} finally {
			(env as any).STUB_OG = prevStub;
		}
	});

	it('forces content-type image/png even if R2 metadata is wrong', async () => {
		const now = Date.now();
		const definitionId = '019c2141-619b-7619-ad99-8dfba62d8605';
		const ogImageKey = buildDefinitionOgKey(definitionId, now);

		await env.DB.prepare(
			`insert into timer_definitions
        (definitionId, ownerUserId, sourceKind, sourcePreview, workoutDefinitionJson, timerPlanJson, ogImageKey, createdAt, updatedAt)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				definitionId,
				'user_test',
				'text',
				'preview',
				JSON.stringify({ id: definitionId, title: 'Test', blocks: [] }),
				JSON.stringify({ title: 'Test Workout Title' }),
				ogImageKey,
				now,
				now,
			)
			.run();

		const objectKey = buildDefinitionOgObjectKey(ogImageKey);
		const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]); // PNG signature + a few bytes
		await env.OG_IMAGES.put(objectKey, bytes, {
			httpMetadata: {
				// Wrong on purpose: should be image/png.
				contentType: 'text/plain; charset=utf-8',
				cacheControl: OG_IMAGE_CACHE_CONTROL,
			},
		});

		const res = await SELF.fetch(`https://example.com/og/definitions/${ogImageKey}.png`);
		const body = await res.arrayBuffer();

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe(OG_IMAGE_CONTENT_TYPE);
		expect(res.headers.get('cache-control')).toBe(OG_IMAGE_CACHE_CONTROL);
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('content-disposition')).toBe(`inline; filename="${ogImageKey}.png"`);
		expect(body.byteLength).toBeGreaterThan(8);
	});
});

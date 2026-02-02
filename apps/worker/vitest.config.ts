import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
	const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
	const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
	const runLiveAiTests = process.env.RUN_LIVE_AI_TESTS ?? '0';
	const ogImagesBucket = process.env.CLOUDFLARE_R2_BUCKET_OG_IMAGES ?? 'example-og-images';

	return {
		test: {
			root: __dirname,
			include: ['test/**/*.test.ts'],
			setupFiles: ['test/setup.ts'],
			poolOptions: {
				workers: {
					wrangler: {
						configPath: './wrangler.jsonc',
					},
					miniflare: {
						bindings: {
							TEST_MIGRATIONS: migrations,
							GOOGLE_GENERATIVE_AI_API_KEY: googleApiKey,
							RUN_LIVE_AI_TESTS: runLiveAiTests,
							STUB_PARSE: '0',
						STUB_OG: '1',
						},
						r2Buckets: {
							OG_IMAGES: ogImagesBucket,
						},
					},
				},
			},
		},
	};
});

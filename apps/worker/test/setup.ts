import { beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';

beforeAll(async () => {
	// Apply Better Auth migrations (and later app migrations) before tests run.
	const migrations = env.TEST_MIGRATIONS as Parameters<typeof applyD1Migrations>[1];
	await applyD1Migrations(env.DB, migrations);
});

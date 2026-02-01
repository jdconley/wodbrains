import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { D1Dialect } from 'kysely-d1';
import type { Env } from './env';

type KyselyDialectDatabase = {
	dialect: D1Dialect;
	type: 'sqlite';
};

const dialectByD1 = new WeakMap<D1Database, D1Dialect>();

function getDb(env: Env): KyselyDialectDatabase {
	const existingDialect = dialectByD1.get(env.DB);
	if (existingDialect) return { dialect: existingDialect, type: 'sqlite' };

	const dialect = new D1Dialect({ database: env.DB });
	dialectByD1.set(env.DB, dialect);

	return { dialect, type: 'sqlite' };
}

export function createAuthConfig(env: Env): BetterAuthOptions {
	return {
		// In production, this must be set as a Wrangler secret.
		// For local dev/tests, we fall back to a deterministic value.
		secret: env.BETTER_AUTH_SECRET || 'dev-only-secret',
		// Use Better Auth's Kysely adapter via a D1 dialect wrapper (required for `getMigrations`).
		database: getDb(env),
		plugins: [
			anonymous({
				onLinkAccount: async ({ anonymousUser, newUser }) => {
					// TODO(v1): migrate ownership of definitions/runs from anonymousUser.id -> newUser.id
					// We'll implement this once the WOD Brains tables are created.
					void anonymousUser;
					void newUser;
				},
			}),
		],
	};
}

export function createAuth(env: Env) {
	return betterAuth(createAuthConfig(env));
}

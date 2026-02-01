import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { DatabaseSync } from 'node:sqlite';

// CLI-only Better Auth config used to generate SQL schema.
// This MUST NOT be imported by the Worker runtime.
export const auth = betterAuth({
	secret: 'cli-only-secret',
	database: new DatabaseSync(':memory:'),
	plugins: [anonymous()],
});

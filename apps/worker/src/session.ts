import { APIError } from 'better-auth/api';
import type { Env } from './env';
import { createAuth } from './auth';

export type SessionResult = Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>;

export async function getSession(env: Env, req: Request): Promise<SessionResult> {
	const auth = createAuth(env);
	// Better Auth expects headers for cookie/session extraction (and ip/user-agent enrichment).
	return await auth.api.getSession({ headers: req.headers });
}

export async function requireUserId(env: Env, req: Request): Promise<string> {
	const session = await getSession(env, req);
	if (!session) {
		throw new APIError('UNAUTHORIZED', { message: 'Not signed in' });
	}
	// Better Auth returns { session: Session, user: User } | null
	// We only need the user id for ownership checks.
	return session.user.id;
}

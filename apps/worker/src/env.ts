export interface Env {
	// Static assets binding (Workers Static Assets)
	ASSETS: Fetcher;

	// R2 bucket for generated OG images
	OG_IMAGES: R2Bucket;

	// Durable Objects
	RUN_ACTOR: DurableObjectNamespace;

	// D1 database
	DB: D1Database;

	// Better Auth
	BETTER_AUTH_SECRET: string;

	// Dev/admin utilities
	MIGRATE_TOKEN?: string;

	// LLM (Gemini via Vercel AI SDK)
	GOOGLE_GENERATIVE_AI_API_KEY?: string;

	// Test helpers
	STUB_PARSE?: string;
	STUB_OG?: string;
}

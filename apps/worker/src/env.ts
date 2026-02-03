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

	// GitHub issues (parse feedback notifications)
	GITHUB_ISSUES_TOKEN?: string;
	GITHUB_ISSUES_REPO?: string;
	GITHUB_ISSUES_LABELS?: string;

	// LLM (Gemini via Vercel AI SDK)
	GOOGLE_GENERATIVE_AI_API_KEY?: string;

	// Test helpers
	STUB_PARSE?: string;
	STUB_OG?: string;

	// Build metadata (injected by wrangler config generation)
	BUILD_SHA?: string;
	BUILD_TIME?: string;
}

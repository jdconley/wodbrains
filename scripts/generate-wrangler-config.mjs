import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const strict = process.env.WRANGLER_GEN_STRICT === '1';

function requiredEnv(name, fallback) {
	const value = process.env[name];
	if (!value) {
		if (strict) {
			throw new Error(`Missing required env var: ${name}`);
		}
		if (fallback === undefined) {
			throw new Error(`Missing required env var (no fallback): ${name}`);
		}
		console.warn(`WRANGLER_GEN_STRICT!=1; using placeholder for ${name}`);
		return fallback;
	}
	return value;
}

function optionalEnv(name) {
	const value = process.env[name];
	return value && value.length ? value : undefined;
}

// Always resolve paths relative to the repo root (not the current working directory),
// so this script works when invoked from any subdirectory (e.g. CI, apps/worker).
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const outPath = path.join(repoRoot, 'apps/worker/wrangler.jsonc');

const d1DatabaseId = requiredEnv(
	'CLOUDFLARE_D1_DATABASE_ID',
	'00000000-0000-0000-0000-000000000000',
);
const zoneName = requiredEnv('CLOUDFLARE_ZONE_NAME', 'example.com');
const routeWodbrains = requiredEnv('CLOUDFLARE_ROUTE_WODBRAINS', 'example.com');
const routeWww = requiredEnv('CLOUDFLARE_ROUTE_WWW', 'www.example.com');

const stubParse = optionalEnv('STUB_PARSE') ?? '0';

const wranglerConfig = {
	name: 'wodbrains-worker',
	main: 'src/index.ts',
	compatibility_date: '2026-01-20',
	compatibility_flags: ['nodejs_compat'],
	vars: {
		STUB_PARSE: String(stubParse),
	},
	migrations: [
		{
			new_sqlite_classes: ['RunActor'],
			tag: 'v1',
		},
	],
	assets: {
		directory: './public',
		not_found_handling: 'single-page-application',
		run_worker_first: true,
		binding: 'ASSETS',
	},
	durable_objects: {
		bindings: [
			{
				class_name: 'RunActor',
				name: 'RUN_ACTOR',
			},
		],
	},
	d1_databases: [
		{
			binding: 'DB',
			database_name: 'wodbrains',
			database_id: d1DatabaseId,
		},
	],
	observability: {
		enabled: true,
	},
	workers_dev: false,
	routes: [
		{
			pattern: routeWodbrains,
			custom_domain: true,
			zone_name: zoneName,
		},
		{
			pattern: routeWww,
			custom_domain: true,
			zone_name: zoneName,
		},
	],
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(wranglerConfig, null, '\t') + '\n', 'utf8');
console.log(`Wrote ${outPath}`);

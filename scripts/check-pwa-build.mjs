import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const publicDir = path.join(repoRoot, 'apps/worker/public');

const requireFile = async (relativePath) => {
  const fullPath = path.join(publicDir, relativePath);
  try {
    await access(fullPath);
  } catch {
    throw new Error(`Missing ${relativePath} in ${publicDir}`);
  }
  return fullPath;
};

const manifestPath = await requireFile('manifest.webmanifest');
const manifestRaw = await readFile(manifestPath, 'utf8');
try {
  JSON.parse(manifestRaw);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`Invalid manifest.webmanifest JSON: ${message}`);
}

await requireFile('sw.js');

const headersPath = await requireFile('_headers');
const headersRaw = await readFile(headersPath, 'utf8');
const hasSwNoCache = /\/sw\.js[\s\S]*?Cache-Control:\s*no-cache/i.test(headersRaw);
const hasManifestNoCache = /\/manifest\.webmanifest[\s\S]*?Cache-Control:\s*no-cache/i.test(
  headersRaw,
);
const hasHtmlNoCache = /\/\*[\s\S]*?Cache-Control:\s*no-cache/i.test(headersRaw);
const hasAssetsCache =
  /\/assets\/\*[\s\S]*?Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i.test(headersRaw);

const missing = [
  !hasSwNoCache && 'sw.js Cache-Control: no-cache',
  !hasManifestNoCache && 'manifest.webmanifest Cache-Control: no-cache',
  !hasHtmlNoCache && '/* Cache-Control: no-cache',
  !hasAssetsCache && '/assets/* Cache-Control: public, max-age=31536000, immutable',
].filter(Boolean);

if (missing.length) {
  throw new Error(`Missing required _headers rules:\n- ${missing.join('\n- ')}`);
}

console.log('PWA build checks passed.');

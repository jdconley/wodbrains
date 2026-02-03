import type { Env } from './env';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const OG_IMAGE_CONTENT_TYPE = 'image/png';
export const OG_IMAGE_PREFIX = 'wb_og_def_v1';

const DEFAULT_TITLE = 'Workout Timer';
const MAX_TITLE_LENGTH = 70;
const STUB_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAA3X5yUAAAAASUVORK5CYII=';

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <!-- Left flexing arm -->
  <path d="M18 58 Q8 54 10 44 Q12 36 20 38 L24 46 Q22 50 24 54 Z" fill="#F5A9B8"/>
  <!-- Left bicep bulge -->
  <ellipse cx="10" cy="41" rx="7" ry="6" fill="#F5A9B8"/>
  <!-- Left arm muscle definition -->
  <path d="M12 44 Q14 41 12 38" stroke="#E88A9A" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <!-- Left fist -->
  <ellipse cx="8" cy="38" rx="4" ry="3.5" fill="#F5A9B8"/>
  <!-- Right flexing arm -->
  <path d="M82 58 Q92 54 90 44 Q88 36 80 38 L76 46 Q78 50 76 54 Z" fill="#F5A9B8"/>
  <!-- Right bicep bulge -->
  <ellipse cx="90" cy="41" rx="7" ry="6" fill="#F5A9B8"/>
  <!-- Right arm muscle definition -->
  <path d="M88 44 Q86 41 88 38" stroke="#E88A9A" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <!-- Right fist -->
  <ellipse cx="92" cy="38" rx="4" ry="3.5" fill="#F5A9B8"/>
  <!-- Brain body (softer peachy pink) -->
  <path d="M30 75 Q18 68 22 52 Q18 42 28 35 Q32 24 44 22 Q50 18 56 22 Q68 24 72 35 Q82 42 78 52 Q82 68 70 75 Q60 82 50 80 Q40 82 30 75 Z" fill="#F5A9B8"/>
  <!-- Brain wrinkles/folds (subtle, around edges) -->
  <path d="M36 26 Q44 21 50 23 Q56 21 64 26" stroke="#E88A9A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M30 34 Q36 30 42 32" stroke="#E88A9A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M58 32 Q64 30 70 34" stroke="#E88A9A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M24 48 Q22 56 26 64" stroke="#E88A9A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M76 48 Q78 56 74 64" stroke="#E88A9A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M34 72 Q42 76 50 74 Q58 76 66 72" stroke="#E88A9A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <!-- Big expressive eyes with detail -->
  <!-- Left eye white -->
  <ellipse cx="40" cy="46" rx="9" ry="10" fill="#fff"/>
  <!-- Left eye iris -->
  <ellipse cx="41" cy="47" rx="6" ry="7" fill="#3D2314"/>
  <!-- Left eye pupil -->
  <ellipse cx="42" cy="48" rx="3" ry="3.5" fill="#000"/>
  <!-- Left eye main sparkle -->
  <circle cx="38" cy="44" r="3" fill="#fff"/>
  <!-- Left eye secondary sparkle -->
  <circle cx="44" cy="50" r="1.5" fill="#fff"/>
  <!-- Right eye white -->
  <ellipse cx="60" cy="46" rx="9" ry="10" fill="#fff"/>
  <!-- Right eye iris -->
  <ellipse cx="59" cy="47" rx="6" ry="7" fill="#3D2314"/>
  <!-- Right eye pupil -->
  <ellipse cx="58" cy="48" rx="3" ry="3.5" fill="#000"/>
  <!-- Right eye main sparkle -->
  <circle cx="56" cy="44" r="3" fill="#fff"/>
  <!-- Right eye secondary sparkle -->
  <circle cx="62" cy="50" r="1.5" fill="#fff"/>
  <!-- Eyebrows (cute curved) -->
  <path d="M32 36 Q40 33 46 36" stroke="#3D2314" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M54 36 Q60 33 68 36" stroke="#3D2314" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- Blush marks -->
  <ellipse cx="30" cy="54" rx="5" ry="3" fill="#FF9EAF" opacity="0.7"/>
  <ellipse cx="70" cy="54" rx="5" ry="3" fill="#FF9EAF" opacity="0.7"/>
  <!-- Open happy mouth -->
  <path d="M42 60 Q50 70 58 60" fill="#3D2314"/>
  <!-- Tongue -->
  <ellipse cx="50" cy="65" rx="5" ry="4" fill="#FF6B8A"/>
  <!-- Mouth highlight -->
  <path d="M44 61 Q50 58 56 61" stroke="#5D3324" stroke-width="1" fill="none" stroke-linecap="round"/>
</svg>`;

const normalizeTitle = (title?: string | null) => {
	const trimmed = title?.trim();
	if (!trimmed) return DEFAULT_TITLE;
	if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
	return `${trimmed.slice(0, MAX_TITLE_LENGTH - 3)}...`;
};

const escapeHtml = (value: string) =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const buildDefinitionOgHtml = (title: string) => {
	const safeTitle = escapeHtml(normalizeTitle(title));
	// NOTE: `@cf-wasm/og/html-to-react` is strict about multi-child containers: any element with
	// more than one child node must explicitly set `display: flex` (or `display: none`).
	// Avoid full-document markup (`<html><head><body>…`) because the converter may wrap it in a
	// synthetic `<div>` without computed `display`, causing runtime 500s in production.
	return `<div class="OgRoot" style="display: flex; flex-direction: column;">
  <style>
    .OgRoot {
      width: ${OG_IMAGE_WIDTH}px;
      height: ${OG_IMAGE_HEIGHT}px;
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(600px 520px at 12% 15%, rgba(255, 16, 240, 0.28), transparent 60%),
        radial-gradient(680px 520px at 88% 70%, rgba(46, 229, 157, 0.18), transparent 60%),
        #0b1020;
      color: #fff;
      font-family: "Inter", "Rubik", system-ui, -apple-system, sans-serif;
    }
    .Content {
      height: 100%;
      display: flex;
      align-items: center;
      gap: 70px;
      padding: 60px 80px;
    }
    .Logo {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 260px;
      height: 260px;
      filter: drop-shadow(0 26px 60px rgba(0, 0, 0, 0.45));
      flex: 0 0 auto;
    }
    .Logo svg { width: 100%; height: 100%; }
    .Text {
      display: flex;
      flex-direction: column;
    }
    .Brand {
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: #ff10f0;
      font-weight: 700;
      font-size: 26px;
    }
    .Title {
      font-size: 70px;
      line-height: 1.05;
      margin: 26px 0 18px;
      font-weight: 800;
    }
    .Subtitle {
      font-size: 30px;
      line-height: 1.2;
      margin: 0;
      color: #cfd2e6;
    }
  </style>
  <div class="Content" style="display: flex;">
    <div class="Logo" style="display: flex;">${LOGO_SVG}</div>
    <div class="Text" style="display: flex; flex-direction: column;">
      <div class="Brand">WOD Brains</div>
      <div class="Title">${safeTitle}</div>
      <div class="Subtitle">Timer created for this workout.</div>
    </div>
  </div>
</div>`;
};

export const __testing = {
	buildDefinitionOgHtml,
};

export const buildDefinitionOgKey = (definitionId: string, updatedAt: number) => `${OG_IMAGE_PREFIX}_${definitionId}_${updatedAt}`;

export const buildDefinitionOgObjectKey = (ogImageKey: string) => `og/definitions/${ogImageKey}.png`;

export async function renderDefinitionOgPng(params: {
	title?: string | null;
	ctx: ExecutionContext;
	useStub?: boolean;
}): Promise<Uint8Array> {
	if (params.useStub) {
		const binary = atob(STUB_PNG_BASE64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	const [{ ImageResponse, cache }, { t }] = await Promise.all([import('@cf-wasm/og/workerd'), import('@cf-wasm/og/html-to-react')]);

	cache.setExecutionContext(params.ctx);
	const html = buildDefinitionOgHtml(params.title ?? DEFAULT_TITLE);
	const response = await ImageResponse.async(t(html), {
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
	});
	const buffer = await response.arrayBuffer();
	return new Uint8Array(buffer);
}

export async function generateAndStoreDefinitionOgImage(params: {
	env: Env;
	ctx: ExecutionContext;
	ogImageKey: string;
	title?: string | null;
}): Promise<void> {
	const objectKey = buildDefinitionOgObjectKey(params.ogImageKey);

	const existing = await params.env.OG_IMAGES.head(objectKey);

	if (existing) return;
	const bytes = await renderDefinitionOgPng({
		title: params.title,
		ctx: params.ctx,
		useStub: params.env.STUB_OG === '1',
	});
	await params.env.OG_IMAGES.put(objectKey, bytes, {
		httpMetadata: {
			contentType: OG_IMAGE_CONTENT_TYPE,
			cacheControl: OG_IMAGE_CACHE_CONTROL,
		},
	});
}

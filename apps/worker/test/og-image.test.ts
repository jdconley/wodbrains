import { describe, expect, it } from 'vitest';
import { __testing } from '../src/og';

describe('OG image template', () => {
	it('uses display:flex on multi-child containers', () => {
		const html = __testing.buildDefinitionOgHtml('Test Workout Title');

		// The HTML-to-react renderer requires any element with multiple children
		// to explicitly set `display: flex` (or `display: none`).
		expect(html).not.toMatch(/<div(?![^>]*\bclass=)/i);
		expect(html).toMatch(/<div class="OgRoot"/);
		expect(html).toMatch(/<div class="Content"/);
		expect(html).toMatch(/<div class="Logo"/);
		expect(html).toMatch(/<div class="Text"/);
		// Additionally, we include inline display styles so rendering does not depend on CSS parsing.
		expect(html).toMatch(/class="OgRoot"[^>]*style="[^"]*display:\s*flex/i);
		expect(html).toMatch(/class="Content"[^>]*style="[^"]*display:\s*flex/i);
		expect(html).toMatch(/class="Logo"[^>]*style="[^"]*display:\s*flex/i);
		expect(html).toMatch(/class="Text"[^>]*style="[^"]*display:\s*flex/i);
		expect(html).toMatch(/\.OgRoot\s*\{[\s\S]*?display:\s*flex\s*;[\s\S]*?\}/);
		expect(html).toMatch(/\.Content\s*\{[\s\S]*?display:\s*flex\s*;[\s\S]*?\}/);
		expect(html).toMatch(/\.Logo\s*\{[\s\S]*?display:\s*flex\s*;[\s\S]*?\}/);
		expect(html).toMatch(/\.Text\s*\{[\s\S]*?display:\s*flex\s*;[\s\S]*?\}/);
		expect(html).toMatch(/\.Text\s*\{[\s\S]*?flex-direction:\s*column\s*;[\s\S]*?\}/);
	});

	it('is accepted by the HTML-to-react renderer', async () => {
		const html = __testing.buildDefinitionOgHtml('Test Workout Title');
		const { t } = await import('@cf-wasm/og/html-to-react');
		expect(() => t(html)).not.toThrow();
	});
});

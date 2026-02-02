import { describe, expect, it } from 'vitest';
import { __testing } from '../src/og';

describe('OG image template', () => {
	it('uses display:flex on multi-child containers', () => {
		const html = __testing.buildDefinitionOgHtml('Test Workout Title');

		// The HTML-to-react renderer requires any element with multiple children
		// to explicitly set `display: flex` (or `display: none`).
		expect(html).not.toMatch(/<div(?![^>]*\bclass=)/i);
		expect(html).toContain('<div class="Content">');
		expect(html).toContain('<div class="Logo">');
		expect(html).toContain('<div class="Text">');
		expect(html).toMatch(/\.Content\s*\{[\s\S]*?display:\s*flex\s*;[\s\S]*?\}/);
		expect(html).toMatch(/\.Logo\s*\{[\s\S]*?display:\s*flex\s*;[\s\S]*?\}/);
		expect(html).toMatch(/\.Text\s*\{[\s\S]*?display:\s*flex\s*;[\s\S]*?\}/);
		expect(html).toMatch(/\.Text\s*\{[\s\S]*?flex-direction:\s*column\s*;[\s\S]*?\}/);
	});
});

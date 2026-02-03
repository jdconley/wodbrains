import { describe, expect, it } from 'vitest';
import { __testing } from '../src/og';

describe('OG image template', () => {
	it('inlines critical styles for reliable rendering', () => {
		const html = __testing.buildDefinitionOgHtml('Test Workout Title');

		// Keep critical properties inline so rendering does not depend on CSS parsing.
		expect(html).toMatch(/width:\s*1200px/i);
		expect(html).toMatch(/height:\s*630px/i);
		expect(html).toMatch(/background-color:\s*#0b1020/i);

		// Multi-child containers must explicitly set display:flex.
		const flexCount = html.match(/display:\s*flex/gi)?.length ?? 0;
		expect(flexCount).toBeGreaterThanOrEqual(3);
		expect(html).toMatch(/flex-direction:\s*column/i);

		// Logo sizing is required for consistent layout.
		expect(html).toMatch(/width:\s*260px/i);
		expect(html).toMatch(/height:\s*260px/i);

		// Brand/title text should be present.
		expect(html).toContain('WOD Brains');
		expect(html).toContain('Test Workout Title');
	});
});

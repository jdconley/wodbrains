import { describe, expect, it } from 'vitest';
import { sanitizeWorkoutTitle, selectWorkoutTitle } from '../src/parse';

describe('workout title helpers', () => {
	it('prefers parsed title when present', () => {
		expect(selectWorkoutTitle('Hero WOD', 'Generated Title')).toBe('Hero WOD');
	});

	it('falls back to generated title when parsed title missing', () => {
		expect(selectWorkoutTitle(undefined, 'Generated Title')).toBe('Generated Title');
	});

	it('falls back to default when both missing', () => {
		expect(selectWorkoutTitle('', '   ')).toBe('Workout');
	});

	it('sanitizes titles into a single trimmed line', () => {
		expect(sanitizeWorkoutTitle('  "Line One\nLine Two"  ')).toBe('Line One');
		expect(sanitizeWorkoutTitle('  Fancy   Title  ')).toBe('Fancy Title');
	});

	it('clamps long titles', () => {
		const longTitle = 'A'.repeat(200);
		const sanitized = sanitizeWorkoutTitle(longTitle);
		expect(sanitized).toBeTruthy();
		expect((sanitized ?? '').length).toBeLessThanOrEqual(80);
	});
});

import { describe, expect, it } from 'vitest';
import { buildPromptSnapshot, hasHttpUrlInText } from '../src/parse';

describe('parse prompt snapshot', () => {
	it('title prompt mentions Google Search + URL Context', () => {
		const snap = buildPromptSnapshot({ text: 'crossfit cindy', url: undefined, hasImage: false });
		expect(snap.titleSystem).toMatch(/google search/i);
		expect(snap.titleSystem).toMatch(/url context/i);
		expect(snap.titleUser).toMatch(/google search/i);
		expect(snap.titleUser).toMatch(/url context/i);
	});
});

describe('hasHttpUrlInText', () => {
	it('detects explicit http(s) URLs', () => {
		expect(hasHttpUrlInText(undefined)).toBe(false);
		expect(hasHttpUrlInText('')).toBe(false);
		expect(hasHttpUrlInText('www.example.com')).toBe(false);
		expect(hasHttpUrlInText('See https://example.com/cindy')).toBe(true);
		expect(hasHttpUrlInText('http://example.com')).toBe(true);
	});
});

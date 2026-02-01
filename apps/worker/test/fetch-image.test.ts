import { describe, expect, it } from 'vitest';
import { fetchImageAsFile } from '../src/fetch-image';

const makeResponse = (body: Uint8Array, init?: ResponseInit) => new Response(body, init);

describe('fetchImageAsFile', () => {
	it('downloads an image and returns a File', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const fetchFn = async () =>
			makeResponse(bytes, {
				status: 200,
				headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength) },
			});

		const file = await fetchImageAsFile('https://example.com/assets/workout.png', { fetchFn });
		expect(file.name).toBe('workout.png');
		expect(file.type).toBe('image/png');
		expect(file.size).toBe(bytes.byteLength);
	});

	it('infers content type from file extension', async () => {
		const bytes = new Uint8Array([1, 2]);
		const fetchFn = async () =>
			makeResponse(bytes, {
				status: 200,
				headers: { 'content-length': String(bytes.byteLength) },
			});

		const file = await fetchImageAsFile('https://example.com/path/image.jpg', { fetchFn });
		expect(file.type).toBe('image/jpeg');
	});

	it('rejects non-image responses', async () => {
		const fetchFn = async () =>
			makeResponse(new Uint8Array([1, 2]), {
				status: 200,
				headers: { 'content-type': 'text/html' },
			});

		await expect(fetchImageAsFile('https://example.com/not-image', { fetchFn })).rejects.toThrow(/image/i);
	});

	it('rejects oversized images', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const fetchFn = async () =>
			makeResponse(bytes, {
				status: 200,
				headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength) },
			});

		await expect(fetchImageAsFile('https://example.com/large.png', { fetchFn, maxBytes: 2 })).rejects.toThrow(/too large/i);
	});

	it('rejects invalid URLs', async () => {
		const fetchFn = async () =>
			makeResponse(new Uint8Array([1]), {
				status: 200,
				headers: { 'content-type': 'image/png' },
			});

		await expect(fetchImageAsFile('file:///tmp/image.png', { fetchFn })).rejects.toThrow(/http/i);
	});
});

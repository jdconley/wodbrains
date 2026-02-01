type FetchImageOptions = {
	fetchFn?: typeof fetch;
	maxBytes?: number;
	requestId?: string;
};

const DEFAULT_MAX_BYTES = 6 * 1024 * 1024;

const buildImageError = (message: string) => {
	const err: Error & { code?: string } = new Error(message);
	err.code = 'image_retrieval_failed';
	return err;
};

const inferContentTypeFromPath = (pathname: string): string | null => {
	const lower = pathname.toLowerCase();
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.gif')) return 'image/gif';
	return null;
};

const filenameFromPath = (pathname: string): string => {
	const name = pathname.split('/').pop() ?? '';
	const decoded = name ? decodeURIComponent(name) : '';
	return decoded || 'image';
};

export async function fetchImageAsFile(imageUrl: string, opts: FetchImageOptions = {}): Promise<File> {
	let parsed: URL;
	try {
		parsed = new URL(imageUrl);
	} catch {
		throw buildImageError('Invalid image URL.');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw buildImageError('Image URL must be http or https.');
	}

	const fetchFn = opts.fetchFn ?? fetch;
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
	if (opts.requestId) {
		console.info('[worker] fetch image', { requestId: opts.requestId, imageUrl: parsed.toString() });
	}

	const res = await fetchFn(parsed.toString(), { redirect: 'follow' });
	if (!res.ok) {
		throw buildImageError(`Image request failed with ${res.status}.`);
	}

	const contentLengthHeader = res.headers.get('content-length') ?? '';
	const contentLength = Number.parseInt(contentLengthHeader, 10);
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw buildImageError('Image is too large.');
	}

	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength === 0) {
		throw buildImageError('Image response was empty.');
	}
	if (bytes.byteLength > maxBytes) {
		throw buildImageError('Image is too large.');
	}

	const contentTypeRaw = res.headers.get('content-type') ?? '';
	const contentType = contentTypeRaw.split(';')[0]?.trim().toLowerCase();
	const inferred = inferContentTypeFromPath(parsed.pathname);
	const mediaType = contentType && contentType.startsWith('image/') ? contentType : inferred;
	if (!mediaType) {
		throw buildImageError('Image URL did not return an image.');
	}

	const fileName = filenameFromPath(parsed.pathname);
	return new File([bytes], fileName, { type: mediaType });
}

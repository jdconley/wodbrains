import type { WorkoutBlock } from '@wodbrains/core';

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const createId = () => {
	const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (cryptoObj?.randomUUID) {
		return cryptoObj.randomUUID();
	}
	return `block_${Math.random().toString(36).slice(2, 10)}`;
};

const parseMinutes = (text: string): number | null => {
	const match = text.match(/\b(\d{1,3})\s*(min|mins|minute|minutes)\b/i);
	if (!match) return null;
	const mins = Number.parseInt(match[1] ?? '', 10);
	return Number.isFinite(mins) && mins > 0 ? mins : null;
};

const parseClock = (text: string): number | null => {
	const match = text.match(/\b(\d{1,2}):(\d{2})\b/);
	if (!match) return null;
	const mins = Number.parseInt(match[1] ?? '', 10);
	const secs = Number.parseInt(match[2] ?? '', 10);
	if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
	if (mins < 0 || secs < 0 || secs >= 60) return null;
	return mins * 60 + secs;
};

const durationMsFromText = (text: string): number | null => {
	const secondsFromClock = parseClock(text);
	if (secondsFromClock !== null) return secondsFromClock * 1000;
	const minutes = parseMinutes(text);
	if (minutes !== null) return minutes * 60 * 1000;
	return null;
};

const timerLabelFromText = (text: string): string => {
	const lower = text.toLowerCase();
	if (lower.includes('rest')) return 'Rest';
	if (lower.includes('amrap')) return 'AMRAP';
	return normalizeWhitespace(text);
};

const shouldCoerceTimer = (text: string): boolean => {
	const lower = text.toLowerCase();
	if (lower.includes('amrap')) return true;
	if (lower.includes('rest')) return true;
	return false;
};

const isDurationOnly = (value: string): boolean =>
	/^\(?\s*\d{1,3}\s*(min|mins|minute|minutes)\s*\)?$/i.test(value) || /^\(?\s*\d{1,2}:\d{2}\s*\)?$/.test(value);

const splitExtraNote = (text: string, timerLabel: string): string | null => {
	const normalized = normalizeWhitespace(text);
	if (!normalized) return null;
	const lower = normalized.toLowerCase();
	if (timerLabel === 'AMRAP') {
		const idx = lower.indexOf('amrap');
		if (idx === -1) return null;
		const tail = normalized.slice(idx + 'amrap'.length).trim();
		if (!tail || isDurationOnly(tail)) return null;
		return tail ? tail : null;
	}
	if (timerLabel === 'Rest') {
		const idx = lower.indexOf('rest');
		if (idx === -1) return null;
		const tail = normalized.slice(idx + 'rest'.length).trim();
		if (!tail || isDurationOnly(tail)) return null;
		return tail ? tail : null;
	}
	return null;
};

export const coerceTimerHeaders = (blocks: WorkoutBlock[]): WorkoutBlock[] => {
	const out: WorkoutBlock[] = [];
	for (const block of blocks) {
		if (block.type !== 'note' && block.type !== 'step') {
			out.push(block);
			continue;
		}

		const raw = block.type === 'note' ? (block.text ?? block.label ?? '') : (block.label ?? block.text ?? '');
		const text = normalizeWhitespace(raw);
		if (!text) {
			out.push(block);
			continue;
		}

		if (!shouldCoerceTimer(text)) {
			out.push(block);
			continue;
		}

		const durationMs = durationMsFromText(text);
		if (durationMs === null) {
			out.push(block);
			continue;
		}

		const label = timerLabelFromText(text);
		const timer: WorkoutBlock = {
			type: 'timer',
			blockId: block.blockId ?? createId(),
			label,
			mode: 'countdown',
			durationMs,
		};
		out.push(timer);

		const extra = splitExtraNote(text, label);
		if (extra) {
			out.push({
				type: 'note',
				blockId: block.blockId ? `${block.blockId}-note` : createId(),
				text: extra,
			});
		}
	}
	return out;
};

const isCountdownTimer = (block: WorkoutBlock): boolean =>
	block.type === 'timer' && block.mode === 'countdown' && typeof block.durationMs === 'number';

const isRestTimer = (block: WorkoutBlock): boolean => {
	if (block.type !== 'timer') return false;
	const label = (block.label ?? '').toLowerCase();
	return label.includes('rest');
};

export const nestCountdownGroups = (blocks: WorkoutBlock[]): WorkoutBlock[] => {
	const out: WorkoutBlock[] = [];
	let currentCountdown: WorkoutBlock | null = null;
	for (const block of blocks) {
		if (isCountdownTimer(block)) {
			out.push(block);
			currentCountdown = isRestTimer(block) ? null : block;
			continue;
		}

		if (currentCountdown && (block.type === 'step' || block.type === 'note')) {
			if (!currentCountdown.blocks) currentCountdown.blocks = [];
			currentCountdown.blocks.push(block);
			continue;
		}

		currentCountdown = null;
		out.push(block);
	}
	return out;
};

// (scoring has been removed from WorkoutDefinition; any LLM “scoring intent”
// is converted to nested blocks in the worker parser.)

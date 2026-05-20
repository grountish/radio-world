export type TrackMetadata = {
	artist: string;
	title: string;
};

const TITLE_FRAME_IDS = new Set(['TIT2', 'TT2', 'TITLE']);
const ARTIST_FRAME_IDS = new Set(['TPE1', 'TP1', 'ARTIST']);
const DELIMITERS = [' - ', ' – ', ' — ', ' | ', ': '];
const MOJIBAKE_PATTERN = /[ÃÂãâåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/;
const NON_LATIN_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const WINDOWS_1252_BYTES = new Map<string, number>([
	['€', 0x80],
	['‚', 0x82],
	['ƒ', 0x83],
	['„', 0x84],
	['…', 0x85],
	['†', 0x86],
	['‡', 0x87],
	['ˆ', 0x88],
	['‰', 0x89],
	['Š', 0x8a],
	['‹', 0x8b],
	['Œ', 0x8c],
	['Ž', 0x8e],
	['‘', 0x91],
	['’', 0x92],
	['“', 0x93],
	['”', 0x94],
	['•', 0x95],
	['–', 0x96],
	['—', 0x97],
	['˜', 0x98],
	['™', 0x99],
	['š', 0x9a],
	['›', 0x9b],
	['œ', 0x9c],
	['ž', 0x9e],
	['Ÿ', 0x9f]
]);

function decodeLatin1(bytes: Uint8Array) {
	return new TextDecoder('iso-8859-1').decode(bytes);
}

function encodeWindows1252(value: string) {
	const bytes: number[] = [];

	for (const char of value) {
		const codePoint = char.codePointAt(0) ?? 0;
		if (codePoint <= 0xff) {
			bytes.push(codePoint);
			continue;
		}

		const mappedByte = WINDOWS_1252_BYTES.get(char);
		if (mappedByte === undefined) {
			return null;
		}

		bytes.push(mappedByte);
	}

	return new Uint8Array(bytes);
}

function decodeUtf16(bytes: Uint8Array, littleEndian?: boolean) {
	if (bytes.length === 0) {
		return '';
	}

	if (bytes.length >= 2) {
		if (bytes[0] === 0xff && bytes[1] === 0xfe) {
			return new TextDecoder('utf-16le').decode(bytes.subarray(2));
		}

		if (bytes[0] === 0xfe && bytes[1] === 0xff) {
			return new TextDecoder('utf-16be').decode(bytes.subarray(2));
		}
	}

	return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(bytes);
}

function decodeTextPayload(bytes: Uint8Array) {
	if (bytes.length === 0) {
		return '';
	}

	const encoding = bytes[0];
	const payload = bytes.subarray(1);
	switch (encoding) {
		case 0:
			return decodeLatin1(payload);
		case 1:
			return decodeUtf16(payload, true);
		case 2:
			return decodeUtf16(payload, false);
		case 3:
			return new TextDecoder('utf-8').decode(payload);
		default:
			return decodeLatin1(bytes);
	}
}

function attemptUtf8Repair(value: string) {
	if (!MOJIBAKE_PATTERN.test(value) || NON_LATIN_PATTERN.test(value)) {
		return value;
	}

	try {
		const bytes = encodeWindows1252(value);
		if (!bytes) {
			return value;
		}

		const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		if (!repaired.trim()) {
			return value;
		}

		const repairedLooksBetter =
			NON_LATIN_PATTERN.test(repaired) ||
			(MOJIBAKE_PATTERN.test(value) && !MOJIBAKE_PATTERN.test(repaired));
		return repairedLooksBetter ? repaired : value;
	} catch {
		return value;
	}
}

export function sanitizeMetadataText(value: string) {
	return attemptUtf8Repair(value).replace(/\0/g, '').replace(/\s+/g, ' ').trim();
}

function splitCombinedTitle(value: string): TrackMetadata {
	const cleaned = sanitizeMetadataText(value);
	for (const delimiter of DELIMITERS) {
		const index = cleaned.indexOf(delimiter);
		if (index > 0 && index < cleaned.length - delimiter.length) {
			return {
				artist: sanitizeMetadataText(cleaned.slice(0, index)),
				title: sanitizeMetadataText(cleaned.slice(index + delimiter.length))
			};
		}
	}

	return {
		artist: '',
		title: cleaned
	};
}

function readSynchsafeInteger(bytes: Uint8Array) {
	if (bytes.length < 4) {
		return 0;
	}

	return (
		((bytes[0] ?? 0) << 21) |
		((bytes[1] ?? 0) << 14) |
		((bytes[2] ?? 0) << 7) |
		(bytes[3] ?? 0)
	);
}

function readFrameSize(version: number, bytes: Uint8Array) {
	if (bytes.length < 4) {
		return 0;
	}

	if (version === 4) {
		return readSynchsafeInteger(bytes);
	}

	return (
		((bytes[0] ?? 0) << 24) |
		((bytes[1] ?? 0) << 16) |
		((bytes[2] ?? 0) << 8) |
		(bytes[3] ?? 0)
	);
}

function parseTextFramePayload(frameId: string, payload: Uint8Array) {
	const decoded = sanitizeMetadataText(decodeTextPayload(payload));
	if (!decoded) {
		return null;
	}

	if (frameId === 'TXXX') {
		const nulIndex = decoded.indexOf('\0');
		if (nulIndex >= 0) {
			return {
				description: sanitizeMetadataText(decoded.slice(0, nulIndex)),
				value: sanitizeMetadataText(decoded.slice(nulIndex + 1))
			};
		}
	}

	return decoded;
}

function extractFrameString(value: unknown): string {
	if (typeof value === 'string') {
		return sanitizeMetadataText(value);
	}

	if (Array.isArray(value)) {
		return sanitizeMetadataText(
			value
				.map((item) => extractFrameString(item))
				.filter(Boolean)
				.join(' ')
		);
	}

	if (!value || typeof value !== 'object') {
		return '';
	}

	const record = value as Record<string, unknown>;
	for (const key of ['value', 'data', 'text', 'info']) {
		const candidate = extractFrameString(record[key]);
		if (candidate) {
			return candidate;
		}
	}

	return '';
}

function collectFrames(value: unknown, frames: Array<Record<string, unknown>>) {
	if (Array.isArray(value)) {
		for (const item of value) {
			collectFrames(item, frames);
		}
		return;
	}

	if (!value || typeof value !== 'object') {
		return;
	}

	const record = value as Record<string, unknown>;
	if (typeof record.id === 'string' || typeof record.key === 'string') {
		frames.push(record);
	}

	for (const nested of Object.values(record)) {
		collectFrames(nested, frames);
	}
}

export function extractTrackMetadataFromCueValue(value: unknown): TrackMetadata | null {
	const frames: Array<Record<string, unknown>> = [];
	collectFrames(value, frames);
	let title = '';
	let artist = '';

	for (const frame of frames) {
		const frameId = String(frame.id ?? frame.key ?? '').toUpperCase();
		const frameValue = extractFrameString(frame);
		if (!frameValue) {
			continue;
		}

		if (!title && TITLE_FRAME_IDS.has(frameId)) {
			title = frameValue;
		}

		if (!artist && ARTIST_FRAME_IDS.has(frameId)) {
			artist = frameValue;
		}

		if (frameId === 'TXXX') {
			const description = sanitizeMetadataText(String(frame.description ?? frame.info ?? ''));
			if (!title && /title|song|streamtitle/i.test(description)) {
				title = frameValue;
			}
			if (!artist && /artist/i.test(description)) {
				artist = frameValue;
			}
		}
	}

	if (!title && !artist) {
		return null;
	}

	if (!title && artist) {
		return splitCombinedTitle(artist);
	}

	return {
		artist: sanitizeMetadataText(artist),
		title: sanitizeMetadataText(title)
	};
}

export function extractTrackMetadataFromId3(data: Uint8Array): TrackMetadata | null {
	if (data.length < 10 || data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) {
		return null;
	}

	const version = data[3] ?? 0;
	const tagSize = readSynchsafeInteger(data.subarray(6, 10));
	let offset = 10;
	const tagEnd = Math.min(data.length, offset + tagSize);
	let title = '';
	let artist = '';

	while (offset + 10 <= tagEnd) {
		const frameId = decodeLatin1(data.subarray(offset, offset + 4)).replace(/\0/g, '').trim();
		if (!frameId) {
			break;
		}

		const frameSize = readFrameSize(version, data.subarray(offset + 4, offset + 8));
		if (frameSize <= 0 || offset + 10 + frameSize > tagEnd) {
			break;
		}

		const payload = data.subarray(offset + 10, offset + 10 + frameSize);
		if (frameId.startsWith('T')) {
			const parsed = parseTextFramePayload(frameId, payload);
			if (typeof parsed === 'string') {
				if (!title && TITLE_FRAME_IDS.has(frameId)) {
					title = parsed;
				}
				if (!artist && ARTIST_FRAME_IDS.has(frameId)) {
					artist = parsed;
				}
			} else if (parsed && frameId === 'TXXX') {
				if (!title && /title|song|streamtitle/i.test(parsed.description)) {
					title = parsed.value;
				}
				if (!artist && /artist/i.test(parsed.description)) {
					artist = parsed.value;
				}
			}
		}

		offset += 10 + frameSize;
	}

	if (!title && !artist) {
		return null;
	}

	if (!title && artist) {
		return splitCombinedTitle(artist);
	}

	return {
		artist: sanitizeMetadataText(artist),
		title: sanitizeMetadataText(title)
	};
}

export function extractTrackMetadataFromIcyMetadata(metadata: string): TrackMetadata | null {
	const match = /StreamTitle='([^']*)';?/i.exec(metadata);
	if (!match?.[1]) {
		return null;
	}

	const parsed = splitCombinedTitle(match[1]);
	if (!parsed.title && !parsed.artist) {
		return null;
	}

	return parsed;
}

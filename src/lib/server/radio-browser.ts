import type { RadioStation } from '$lib/types/radio';
import { getCuratedStations } from '$lib/server/curated-stations';

const RADIO_BROWSER_ENDPOINT = 'https://de1.api.radio-browser.info/json/stations/search';
const CURATED_SOURCES_LABEL = 'curated: nts.live';
const PAGE_SIZE = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const STREAM_VALIDATION_TTL_MS = 2 * 60 * 60 * 1000;
const STREAM_VALIDATION_TIMEOUT_MS = 4500;
const STREAM_VALIDATION_CONCURRENCY = 24;
const STREAM_VALIDATION_TARGET = 1500;
const STREAM_VALIDATION_CANDIDATE_LIMIT = 2500;

type RawStation = {
	stationuuid?: string;
	name?: string | null;
	url?: string | null;
	url_resolved?: string | null;
	homepage?: string | null;
	favicon?: string | null;
	tags?: string | null;
	country?: string | null;
	countrycode?: string | null;
	language?: string | null;
	codec?: string | null;
	bitrate?: number | string | null;
	votes?: number | string | null;
	geo_lat?: number | string | null;
	geo_long?: number | string | null;
};

export type RadioStationSnapshot = {
	stations: RadioStation[];
	updatedAt: string;
	source: string;
};

const cache: {
	expiresAt: number;
	updatedAt: string;
	validatedUpdatedAt: string;
	stations: RadioStation[];
	pending: Promise<RadioStationSnapshot> | null;
	validationPending: Promise<void> | null;
} = {
	expiresAt: 0,
	updatedAt: new Date(0).toISOString(),
	validatedUpdatedAt: '',
	stations: [],
	pending: null,
	validationPending: null
};

const streamValidationCache = new Map<
	string,
	{
		ok: boolean;
		checkedAt: number;
	}
>();

function safeText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function parseNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

function safeUrl(value: unknown): string {
	const input = safeText(value);

	if (!input) {
		return '';
	}

	try {
		const url = new URL(input);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
	} catch {
		return '';
	}
}

function hasEphemeralAuthParams(value: string): boolean {
	try {
		const url = new URL(value);
		const ephemeralParams = ['zt', 'token', 'auth', 'expires', 'exp', 'signature', 'sig'];
		return ephemeralParams.some((key) => url.searchParams.has(key));
	} catch {
		return false;
	}
}

function pickStreamUrl(raw: RawStation): string {
	const directUrl = safeUrl(raw.url);
	const resolvedUrl = safeUrl(raw.url_resolved);

	if (resolvedUrl && directUrl && hasEphemeralAuthParams(resolvedUrl)) {
		return directUrl;
	}

	return resolvedUrl || directUrl;
}

function parseTags(value: unknown): string[] {
	return [
		...new Set(
			safeText(value)
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean)
		)
	].slice(0, 12);
}

function mergeStations(primary: RadioStation[], secondary: RadioStation[]): RadioStation[] {
	const merged = [...primary];
	const seenIds = new Set(primary.map((station) => station.id));
	const seenStreamUrls = new Set(primary.map((station) => station.streamUrl));

	for (const station of secondary) {
		if (seenIds.has(station.id) || seenStreamUrls.has(station.streamUrl)) {
			continue;
		}

		seenIds.add(station.id);
		seenStreamUrls.add(station.streamUrl);
		merged.push(station);
	}

	return merged;
}

export function isRejectedContentType(contentType: string): boolean {
	const normalized = contentType.toLowerCase();

	return (
		normalized.includes('text/html') ||
		normalized.includes('application/json') ||
		normalized.includes('text/json') ||
		normalized.includes('application/xml') ||
		normalized.includes('text/xml') ||
		normalized.startsWith('image/')
	);
}

async function validateStreamUrl(streamUrl: string): Promise<boolean> {
	const now = Date.now();
	const cached = streamValidationCache.get(streamUrl);

	if (cached && now - cached.checkedAt < STREAM_VALIDATION_TTL_MS) {
		return cached.ok;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), STREAM_VALIDATION_TIMEOUT_MS);

	try {
		const response = await fetch(streamUrl, {
			method: 'GET',
			redirect: 'follow',
			signal: controller.signal,
			headers: {
				'user-agent': 'radio-world/0.0.1',
				accept: '*/*',
				'icy-metadata': '1'
			}
		});
		const contentType = response.headers.get('content-type') ?? '';
		const ok = response.ok && !isRejectedContentType(contentType);

		response.body?.cancel().catch(() => {
			// Ignore cancellation failures from already-closed streams.
		});
		streamValidationCache.set(streamUrl, { ok, checkedAt: now });
		return ok;
	} catch {
		streamValidationCache.set(streamUrl, { ok: false, checkedAt: now });
		return false;
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function verifyStations(stations: RadioStation[]): Promise<RadioStation[]> {
	const candidates = stations.slice(0, STREAM_VALIDATION_CANDIDATE_LIMIT);
	const verified: Array<RadioStation | null> = new Array(candidates.length).fill(null);
	let nextIndex = 0;
	let acceptedCount = 0;

	async function worker() {
		for (;;) {
			if (acceptedCount >= STREAM_VALIDATION_TARGET) {
				return;
			}

			const currentIndex = nextIndex;
			nextIndex += 1;

			if (currentIndex >= candidates.length) {
				return;
			}

			const station = candidates[currentIndex];
			if (await validateStreamUrl(station.streamUrl)) {
				verified[currentIndex] = station;
				acceptedCount += 1;
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(STREAM_VALIDATION_CONCURRENCY, candidates.length) }, () =>
			worker()
		)
	);

	const filtered = verified.filter((station): station is RadioStation => station !== null);
	const baseline = filtered.length > 0 ? filtered : stations.slice(0, Math.min(stations.length, 250));
	return mergeStations(baseline, getCuratedStations());
}

function scheduleStationValidation(stations: RadioStation[], updatedAt: string) {
	if (cache.validationPending || cache.validatedUpdatedAt === updatedAt) {
		return;
	}

	cache.validationPending = verifyStations(stations)
		.then((verifiedStations) => {
			if (cache.updatedAt !== updatedAt) {
				return;
			}

			cache.stations = verifiedStations;
			cache.validatedUpdatedAt = updatedAt;
		})
		.catch((error: unknown) => {
			console.warn('Background station validation failed', error);
		})
		.finally(() => {
			cache.validationPending = null;
		});
}

export function normalizeStation(raw: RawStation): RadioStation | null {
	const id = safeText(raw.stationuuid);
	const lat = parseNumber(raw.geo_lat);
	const lon = parseNumber(raw.geo_long);
	const streamUrl = pickStreamUrl(raw);

	if (!id || lat === null || lon === null || !streamUrl) {
		return null;
	}

	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		return null;
	}

	return {
		id,
		name: safeText(raw.name) || 'Untitled Station',
		country: safeText(raw.country) || 'Unknown',
		countryCode: safeText(raw.countrycode).toUpperCase(),
		language: safeText(raw.language) || 'Unknown',
		codec: safeText(raw.codec).toUpperCase() || 'Unknown',
		bitrate: parseNumber(raw.bitrate),
		votes: parseNumber(raw.votes) ?? 0,
		homepage: safeUrl(raw.homepage),
		favicon: safeUrl(raw.favicon),
		streamUrl,
		lat,
		lon,
		tags: parseTags(raw.tags)
	};
}

async function fetchStationPage(offset: number): Promise<RawStation[]> {
	const url = new URL(RADIO_BROWSER_ENDPOINT);
	url.searchParams.set('hidebroken', 'true');
	url.searchParams.set('has_geo_info', 'true');
	url.searchParams.set('order', 'votes');
	url.searchParams.set('reverse', 'true');
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(offset));

	const response = await fetch(url, {
		headers: {
			'user-agent': 'radio-world/0.0.1'
		}
	});

	if (!response.ok) {
		throw new Error(`Radio Browser responded with ${response.status}`);
	}

	const payload = (await response.json()) as unknown;

	if (!Array.isArray(payload)) {
		throw new Error('Radio Browser returned an invalid payload');
	}

	return payload as RawStation[];
}

async function loadStations(): Promise<RadioStationSnapshot> {
	const stations: RadioStation[] = [];
	const seen = new Set<string>();

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const page = await fetchStationPage(offset);

		for (const station of page) {
			const normalized = normalizeStation(station);

			if (!normalized || seen.has(normalized.id)) {
				continue;
			}

			seen.add(normalized.id);
			stations.push(normalized);
		}

		if (page.length < PAGE_SIZE) {
			break;
		}
	}

	const mergedStations = mergeStations(stations, getCuratedStations());

	return {
		stations: mergedStations,
		updatedAt: new Date().toISOString(),
		source: `${RADIO_BROWSER_ENDPOINT} + ${CURATED_SOURCES_LABEL}`
	};
}

export async function getRadioStations(forceRefresh = false): Promise<RadioStationSnapshot> {
	const now = Date.now();

	if (!forceRefresh && cache.stations.length > 0 && cache.expiresAt > now) {
		scheduleStationValidation(cache.stations, cache.updatedAt);
		return {
			stations: cache.stations,
			updatedAt: cache.updatedAt,
			source: `${RADIO_BROWSER_ENDPOINT} + ${CURATED_SOURCES_LABEL}`
		};
	}

	if (!forceRefresh && cache.pending) {
		return cache.pending;
	}

	cache.pending = loadStations()
		.then((snapshot) => {
			cache.stations = snapshot.stations;
			cache.updatedAt = snapshot.updatedAt;
			cache.validatedUpdatedAt = '';
			cache.expiresAt = Date.now() + CACHE_TTL_MS;
			scheduleStationValidation(snapshot.stations, snapshot.updatedAt);
			return snapshot;
		})
		.catch((error: unknown) => {
			if (cache.stations.length > 0) {
				return {
					stations: cache.stations,
					updatedAt: cache.updatedAt,
					source: `${RADIO_BROWSER_ENDPOINT} + ${CURATED_SOURCES_LABEL}`
				};
			}

			throw error;
		})
		.finally(() => {
			cache.pending = null;
		});

	return cache.pending;
}

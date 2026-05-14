import type { RadioStation } from '$lib/types/radio';

const RADIO_BROWSER_ENDPOINT = 'https://de1.api.radio-browser.info/json/stations/search';
const PAGE_SIZE = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000;

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
	stations: RadioStation[];
	pending: Promise<RadioStationSnapshot> | null;
} = {
	expiresAt: 0,
	updatedAt: new Date(0).toISOString(),
	stations: [],
	pending: null
};

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

export function normalizeStation(raw: RawStation): RadioStation | null {
	const id = safeText(raw.stationuuid);
	const lat = parseNumber(raw.geo_lat);
	const lon = parseNumber(raw.geo_long);
	const streamUrl = safeUrl(raw.url_resolved) || safeUrl(raw.url);

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

	return {
		stations,
		updatedAt: new Date().toISOString(),
		source: RADIO_BROWSER_ENDPOINT
	};
}

export async function getRadioStations(forceRefresh = false): Promise<RadioStationSnapshot> {
	const now = Date.now();

	if (!forceRefresh && cache.stations.length > 0 && cache.expiresAt > now) {
		return {
			stations: cache.stations,
			updatedAt: cache.updatedAt,
			source: RADIO_BROWSER_ENDPOINT
		};
	}

	if (!forceRefresh && cache.pending) {
		return cache.pending;
	}

	cache.pending = loadStations()
		.then((snapshot) => {
			cache.stations = snapshot.stations;
			cache.updatedAt = snapshot.updatedAt;
			cache.expiresAt = Date.now() + CACHE_TTL_MS;
			return snapshot;
		})
		.catch((error: unknown) => {
			if (cache.stations.length > 0) {
				return {
					stations: cache.stations,
					updatedAt: cache.updatedAt,
					source: RADIO_BROWSER_ENDPOINT
				};
			}

			throw error;
		})
		.finally(() => {
			cache.pending = null;
		});

	return cache.pending;
}

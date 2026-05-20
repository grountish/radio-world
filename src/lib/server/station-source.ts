import type { RadioStation } from '../types/radio';
import { getCuratedStations } from './curated-stations';
import { preferSecureUrl } from '../utils/url-security';
import { APP_USER_AGENT } from '../config/app-version';

export const RADIO_BROWSER_SOURCE_LABEL = 'radio-browser.info';
export const CURATED_SOURCES_LABEL = 'curated: nts.live';
export const PAGE_SIZE = 5000;

// radio-browser.info is a network of mirrors; they ask clients not to depend on
// a single hardcoded server. We discover the current mirror list at runtime and
// fail over between them. `all.api.radio-browser.info` round-robins across
// whatever is live, so it works even when the named seeds are stale.
const RADIO_BROWSER_BASE_DOMAIN = 'api.radio-browser.info';
const RADIO_BROWSER_ALL_HOST = 'all.api.radio-browser.info';
const STATIONS_SEARCH_PATH = '/json/stations/search';
const SERVERS_PATH = '/json/servers';
const SEED_MIRRORS = [
	'https://de1.api.radio-browser.info',
	'https://de2.api.radio-browser.info',
	'https://nl1.api.radio-browser.info',
	`https://${RADIO_BROWSER_ALL_HOST}`
];
const MIRROR_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const MIRROR_DISCOVERY_TIMEOUT_MS = 5000;
const STATION_PAGE_TIMEOUT_MS = 20000;

type DiscoveredServer = { name?: string | null };

let mirrorCache: { bases: string[]; expiresAt: number } | null = null;

export type RawStation = {
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
		return url.protocol === 'http:' || url.protocol === 'https:'
			? preferSecureUrl(url.toString())
			: '';
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

export function mergeStations(primary: RadioStation[], secondary: RadioStation[]): RadioStation[] {
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

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				'user-agent': APP_USER_AGENT
			}
		});

		if (!response.ok) {
			throw new Error(`Radio Browser responded with ${response.status}`);
		}

		return await response.json();
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Discovers the currently live radio-browser mirrors. Falls back to the seed
 * list (which includes the round-robin `all.` host) if discovery fails, so this
 * never throws.
 */
async function discoverMirrors(): Promise<string[]> {
	try {
		const payload = await fetchJson(
			`https://${RADIO_BROWSER_ALL_HOST}${SERVERS_PATH}`,
			MIRROR_DISCOVERY_TIMEOUT_MS
		);

		if (!Array.isArray(payload)) {
			return SEED_MIRRORS;
		}

		const bases = [
			...new Set(
				(payload as DiscoveredServer[])
					.map((server) => (typeof server?.name === 'string' ? server.name.trim() : ''))
					.filter((name) => name.endsWith(RADIO_BROWSER_BASE_DOMAIN))
			)
		].map((name) => `https://${name}`);

		// Keep the round-robin host as a final fallback even when named mirrors exist.
		return bases.length > 0 ? [...bases, `https://${RADIO_BROWSER_ALL_HOST}`] : SEED_MIRRORS;
	} catch {
		return SEED_MIRRORS;
	}
}

async function getMirrors(): Promise<string[]> {
	const now = Date.now();

	if (mirrorCache && mirrorCache.expiresAt > now && mirrorCache.bases.length > 0) {
		return mirrorCache.bases;
	}

	const bases = await discoverMirrors();
	mirrorCache = { bases, expiresAt: now + MIRROR_LIST_TTL_MS };
	return bases;
}

function shuffle<T>(items: T[]): T[] {
	const copy = [...items];

	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}

	return copy;
}

async function fetchStationPageFrom(base: string, offset: number): Promise<RawStation[]> {
	const url = new URL(`${base}${STATIONS_SEARCH_PATH}`);
	url.searchParams.set('hidebroken', 'true');
	url.searchParams.set('has_geo_info', 'true');
	url.searchParams.set('order', 'votes');
	url.searchParams.set('reverse', 'true');
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(offset));

	const payload = await fetchJson(url.toString(), STATION_PAGE_TIMEOUT_MS);

	if (!Array.isArray(payload)) {
		throw new Error('Radio Browser returned an invalid payload');
	}

	return payload as RawStation[];
}

/**
 * Fetches the full station catalog from Radio Browser and merges in the curated
 * stations. Used both by the live runtime loader and by the offline snapshot
 * generator (`scripts/update-stations-snapshot.ts`).
 *
 * Mirrors are tried in a shuffled order (to spread load) and we fail over to the
 * next mirror whenever one stops responding mid-run. Only throws if every known
 * mirror is unreachable.
 *
 * @param options.maxStations Optional cap on how many fetched stations to keep
 *   (curated stations are always merged in afterwards). Useful to keep the
 *   committed fallback snapshot to a sane size.
 */
export async function loadStationCatalog(
	options: { maxStations?: number } = {}
): Promise<RadioStationSnapshot> {
	const { maxStations } = options;
	const stations: RadioStation[] = [];
	const seen = new Set<string>();

	const mirrors = shuffle(await getMirrors());
	let mirrorIndex = 0;

	// Stick to one working mirror for the whole run; advance to the next only
	// when the current one fails a page request.
	async function fetchPage(offset: number): Promise<RawStation[]> {
		let lastError: unknown;

		for (; mirrorIndex < mirrors.length; mirrorIndex += 1) {
			try {
				return await fetchStationPageFrom(mirrors[mirrorIndex], offset);
			} catch (error) {
				lastError = error;
				console.warn(`Radio Browser mirror failed (${mirrors[mirrorIndex]})`, error);
			}
		}

		throw lastError ?? new Error('All Radio Browser mirrors are unavailable');
	}

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const page = await fetchPage(offset);

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

		if (maxStations && stations.length >= maxStations) {
			break;
		}
	}

	const capped = maxStations ? stations.slice(0, maxStations) : stations;
	const mergedStations = mergeStations(capped, getCuratedStations());

	return {
		stations: mergedStations,
		updatedAt: new Date().toISOString(),
		source: `${RADIO_BROWSER_SOURCE_LABEL} + ${CURATED_SOURCES_LABEL}`
	};
}

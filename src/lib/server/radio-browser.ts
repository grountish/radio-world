import { APP_USER_AGENT } from '$lib/config/app-version';
import type { RadioStation } from '$lib/types/radio';
import { getCuratedStations } from '$lib/server/curated-stations';
import {
	CURATED_SOURCES_LABEL,
	RADIO_BROWSER_SOURCE_LABEL,
	loadStationCatalog,
	mergeStations
} from '$lib/server/station-source';
import type { RadioStationSnapshot } from '$lib/server/station-source';
import offlineSnapshot from '$lib/server/data/stations-snapshot.json';

const CACHE_TTL_MS = 30 * 60 * 1000;
// When we are forced onto the committed snapshot (live source unreachable on a
// cold cache), retry the live source again soon instead of serving stale data
// for a full TTL.
const SNAPSHOT_FALLBACK_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_SOURCE_LABEL = 'offline snapshot fallback';
const STREAM_VALIDATION_TTL_MS = 2 * 60 * 60 * 1000;
const STREAM_VALIDATION_TIMEOUT_MS = 4500;
const STREAM_VALIDATION_CONCURRENCY = 24;
const STREAM_VALIDATION_CANDIDATE_LIMIT = 2500;

export type { RadioStationSnapshot } from '$lib/server/station-source';
export { normalizeStation } from '$lib/server/station-source';

const cache: {
	expiresAt: number;
	updatedAt: string;
	validatedUpdatedAt: string;
	sourceStations: RadioStation[];
	stations: RadioStation[];
	pending: Promise<RadioStationSnapshot> | null;
	validationPending: Promise<void> | null;
} = {
	expiresAt: 0,
	updatedAt: new Date(0).toISOString(),
	validatedUpdatedAt: '',
	sourceStations: [],
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

function isHlsResponse(streamUrl: string, contentType: string): boolean {
	return (
		isHlsStreamUrl(streamUrl) || contentType.toLowerCase().includes('application/vnd.apple.mpegurl')
	);
}

function hasCorsSupport(headers: Headers): boolean {
	const value = headers.get('access-control-allow-origin');
	return value === '*' || (typeof value === 'string' && value.trim().length > 0);
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
				'user-agent': APP_USER_AGENT,
				accept: '*/*',
				'icy-metadata': '1'
			}
		});
		const contentType = response.headers.get('content-type') ?? '';
		const ok =
			response.ok &&
			!isRejectedContentType(contentType) &&
			(!isHlsResponse(streamUrl, contentType) || hasCorsSupport(response.headers));

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

function isHlsStreamUrl(streamUrl: string) {
	return /\.m3u8($|[?#])/i.test(streamUrl);
}

async function verifyStationBatch(
	stations: RadioStation[],
	onValidated?: (station: RadioStation, ok: boolean) => void
): Promise<RadioStation[]> {
	const verified: boolean[] = new Array(stations.length).fill(false);
	let nextIndex = 0;

	async function worker() {
		for (;;) {
			const currentIndex = nextIndex;
			nextIndex += 1;

			if (currentIndex >= stations.length) {
				return;
			}

			const station = stations[currentIndex];
			const ok = await validateStreamUrl(station.streamUrl);
			verified[currentIndex] = ok;
			onValidated?.(station, ok);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(STREAM_VALIDATION_CONCURRENCY, stations.length) }, () => worker())
	);

	return stations.filter((_, index) => verified[index]);
}

function filterInvalidStations(
	sourceStations: RadioStation[],
	invalidStationIds: Set<string>
): RadioStation[] {
	const curatedIds = new Set(getCuratedStations().map((station) => station.id));
	return sourceStations.filter(
		(station) => !invalidStationIds.has(station.id) || curatedIds.has(station.id)
	);
}

export async function verifyStations(stations: RadioStation[]): Promise<RadioStation[]> {
	const verifiedStations = await verifyStationBatch(stations);
	const baseline =
		verifiedStations.length > 0
			? verifiedStations
			: stations.slice(0, Math.min(stations.length, 250));
	return mergeStations(baseline, getCuratedStations());
}

function scheduleStationValidation(stations: RadioStation[], updatedAt: string) {
	if (cache.validationPending || cache.validatedUpdatedAt === updatedAt) {
		return;
	}

	cache.validationPending = (async () => {
		const invalidStationIds = new Set<string>();

		for (let offset = 0; offset < stations.length; offset += STREAM_VALIDATION_CANDIDATE_LIMIT) {
			if (cache.updatedAt !== updatedAt) {
				return;
			}

			const batch = stations.slice(offset, offset + STREAM_VALIDATION_CANDIDATE_LIMIT);
			const verifiedBatch = await verifyStationBatch(batch, (station, ok) => {
				if (!ok) {
					invalidStationIds.add(station.id);
				}

				if (cache.updatedAt !== updatedAt) {
					return;
				}

				cache.stations = filterInvalidStations(stations, invalidStationIds);
			});
			const verifiedIds = new Set(verifiedBatch.map((station) => station.id));

			for (const station of batch) {
				if (!verifiedIds.has(station.id)) {
					invalidStationIds.add(station.id);
				}
			}

			if (cache.updatedAt !== updatedAt) {
				return;
			}

			cache.stations = filterInvalidStations(stations, invalidStationIds);
		}

		cache.validatedUpdatedAt = updatedAt;
	})()
		.catch((error: unknown) => {
			console.warn('Background station validation failed', error);
		})
		.finally(() => {
			cache.validationPending = null;
		});
}

/**
 * Builds a snapshot from the committed offline catalog. This is the guaranteed
 * floor: it ships with the build, so it is available even on a cold cache while
 * the live Radio Browser source is unreachable. Curated stations are merged in
 * so they survive even if the snapshot predates them.
 */
function getOfflineSnapshot(): RadioStationSnapshot {
	const stations = (offlineSnapshot.stations ?? []) as RadioStation[];
	return {
		stations: mergeStations(stations, getCuratedStations()),
		updatedAt: offlineSnapshot.updatedAt ?? new Date(0).toISOString(),
		source: `${SNAPSHOT_SOURCE_LABEL} (generated ${offlineSnapshot.updatedAt ?? 'unknown'})`
	};
}

export async function getRadioStations(forceRefresh = false): Promise<RadioStationSnapshot> {
	const now = Date.now();

	if (!forceRefresh && cache.stations.length > 0 && cache.expiresAt > now) {
		scheduleStationValidation(
			cache.sourceStations.length > 0 ? cache.sourceStations : cache.stations,
			cache.updatedAt
		);
		return {
			stations: cache.stations,
			updatedAt: cache.updatedAt,
			source: `${RADIO_BROWSER_SOURCE_LABEL} + ${CURATED_SOURCES_LABEL}`
		};
	}

	if (!forceRefresh && cache.pending) {
		return cache.pending;
	}

	cache.pending = loadStationCatalog()
		.then((snapshot) => {
			cache.sourceStations = snapshot.stations;
			cache.stations = snapshot.stations;
			cache.updatedAt = snapshot.updatedAt;
			cache.validatedUpdatedAt = '';
			cache.expiresAt = Date.now() + CACHE_TTL_MS;
			scheduleStationValidation(snapshot.stations, snapshot.updatedAt);
			return snapshot;
		})
		.catch((error: unknown) => {
			// Serve a previously fetched catalog if we still have one in memory.
			if (cache.stations.length > 0) {
				return {
					stations: cache.stations,
					updatedAt: cache.updatedAt,
					source: `${RADIO_BROWSER_SOURCE_LABEL} + ${CURATED_SOURCES_LABEL}`
				};
			}

			// Cold cache and the live source is down: fall back to the committed
			// snapshot instead of failing. Seed the cache with a short TTL so the
			// next request retries the live source soon.
			console.warn('Live station load failed; serving committed offline snapshot', error);
			const fallback = getOfflineSnapshot();
			cache.sourceStations = fallback.stations;
			cache.stations = fallback.stations;
			cache.updatedAt = fallback.updatedAt;
			cache.validatedUpdatedAt = '';
			cache.expiresAt = Date.now() + SNAPSHOT_FALLBACK_TTL_MS;
			return fallback;
		})
		.finally(() => {
			cache.pending = null;
		});

	return cache.pending;
}

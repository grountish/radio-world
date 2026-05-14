import type { RadioStation } from '$lib/types/radio';

const FOCUS_LATITUDE_STEP = 18;
const FOCUS_LONGITUDE_STEP = 24;
const RAD_TO_DEG = 180 / Math.PI;

type FocusBin = {
	count: number;
	votes: number;
	x: number;
	y: number;
	z: number;
};

export type StationFocusTarget = {
	count: number;
	lat: number;
	lon: number;
};

function toFocusKey(lat: number, lon: number) {
	const latBucket = Math.round(lat / FOCUS_LATITUDE_STEP);
	const lonBucket = Math.round(lon / FOCUS_LONGITUDE_STEP);
	return `${latBucket}:${lonBucket}`;
}

export function getStationFocusTarget(stations: RadioStation[]): StationFocusTarget | null {
	if (stations.length === 0) {
		return null;
	}

	const bins = new Map<string, FocusBin>();

	for (const station of stations) {
		const key = toFocusKey(station.lat, station.lon);
		const existing = bins.get(key) ?? { count: 0, votes: 0, x: 0, y: 0, z: 0 };
		const latRad = (station.lat * Math.PI) / 180;
		const lonRad = (station.lon * Math.PI) / 180;

		existing.count += 1;
		existing.votes += station.votes;
		existing.x += Math.cos(latRad) * Math.sin(lonRad);
		existing.y += Math.sin(latRad);
		existing.z += Math.cos(latRad) * Math.cos(lonRad);
		bins.set(key, existing);
	}

	let best: FocusBin | null = null;

	for (const bin of bins.values()) {
		if (!best || bin.count > best.count || (bin.count === best.count && bin.votes > best.votes)) {
			best = bin;
		}
	}

	if (!best) {
		return null;
	}

	const horizontalMagnitude = Math.hypot(best.x, best.z);

	return {
		count: best.count,
		lat: Math.atan2(best.y, horizontalMagnitude) * RAD_TO_DEG,
		lon: Math.atan2(best.x, best.z) * RAD_TO_DEG
	};
}

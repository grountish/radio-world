import type { RadioStation } from '$lib/types/radio';

export type PickRandomStationOptions = {
	candidates: RadioStation[];
	currentStationId?: string;
	favoriteStations?: RadioStation[];
	random?: () => number;
};

type WeightedStation = {
	station: RadioStation;
	weight: number;
};

function normalizeTag(tag: string) {
	return tag.trim().toLowerCase();
}

function getUniqueTags(tags: string[]) {
	return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

function pickUniformRandomStation(stations: RadioStation[], random: () => number) {
	if (stations.length === 0) {
		return null;
	}

	const index = Math.min(stations.length - 1, Math.floor(random() * stations.length));
	return stations[index] ?? null;
}

function pickWeightedRandomStation(stations: WeightedStation[], random: () => number) {
	if (stations.length === 0) {
		return null;
	}

	const totalWeight = stations.reduce((sum, entry) => sum + entry.weight, 0);
	if (totalWeight <= 0) {
		return pickUniformRandomStation(
			stations.map((entry) => entry.station),
			random
		);
	}

	let target = random() * totalWeight;

	for (const entry of stations) {
		target -= entry.weight;
		if (target < 0) {
			return entry.station;
		}
	}

	return stations[stations.length - 1]?.station ?? null;
}

export function pickRandomStation({
	candidates,
	currentStationId = '',
	favoriteStations = [],
	random = Math.random
}: PickRandomStationOptions) {
	if (candidates.length === 0) {
		return null;
	}

	const availableCandidates =
		currentStationId && candidates.length > 1
			? candidates.filter((station) => station.id !== currentStationId)
			: candidates;

	if (availableCandidates.length === 0) {
		return null;
	}

	if (favoriteStations.length === 0) {
		return pickUniformRandomStation(availableCandidates, random);
	}

	const favoriteIds = new Set(favoriteStations.map((station) => station.id));
	const favoriteTagWeights = new Map<string, number>();

	for (const station of favoriteStations) {
		for (const tag of getUniqueTags(station.tags)) {
			favoriteTagWeights.set(tag, (favoriteTagWeights.get(tag) ?? 0) + 1);
		}
	}

	if (favoriteTagWeights.size === 0) {
		return pickUniformRandomStation(availableCandidates, random);
	}

	const relatedCandidates: WeightedStation[] = [];
	const otherCandidates: RadioStation[] = [];
	const fallbackFavorites: RadioStation[] = [];

	for (const station of availableCandidates) {
		if (favoriteIds.has(station.id)) {
			fallbackFavorites.push(station);
			continue;
		}

		const score = getUniqueTags(station.tags).reduce((sum, tag) => {
			return sum + (favoriteTagWeights.get(tag) ?? 0);
		}, 0);

		if (score > 0) {
			relatedCandidates.push({ station, weight: score });
			continue;
		}

		otherCandidates.push(station);
	}

	return (
		pickWeightedRandomStation(relatedCandidates, random) ??
		pickUniformRandomStation(otherCandidates, random) ??
		pickUniformRandomStation(fallbackFavorites, random)
	);
}

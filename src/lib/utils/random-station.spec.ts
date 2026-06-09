import { describe, expect, it } from 'vitest';
import type { RadioStation } from '$lib/types/radio';
import { pickRandomStation } from './random-station';

function makeStation(id: string, tags: string[] = []): RadioStation {
	return {
		id,
		name: id,
		country: 'Testland',
		countryCode: 'TS',
		language: 'Test',
		codec: 'MP3',
		bitrate: 192,
		votes: 0,
		homepage: '',
		favicon: '',
		streamUrl: `https://example.com/${id}`,
		lat: 0,
		lon: 0,
		tags
	};
}

describe('pickRandomStation', () => {
	it('returns null when there are no candidates', () => {
		expect(pickRandomStation({ candidates: [] })).toBeNull();
	});

	it('picks uniformly from the available candidates when there are no favorites', () => {
		const stations = [makeStation('a'), makeStation('b'), makeStation('c')];

		expect(
			pickRandomStation({
				candidates: stations,
				random: () => 0.6
			})?.id
		).toBe('b');
	});

	it('avoids replaying the currently selected station when alternatives exist', () => {
		const stations = [makeStation('a'), makeStation('b'), makeStation('c')];

		expect(
			pickRandomStation({
				candidates: stations,
				currentStationId: 'b',
				random: () => 0.99
			})?.id
		).toBe('c');
	});

	it('prefers non-favorite stations that overlap favorite tags', () => {
		const favorite = makeStation('favorite', ['jazz', 'soul']);
		const candidates = [
			favorite,
			makeStation('related', ['jazz']),
			makeStation('unrelated', ['news'])
		];

		expect(
			pickRandomStation({
				candidates,
				favoriteStations: [favorite],
				random: () => 0.5
			})?.id
		).toBe('related');
	});

	it('falls back to the rest of the catalog when no related stations are available', () => {
		const favorite = makeStation('favorite', ['ambient']);
		const candidates = [
			favorite,
			makeStation('other-a', ['talk']),
			makeStation('other-b', ['news'])
		];

		expect(
			pickRandomStation({
				candidates,
				favoriteStations: [favorite],
				random: () => 0.8
			})?.id
		).toBe('other-b');
	});

	it('falls back to favorites when they are the only stations left', () => {
		const favoriteA = makeStation('favorite-a', ['house']);
		const favoriteB = makeStation('favorite-b', ['house']);

		expect(
			pickRandomStation({
				candidates: [favoriteA, favoriteB],
				currentStationId: 'favorite-a',
				favoriteStations: [favoriteA, favoriteB],
				random: () => 0.2
			})?.id
		).toBe('favorite-b');
	});
});

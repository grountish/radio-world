import { describe, expect, it } from 'vitest';
import { getStationFocusTarget } from './station-focus';
import type { RadioStation } from '$lib/types/radio';

function makeStation(id: string, lat: number, lon: number, votes = 0): RadioStation {
	return {
		id,
		name: id,
		country: 'Testland',
		countryCode: 'TS',
		language: 'Test',
		codec: 'MP3',
		bitrate: 192,
		votes,
		homepage: '',
		favicon: '',
		streamUrl: `https://example.com/${id}`,
		lat,
		lon,
		tags: []
	};
}

describe('getStationFocusTarget', () => {
	it('returns null when there are no stations', () => {
		expect(getStationFocusTarget([])).toBeNull();
	});

	it('focuses the densest region instead of distant outliers', () => {
		const focus = getStationFocusTarget([
			makeStation('paris-1', 48.85, 2.35, 10),
			makeStation('paris-2', 48.9, 2.4, 5),
			makeStation('paris-3', 48.8, 2.2, 3),
			makeStation('sydney', -33.86, 151.21, 500)
		]);

		expect(focus).not.toBeNull();
		expect(focus?.count).toBe(3);
		expect(focus?.lat).toBeCloseTo(48.85, 1);
		expect(focus?.lon).toBeCloseTo(2.32, 1);
	});

	it('breaks ties by favoring the region with more votes', () => {
		const focus = getStationFocusTarget([
			makeStation('london-1', 51.5, -0.1, 20),
			makeStation('london-2', 51.55, -0.15, 20),
			makeStation('tokyo-1', 35.68, 139.76, 80),
			makeStation('tokyo-2', 35.7, 139.8, 80)
		]);

		expect(focus).not.toBeNull();
		expect(focus?.count).toBe(2);
		expect(focus?.lat).toBeCloseTo(35.69, 1);
		expect(focus?.lon).toBeCloseTo(139.78, 1);
	});
});

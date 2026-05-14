import { describe, expect, it } from 'vitest';
import { normalizeStation } from './radio-browser';

describe('normalizeStation', () => {
	it('keeps only safe, mappable stations', () => {
		const station = normalizeStation({
			stationuuid: 'abc-123',
			name: 'Signal One',
			country: 'France',
			countrycode: 'fr',
			language: 'French',
			codec: 'mp3',
			bitrate: '192',
			votes: '42',
			homepage: 'https://example.com',
			favicon: 'https://example.com/icon.png',
			url_resolved: 'https://stream.example.com/live',
			geo_lat: '48.8566',
			geo_long: '2.3522',
			tags: 'news, talk,news'
		});

		expect(station).toEqual({
			id: 'abc-123',
			name: 'Signal One',
			country: 'France',
			countryCode: 'FR',
			language: 'French',
			codec: 'MP3',
			bitrate: 192,
			votes: 42,
			homepage: 'https://example.com/',
			favicon: 'https://example.com/icon.png',
			streamUrl: 'https://stream.example.com/live',
			lat: 48.8566,
			lon: 2.3522,
			tags: ['news', 'talk']
		});
	});

	it('drops stations without a valid stream or coordinates', () => {
		expect(
			normalizeStation({
				stationuuid: 'bad-stream',
				url_resolved: 'javascript:alert(1)',
				geo_lat: 10,
				geo_long: 10
			})
		).toBeNull();

		expect(
			normalizeStation({
				stationuuid: 'bad-lat',
				url_resolved: 'https://stream.example.com/live',
				geo_lat: 190,
				geo_long: 10
			})
		).toBeNull();
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRejectedContentType, normalizeStation, verifyStations } from './radio-browser';
import { getCuratedStations } from './curated-stations';

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

	it('upgrades station urls to https when the source uses http', () => {
		const station = normalizeStation({
			stationuuid: 'secure-upgrade',
			name: 'Secure Upgrade',
			homepage: 'http://example.com',
			favicon: 'http://example.com/icon.png',
			url_resolved: 'http://stream.example.com/live',
			geo_lat: '48.8566',
			geo_long: '2.3522'
		});

		expect(station).toEqual(
			expect.objectContaining({
				homepage: 'https://example.com/',
				favicon: 'https://example.com/icon.png',
				streamUrl: 'https://stream.example.com/live'
			})
		);
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

	it('prefers the canonical stream url when the resolved url is signed and expires', () => {
		const station = normalizeStation({
			stationuuid: 'signed-zeno',
			name: 'Signed Stream',
			url: 'https://stream.zeno.fm/pwezjsgefu9tv',
			url_resolved:
				'https://stream-175.zeno.fm/pwezjsgefu9tv?zt=eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3Nzg4NzUyMzh9.signature',
			geo_lat: '19.43',
			geo_long: '-99.13'
		});

		expect(station?.streamUrl).toBe('https://stream.zeno.fm/pwezjsgefu9tv');
	});
});

describe('stream verification', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('rejects obvious non-stream content types', () => {
		expect(isRejectedContentType('text/html; charset=utf-8')).toBe(true);
		expect(isRejectedContentType('application/json')).toBe(true);
		expect(isRejectedContentType('image/png')).toBe(true);
		expect(isRejectedContentType('audio/mpeg')).toBe(false);
		expect(isRejectedContentType('application/vnd.apple.mpegurl')).toBe(false);
	});

	it('rejects hls manifests that do not expose cors headers', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);

			if (url.includes('nocors.example.com')) {
				return new Response('#EXTM3U', {
					status: 200,
					headers: {
						'content-type': 'application/vnd.apple.mpegurl'
					}
				});
			}

			if (url.includes('cors.example.com')) {
				return new Response('#EXTM3U', {
					status: 200,
					headers: {
						'content-type': 'application/vnd.apple.mpegurl',
						'access-control-allow-origin': '*'
					}
				});
			}

			return new Response(null, {
				status: 503,
				headers: {
					'content-type': 'text/plain'
				}
			});
		});

		const stations = [
			{
				id: 'nocors-hls',
				name: 'No CORS HLS',
				country: 'France',
				countryCode: 'FR',
				language: 'French',
				codec: 'HLS',
				bitrate: 64,
				votes: 10,
				homepage: '',
				favicon: '',
				streamUrl: 'https://nocors.example.com/live.m3u8',
				lat: 48.8,
				lon: 2.3,
				tags: []
			},
			{
				id: 'cors-hls',
				name: 'CORS HLS',
				country: 'France',
				countryCode: 'FR',
				language: 'French',
				codec: 'HLS',
				bitrate: 64,
				votes: 9,
				homepage: '',
				favicon: '',
				streamUrl: 'https://cors.example.com/live.m3u8',
				lat: 48.9,
				lon: 2.4,
				tags: []
			}
		];

		const result = await verifyStations(stations);

		expect(result).toEqual(
			expect.arrayContaining([stations[1], expect.objectContaining({ id: 'nts-1' })])
		);
		expect(result).not.toEqual(expect.arrayContaining([stations[0]]));
	});

	it('validates playable stations across the whole catalog, including deep-tail entries', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);

			if (url.includes('good.example.com')) {
				return new Response(null, {
					status: 200,
					headers: {
						'content-type': 'audio/mpeg'
					}
				});
			}

			if (url.includes('html.example.com')) {
				return new Response('<html></html>', {
					status: 200,
					headers: {
						'content-type': 'text/html; charset=utf-8'
					}
				});
			}

			return new Response(null, {
				status: 503,
				headers: {
					'content-type': 'text/plain'
				}
			});
		});

		const fillerStations = Array.from({ length: 2497 }, (_, index) => ({
			id: `filler-${index}`,
			name: `Filler ${index}`,
			country: 'France',
			countryCode: 'FR',
			language: 'French',
			codec: 'MP3',
			bitrate: 128,
			votes: 7 - index,
			homepage: '',
			favicon: '',
			streamUrl: `https://good.example.com/filler-${index}`,
			lat: 45 + index * 0.001,
			lon: 2 + index * 0.001,
			tags: []
		}));

		const stations = [
			{
				id: 'good',
				name: 'Good',
				country: 'France',
				countryCode: 'FR',
				language: 'French',
				codec: 'MP3',
				bitrate: 128,
				votes: 10,
				homepage: '',
				favicon: '',
				streamUrl: 'https://good.example.com/live',
				lat: 48.8,
				lon: 2.3,
				tags: []
			},
			{
				id: 'html',
				name: 'Html',
				country: 'France',
				countryCode: 'FR',
				language: 'French',
				codec: 'MP3',
				bitrate: 128,
				votes: 9,
				homepage: '',
				favicon: '',
				streamUrl: 'https://html.example.com/live',
				lat: 48.9,
				lon: 2.4,
				tags: []
			},
			{
				id: 'down',
				name: 'Down',
				country: 'France',
				countryCode: 'FR',
				language: 'French',
				codec: 'MP3',
				bitrate: 128,
				votes: 8,
				homepage: '',
				favicon: '',
				streamUrl: 'https://down.example.com/live',
				lat: 49,
				lon: 2.5,
				tags: []
			},
			...fillerStations,
			{
				id: 'tail',
				name: 'Tail',
				country: 'France',
				countryCode: 'FR',
				language: 'French',
				codec: 'MP3',
				bitrate: 128,
				votes: 7,
				homepage: '',
				favicon: '',
				streamUrl: 'https://good.example.com/tail',
				lat: 49.1,
				lon: 2.6,
				tags: []
			}
		];

		const result = await verifyStations(stations);

		expect(result).toEqual(
			expect.arrayContaining([
				stations[0],
				stations[stations.length - 1],
				expect.objectContaining({ id: 'nts-1' })
			])
		);
		expect(result).not.toEqual(expect.arrayContaining([stations[1], stations[2]]));
	});
});

describe('curated stations', () => {
	it('includes official curated live channels', () => {
		expect(getCuratedStations()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'nts-1',
					name: 'NTS Radio 1',
					streamUrl: 'https://streams.radiomast.io/nts1/hls.m3u8'
				}),
				expect.objectContaining({
					id: 'nts-2',
					name: 'NTS Radio 2',
					streamUrl: 'https://streams.radiomast.io/nts2/hls.m3u8'
				}),
				expect.objectContaining({
					id: 'hkcr',
					name: 'Hong Kong Community Radio',
					streamUrl: 'https://stream-test.hkcr.live/hls/main.m3u8'
				})
			])
		);
	});
});

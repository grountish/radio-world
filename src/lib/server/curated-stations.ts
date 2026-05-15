import type { RadioStation } from '$lib/types/radio';

const ntsHomepage = 'https://www.nts.live/radio';
const ntsFavicon = 'https://www.nts.live/apple-touch-icon.png?v=47rE43RRzB';
const londonLat = 51.5072;
const londonLon = -0.1276;

const orokoHomepage = 'https://oroko.live/';
const orokoFavicon = 'https://oroko.live/favicon.ico';
const accraLat = 5.6037;
const accraLon = -0.1870;

const worldwideFmHomepage = 'https://worldwidefm.net/';
const worldwideFmFavicon = 'https://worldwidefm.net/favicon.ico';

const japanCityPopHomepage = 'https://boxradio.net/';
const japanCityPopFavicon = 'https://boxradio.net/favicon.ico';
const tokyoLat = 35.6762;
const tokyoLon = 139.6503;

const rinseFmHomepage = 'https://rinse.fm/';
const rinseFmFavicon = 'https://rinse.fm/favicon.ico';

const curatedStations: RadioStation[] = [
	{
		id: 'nts-1',
		name: 'NTS Radio 1',
		country: 'United Kingdom',
		countryCode: 'GB',
		language: 'English',
		codec: 'HLS',
		bitrate: null,
		votes: 100000,
		homepage: ntsHomepage,
		favicon: ntsFavicon,
		streamUrl: 'https://streams.radiomast.io/nts1/hls.m3u8',
		lat: londonLat,
		lon: londonLon,
		tags: ['nts', 'curated', 'electronic', 'global', 'live']
	},
	{
		id: 'nts-2',
		name: 'NTS Radio 2',
		country: 'United Kingdom',
		countryCode: 'GB',
		language: 'English',
		codec: 'HLS',
		bitrate: null,
		votes: 100000,
		homepage: ntsHomepage,
		favicon: ntsFavicon,
		streamUrl: 'https://streams.radiomast.io/nts2/hls.m3u8',
		lat: londonLat,
		lon: londonLon,
		tags: ['nts', 'curated', 'electronic', 'global', 'live']
	},
	{
		id: 'oroko',
		name: 'Oroko Radio',
		country: 'Ghana',
		countryCode: 'GH',
		language: 'English',
		codec: 'MP3',
		bitrate: 320,
		votes: 100000,
		homepage: orokoHomepage,
		favicon: orokoFavicon,
		streamUrl: 'https://oroko-radio.radiocult.fm/stream',
		lat: accraLat,
		lon: accraLon,
		tags: ['oroko', 'curated', 'global', 'live', 'community']
	},
	{
		id: 'worldwidefm',
		name: 'Worldwide FM',
		country: 'United Kingdom',
		countryCode: 'GB',
		language: 'English',
		codec: 'MP3',
		bitrate: 320,
		votes: 100000,
		homepage: worldwideFmHomepage,
		favicon: worldwideFmFavicon,
		streamUrl: 'https://worldwide-fm.radiocult.fm/stream',
		lat: londonLat,
		lon: londonLon,
		tags: ['worldwide', 'curated', 'electronic', 'global', 'live']
	},
	{
		id: 'japancitypop',
		name: 'Japan City Pop',
		country: 'Japan',
		countryCode: 'JP',
		language: 'Japanese',
		codec: 'MP3',
		bitrate: 128,
		votes: 100000,
		homepage: japanCityPopHomepage,
		favicon: japanCityPopFavicon,
		streamUrl: 'https://boxradio-edge-00.streamafrica.net/jpopchill',
		lat: tokyoLat,
		lon: tokyoLon,
		tags: ['japan', 'citypop', 'curated', 'chill', 'music']
	},
	{
		id: 'rinsefm',
		name: 'Rinse FM',
		country: 'United Kingdom',
		countryCode: 'GB',
		language: 'English',
		codec: 'MP3',
		bitrate: 192,
		votes: 100000,
		homepage: rinseFmHomepage,
		favicon: rinseFmFavicon,
		streamUrl: 'https://admin.stream.rinse.fm/proxy/rinse_uk/stream',
		lat: londonLat,
		lon: londonLon,
		tags: ['rinse', 'curated', 'uk', 'electronic', 'live']
	}
];

export function getCuratedStations(): RadioStation[] {
	return curatedStations.map((station) => ({
		...station,
		tags: [...station.tags]
	}));
}

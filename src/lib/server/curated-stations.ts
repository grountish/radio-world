import type { RadioStation } from '$lib/types/radio';

const ntsHomepage = 'https://www.nts.live/radio';
const ntsFavicon = 'https://www.nts.live/apple-touch-icon.png?v=47rE43RRzB';
const londonLat = 51.5072;
const londonLon = -0.1276;

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
	}
];

export function getCuratedStations(): RadioStation[] {
	return curatedStations.map((station) => ({
		...station,
		tags: [...station.tags]
	}));
}

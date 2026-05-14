export type RadioUrlState = {
	query: string;
	country: string;
	hiQualityOnly: boolean;
	stationId: string;
};

const DEFAULT_COUNTRY = 'all';

function normalizeStationId(value: string | null) {
	return value?.trim() ?? '';
}

export function parseRadioUrlState(url: URL): RadioUrlState {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const country = url.searchParams.get('country')?.trim() || DEFAULT_COUNTRY;
	const hiQualityOnly = url.searchParams.get('hd') === '1';
	const stationId = normalizeStationId(url.searchParams.get('station'));

	return {
		query,
		country,
		hiQualityOnly,
		stationId
	};
}

export function buildRadioUrl(url: URL, state: RadioUrlState): URL {
	const nextUrl = new URL(url);

	if (state.query) {
		nextUrl.searchParams.set('q', state.query);
	} else {
		nextUrl.searchParams.delete('q');
	}

	if (state.country && state.country !== DEFAULT_COUNTRY) {
		nextUrl.searchParams.set('country', state.country);
	} else {
		nextUrl.searchParams.delete('country');
	}

	if (state.hiQualityOnly) {
		nextUrl.searchParams.set('hd', '1');
	} else {
		nextUrl.searchParams.delete('hd');
	}

	if (state.stationId) {
		nextUrl.searchParams.set('station', state.stationId);
	} else {
		nextUrl.searchParams.delete('station');
	}

	return nextUrl;
}

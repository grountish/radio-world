import { describe, expect, it } from 'vitest';
import { buildRadioUrl, parseRadioUrlState } from './radio-url';

describe('radio url state', () => {
	it('parses station selection and filters from query params', () => {
		const state = parseRadioUrlState(
			new URL('https://example.com/?q=jazz&country=France&hd=1&station=station-123')
		);

		expect(state).toEqual({
			query: 'jazz',
			country: 'France',
			hiQualityOnly: true,
			stationId: 'station-123'
		});
	});

	it('omits default values when building a share url', () => {
		const url = buildRadioUrl(new URL('https://example.com/?unused=1'), {
			query: '',
			country: 'all',
			hiQualityOnly: false,
			stationId: ''
		});

		expect(url.searchParams.get('q')).toBeNull();
		expect(url.searchParams.get('country')).toBeNull();
		expect(url.searchParams.get('hd')).toBeNull();
		expect(url.searchParams.get('station')).toBeNull();
		expect(url.searchParams.get('unused')).toBe('1');
	});
});

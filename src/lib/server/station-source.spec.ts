import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStationCatalog } from './station-source';

const rawStation = {
	stationuuid: 'mirror-test',
	name: 'Mirror Test',
	url_resolved: 'https://stream.example.com/live',
	countrycode: 'es',
	geo_lat: '40.4168',
	geo_long: '-3.7038'
};

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

describe('loadStationCatalog mirror failover', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('fails over to the next mirror when one stops responding', async () => {
		let stationRequestCount = 0;

		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);

			if (url.includes('/json/servers')) {
				return jsonResponse([
					{ name: 'de1.api.radio-browser.info' },
					{ name: 'de2.api.radio-browser.info' }
				]);
			}

			if (url.includes('/json/stations/search')) {
				stationRequestCount += 1;
				// The first mirror we try is down; failover should reach a healthy one.
				if (stationRequestCount === 1) {
					throw new Error('mirror down');
				}
				return jsonResponse([rawStation]);
			}

			throw new Error(`unexpected request: ${url}`);
		});

		const snapshot = await loadStationCatalog();

		// We retried after the first failure rather than giving up.
		expect(stationRequestCount).toBeGreaterThanOrEqual(2);
		expect(snapshot.stations).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: 'mirror-test' })])
		);
	});

	it('still resolves a catalog when mirror discovery itself fails (seed fallback)', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);

			// Discovery is unreachable; the seed mirror list must carry the load.
			if (url.includes('/json/servers')) {
				throw new Error('discovery down');
			}

			if (url.includes('/json/stations/search')) {
				return jsonResponse([rawStation]);
			}

			throw new Error(`unexpected request: ${url}`);
		});

		const snapshot = await loadStationCatalog();

		expect(snapshot.stations).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: 'mirror-test' })])
		);
	});
});

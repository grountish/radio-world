import { json } from '@sveltejs/kit';
import { getRadioStations } from '$lib/server/radio-browser';
import type { RadioStationPayload } from '$lib/types/radio';

export async function GET() {
	try {
		const snapshot = await getRadioStations();
		const countries = new Set(
			snapshot.stations.map((station) => station.countryCode || station.country)
		);

		const payload: RadioStationPayload = {
			stations: snapshot.stations,
			stats: {
				total: snapshot.stations.length,
				countries: countries.size,
				updatedAt: snapshot.updatedAt,
				source: snapshot.source
			}
		};

		return json(payload, {
			headers: {
				'cache-control': 'public, max-age=300, stale-while-revalidate=1800'
			}
		});
	} catch (error) {
		console.error('Failed to load radio stations', error);

		return json(
			{
				message: 'Unable to load live radio station coordinates right now.'
			},
			{
				status: 502
			}
		);
	}
}

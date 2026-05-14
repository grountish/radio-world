export type RadioStation = {
	id: string;
	name: string;
	country: string;
	countryCode: string;
	language: string;
	codec: string;
	bitrate: number | null;
	votes: number;
	homepage: string;
	favicon: string;
	streamUrl: string;
	lat: number;
	lon: number;
	tags: string[];
};

export type RadioStationPayload = {
	stations: RadioStation[];
	stats: {
		total: number;
		countries: number;
		updatedAt: string;
		source: string;
	};
};

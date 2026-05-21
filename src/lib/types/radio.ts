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
	/**
	 * Optional "now playing" JSON feed for stations that publish track metadata
	 * out-of-band instead of via ICY/ID3 in the stream (e.g. J1 Radio's
	 * whatweplay.json). When present, the client polls this instead of sniffing
	 * the stream for metadata.
	 */
	trackInfoUrl?: string;
	/**
	 * Channel name to match within the {@link trackInfoUrl} feed when it carries
	 * multiple channels (matched against each entry's `name` field).
	 */
	trackInfoChannel?: string;
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

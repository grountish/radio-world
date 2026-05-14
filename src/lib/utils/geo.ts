export type CartesianPoint = {
	x: number;
	y: number;
	z: number;
};

const DEG_TO_RAD = Math.PI / 180;

export function latLonToCartesian(
	lat: number,
	lon: number,
	radius: number,
	altitude = 0
): CartesianPoint {
	const latRad = lat * DEG_TO_RAD;
	const lonRad = lon * DEG_TO_RAD;
	const distance = radius + altitude;

	return {
		x: distance * Math.cos(latRad) * Math.sin(lonRad),
		y: distance * Math.sin(latRad),
		z: distance * Math.cos(latRad) * Math.cos(lonRad)
	};
}

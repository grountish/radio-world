import { describe, expect, it } from 'vitest';
import { latLonToCartesian } from './geo';

describe('latLonToCartesian', () => {
	it('places the north pole on the positive y axis', () => {
		const point = latLonToCartesian(90, 0, 2);

		expect(point.x).toBeCloseTo(0, 6);
		expect(point.y).toBeCloseTo(2, 6);
		expect(point.z).toBeCloseTo(0, 6);
	});

	it('places the prime meridian on the front of the sphere', () => {
		const point = latLonToCartesian(0, 0, 3);

		expect(point.x).toBeCloseTo(0, 6);
		expect(point.y).toBeCloseTo(0, 6);
		expect(point.z).toBeCloseTo(3, 6);
	});

	it('includes altitude above the surface', () => {
		const point = latLonToCartesian(0, 90, 1.5, 0.5);

		expect(point.x).toBeCloseTo(2, 6);
		expect(point.y).toBeCloseTo(0, 6);
		expect(point.z).toBeCloseTo(0, 6);
	});
});

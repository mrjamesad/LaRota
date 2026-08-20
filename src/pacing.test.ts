import { describe, expect, it } from 'vitest';
import { cumulativeDistances } from './geo';
import { buildPacingCurve, distanceAtProgress } from './pacing';
import type { GeoPoint } from './types';

function journey(places: Array<[number, number]>): {
  points: GeoPoint[];
  cumulativeDistanceKm: number[];
} {
  const points = places.map(([latitude, longitude], index) => ({
    instant: new Date(index * 3_600_000),
    latitude,
    longitude,
  }));
  return { points, cumulativeDistanceKm: cumulativeDistances(points) };
}

describe('buildPacingCurve', () => {
  it('caps long-haul legs regardless of their length', () => {
    const { points, cumulativeDistanceKm } = journey([
      [40.00, 30.00],
      [40.05, 30.05],
      [40.10, 30.10],
      [52.00, 0.00],
    ]);
    const curve = buildPacingCurve(points, cumulativeDistanceKm);
    // Distance-wise the flight is over 98% of the journey; time-wise it is capped.
    expect(curve.shares.longHaul).toBeLessThan(0.2);
    expect(curve.shares.local).toBeGreaterThan(0.7);
  });

  it('gives a repeated corridor less time than its first crossing', () => {
    const { points, cumulativeDistanceKm } = journey([
      [40.00, 30.00],
      [52.00, 0.00],
      [40.00, 30.00],
      [52.00, 0.00],
    ]);
    const curve = buildPacingCurve(points, cumulativeDistanceKm);
    const first = curve.progressBreakpoints[1] - curve.progressBreakpoints[0];
    const repeat = curve.progressBreakpoints[2] - curve.progressBreakpoints[1];
    expect(repeat).toBeLessThan(first);
  });

  it('maps progress onto distance monotonically across the whole route', () => {
    const { points, cumulativeDistanceKm } = journey([
      [40.00, 30.00],
      [40.05, 30.05],
      [52.00, 0.00],
      [52.05, 0.05],
    ]);
    const curve = buildPacingCurve(points, cumulativeDistanceKm);
    expect(distanceAtProgress(curve, 0)).toBeCloseTo(0, 6);
    expect(distanceAtProgress(curve, 1)).toBeCloseTo(cumulativeDistanceKm.at(-1)!, 6);
    let previous = -1;
    for (let step = 0; step <= 100; step += 1) {
      const distance = distanceAtProgress(curve, step / 100);
      expect(distance).toBeGreaterThanOrEqual(previous);
      previous = distance;
    }
  });

  it('handles a journey with no movement', () => {
    const { points, cumulativeDistanceKm } = journey([[40, 30], [40, 30]]);
    const curve = buildPacingCurve(points, cumulativeDistanceKm);
    expect(distanceAtProgress(curve, 0.5)).toBe(0);
  });
});

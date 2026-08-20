import { describe, expect, it } from 'vitest';
import { activeDayCount, DURATION_OPTIONS, suggestedDurationSeconds } from './duration';
import type { GeoPoint } from './types';

/** A journey of `days` days, each hopping `kmPerDay` kilometres eastward. */
function journey(days: number, kmPerDay: number): GeoPoint[] {
  const points: GeoPoint[] = [];
  const degreesPerKm = 1 / 111;
  for (let day = 0; day < days; day += 1) {
    const base = new Date(Date.UTC(2025, 0, 1 + day, 9));
    points.push({ instant: base, latitude: 40, longitude: 30 });
    points.push({
      instant: new Date(base.getTime() + 3_600_000),
      latitude: 40,
      longitude: 30 + kmPerDay * degreesPerKm / Math.cos((40 * Math.PI) / 180),
    });
  }
  return points;
}

describe('suggestedDurationSeconds', () => {
  it('always returns an offered option', () => {
    for (const days of [1, 5, 30, 120, 400, 900, 3000]) {
      expect(DURATION_OPTIONS).toContain(suggestedDurationSeconds(journey(days, 20)));
    }
  });

  it('grows with the amount there is to watch', () => {
    const short = suggestedDurationSeconds(journey(3, 10));
    const medium = suggestedDurationSeconds(journey(70, 30));
    const long = suggestedDurationSeconds(journey(700, 80));
    expect(short).toBeLessThan(medium);
    expect(medium).toBeLessThan(long);
  });

  it('gives a single long flight more than the shortest runtime', () => {
    const flight: GeoPoint[] = [
      { instant: new Date('2025-04-08T06:00:00Z'), latitude: 40, longitude: 30 },
      { instant: new Date('2025-04-08T10:00:00Z'), latitude: 52, longitude: 0 },
    ];
    expect(suggestedDurationSeconds(flight)).toBeGreaterThan(10);
  });

  it('falls back to the shortest runtime when there is nothing to show', () => {
    expect(suggestedDurationSeconds([])).toBe(10);
    const stationary = journey(4, 0);
    expect(suggestedDurationSeconds(stationary)).toBe(10);
  });
});

describe('activeDayCount', () => {
  it('counts calendar days that carry a fix, not the span between them', () => {
    const sparse: GeoPoint[] = [
      { instant: new Date('2025-01-01T09:00:00Z'), latitude: 40, longitude: 30 },
      { instant: new Date('2025-01-01T18:00:00Z'), latitude: 40, longitude: 30 },
      { instant: new Date('2025-12-31T09:00:00Z'), latitude: 40, longitude: 30 },
    ];
    expect(activeDayCount(sparse)).toBe(2);
  });
});

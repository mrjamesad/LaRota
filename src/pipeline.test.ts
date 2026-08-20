import { describe, expect, it } from 'vitest';
import { cleanTimelinePoints, dailyCrossingKey } from './cleanup';
import { cumulativeDistances, haversineKm } from './geo';
import { buildPacingCurve } from './pacing';
import type { GeoPoint } from './types';

const HOME: [number, number] = [40.0, 30.0];
const WORK: [number, number] = [40.05, 30.06];
const NEXT_CITY: [number, number] = [41.5, 31.5];
const ABROAD: [number, number] = [52.0, 0.0];

/** Deterministic jitter, so the fixture is identical on every run. */
function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * 0.0004;
}

function at(place: [number, number], day: number, hour: number, seed = 0): GeoPoint {
  return {
    instant: new Date(2025, 0, day, hour, 0, 0),
    latitude: place[0] + (seed ? noise(seed) : 0),
    longitude: place[1] + (seed ? noise(seed + 500) : 0),
  };
}

/**
 * A synthetic year: a lot of local movement, a couple of intercity trips, and
 * three long flights — one of which the export duplicates into a same-day round
 * trip, the artefact the cleanup pass exists to remove.
 */
function syntheticJourney(): GeoPoint[] {
  const points: GeoPoint[] = [];
  let seed = 1;

  for (let day = 1; day <= 30; day += 1) {
    // Sitting at home: the same place recorded over and over, metres apart.
    for (let sample = 0; sample < 6; sample += 1) points.push(at(HOME, day, 6 + sample, seed++));
    // The daily commute, out and back along the same street.
    points.push(at(WORK, day, 13, seed++));
    points.push(at(HOME, day, 19, seed++));
  }

  points.push(at(NEXT_CITY, 31, 10));
  points.push(at(HOME, 32, 18));

  points.push(at(ABROAD, 40, 9));
  points.push(at(HOME, 47, 21));

  // The artefact: three crossings of one corridor inside a single day.
  points.push(at(ABROAD, 60, 8));
  points.push(at(HOME, 60, 12));
  points.push(at(ABROAD, 60, 16));

  return points;
}

function longHaulShareOfDistance(points: GeoPoint[]): number {
  const total = cumulativeDistances(points).at(-1) ?? 0;
  let longHaul = 0;
  for (let index = 1; index < points.length; index += 1) {
    const km = haversineKm(points[index - 1], points[index]);
    if (km > 400) longHaul += km;
  }
  return total === 0 ? 0 : longHaul / total;
}

function repeatedCrossings(points: GeoPoint[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (let index = 1; index < points.length; index += 1) {
    if (haversineKm(points[index - 1], points[index]) <= 400) continue;
    const key = dailyCrossingKey(points[index - 1], points[index]);
    if (seen.has(key)) repeated.push(key);
    seen.add(key);
  }
  return repeated;
}

describe('the whole pipeline on a synthetic journey', () => {
  const raw = syntheticJourney();

  it('starts out with the defects the pipeline exists to fix', () => {
    // Flights are a rounding error in trip count but dominate the distance,
    // which under linear pacing is what decides screen time.
    expect(longHaulShareOfDistance(raw)).toBeGreaterThan(0.8);
    expect(repeatedCrossings(raw).length).toBeGreaterThan(0);
  });

  it('leaves no corridor crossed twice in one day', () => {
    expect(repeatedCrossings(cleanTimelinePoints(raw))).toEqual([]);
  });

  it('collapses fixes that record the same place repeatedly', () => {
    expect(cleanTimelinePoints(raw).length).toBeLessThan(raw.length);
  });

  it('spends the runtime on local movement rather than on flight lines', () => {
    const cleaned = cleanTimelinePoints(raw);
    const curve = buildPacingCurve(cleaned, cumulativeDistances(cleaned));
    expect(curve.shares.longHaul).toBeLessThan(0.15);
    expect(curve.shares.local).toBeGreaterThan(0.5);
  });
});

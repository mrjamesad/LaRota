import { cumulativeDistances } from './geo';
import type { GeoPoint } from './types';

export const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 75, 90, 120];

/**
 * Two readings of how much there is to watch, each an upper bound mapped to a
 * runtime. Distance alone undersells a year of short walks; active days alone
 * undersells a single long flight. The suggestion takes whichever asks for more.
 */
const BY_DISTANCE_KM: Array<[number, number]> = [
  [200, 10],
  [700, 15],
  [2_500, 20],
  [9_000, 30],
  [22_000, 45],
  [45_000, 60],
  [90_000, 75],
  [180_000, 90],
];

const BY_ACTIVE_DAYS: Array<[number, number]> = [
  [2, 10],
  [8, 15],
  [35, 20],
  [100, 30],
  [260, 45],
  [520, 60],
  [1_000, 75],
  [1_800, 90],
];

function lookup(table: Array<[number, number]>, value: number): number {
  for (const [limit, seconds] of table) {
    if (value < limit) return seconds;
  }
  return DURATION_OPTIONS[DURATION_OPTIONS.length - 1];
}

export function activeDayCount(points: GeoPoint[]): number {
  const days = new Set<string>();
  for (const point of points) {
    days.add(point.recordedDate ?? point.instant.toISOString().slice(0, 10));
  }
  return days.size;
}

export function suggestedDurationSeconds(points: GeoPoint[]): number {
  if (points.length < 2) return DURATION_OPTIONS[0];
  const kilometres = cumulativeDistances(points).at(-1) ?? 0;
  if (kilometres <= 0) return DURATION_OPTIONS[0];
  return Math.max(
    lookup(BY_DISTANCE_KM, kilometres),
    lookup(BY_ACTIVE_DAYS, activeDayCount(points)),
  );
}

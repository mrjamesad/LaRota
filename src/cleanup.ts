import { haversineKm } from './geo';
import type { GeoPoint } from './types';

/**
 * Consecutive fixes closer than this are the same place recorded twice. Chosen to
 * clear the parser's activity/visit overlap without rounding off street corners:
 * the export's entire sub-50 m bucket is noise, and 60 m stays well below the
 * shortest real turn.
 */
export const DUPLICATE_RADIUS_KM = 0.06;

export function collapseNearDuplicates(
  points: GeoPoint[],
  radiusKm = DUPLICATE_RADIUS_KM,
): GeoPoint[] {
  if (points.length === 0) return [];
  const kept: GeoPoint[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = kept[kept.length - 1];
    if (haversineKm(previous, points[index]) >= radiusKm) kept.push(points[index]);
  }
  return kept;
}

/** A single hop longer than this is a country-level transfer, not a drive. */
export const LONG_HAUL_KM = 400;

function dayKey(instant: Date): string {
  return `${instant.getFullYear()}-${instant.getMonth() + 1}-${instant.getDate()}`;
}

/**
 * Endpoints of a duplicated crossing land within a few kilometres of each other,
 * so rounding to whole degrees is enough to recognise the same corridor while
 * keeping genuinely different city pairs apart.
 */
export function dailyCrossingKey(from: GeoPoint, to: GeoPoint): string {
  const ends = [
    `${Math.round(from.latitude)},${Math.round(from.longitude)}`,
    `${Math.round(to.latitude)},${Math.round(to.longitude)}`,
  ].sort();
  return `${dayKey(to.instant)}|${ends.join('|')}`;
}

export function dropRepeatedDailyCrossings(
  points: GeoPoint[],
  longHaulKm = LONG_HAUL_KM,
): GeoPoint[] {
  if (points.length === 0) return [];
  const kept: GeoPoint[] = [points[0]];
  const seen = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const candidate = points[index];
    const previous = kept[kept.length - 1];
    const km = haversineKm(previous, candidate);
    // Skipping a crossing leaves the traveller standing where the previous kept
    // point already is, so the fix that comes back is a zero-length repeat.
    if (km < DUPLICATE_RADIUS_KM) continue;
    if (km > longHaulKm) {
      const key = dailyCrossingKey(previous, candidate);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    kept.push(candidate);
  }
  return kept;
}

export function cleanTimelinePoints(points: GeoPoint[]): GeoPoint[] {
  return dropRepeatedDailyCrossings(collapseNearDuplicates(points));
}

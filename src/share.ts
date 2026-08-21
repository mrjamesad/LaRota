import { DUPLICATE_RADIUS_KM } from './cleanup';
import { haversineKm } from './geo';
import type { GeoPoint } from './types';

/**
 * The Timeline records a stay as a single point at its start, so silence is not
 * absence. Six hours is long enough to sit through a working day or an evening
 * at home without being mistaken for a gap, and short enough that a genuinely
 * unrecorded night still lets a share speak for where its owner was.
 */
export const COVERAGE_GAP_HOURS = 6;

function flagged(point: GeoPoint): GeoPoint {
  return point.share ? point : { ...point, share: 'instagram' };
}

/**
 * Merges social moments into a Timeline without letting them redraw it.
 *
 * The Timeline owns the route: where it already covers the moment, the share only
 * marks the point that is there. A share becomes a vertex of its own where the
 * Timeline lost the trail — and even then not if it lands where the route already
 * passes, which would draw a spur of no length.
 */
export function attachSharePoints(
  timeline: GeoPoint[],
  shares: GeoPoint[],
  coverageGapHours = COVERAGE_GAP_HOURS,
): GeoPoint[] {
  if (shares.length === 0) return timeline;

  const merged = [...timeline];
  const coverageGapMs = coverageGapHours * 3_600_000;
  const ordered = [...shares].sort((a, b) => a.instant.getTime() - b.instant.getTime());

  for (const moment of ordered) {
    const timestamp = moment.instant.getTime();
    let after = merged.findIndex((point) => point.instant.getTime() > timestamp);
    if (after === -1) after = merged.length;
    const beforeIndex = after - 1;
    const before = merged[beforeIndex];
    const following = merged[after];

    const covered = before !== undefined
      && following !== undefined
      && following.instant.getTime() - before.instant.getTime() <= coverageGapMs;

    if (covered) {
      const reachedBefore = timestamp - before.instant.getTime();
      const reachesFollowing = following.instant.getTime() - timestamp;
      const index = reachedBefore <= reachesFollowing ? beforeIndex : after;
      merged[index] = flagged(merged[index]);
      continue;
    }

    const neighbour = [before, following].find((point) => (
      point !== undefined && haversineKm(point, moment) < DUPLICATE_RADIUS_KM
    ));
    if (neighbour) {
      const index = merged.indexOf(neighbour);
      merged[index] = flagged(merged[index]);
      continue;
    }

    merged.splice(after, 0, moment);
  }
  return merged;
}

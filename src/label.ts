import { inferTravelMode, travelModeLabel } from './travel';
import type { GeoPoint } from './types';

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * The subtitle under the title card: the month the head marker has reached, and
 * the distance covered so far. Both advance with the animation, matching the
 * Android build; the web build showed one static range label for the whole video.
 */
export function journeySubtitle(
  points: GeoPoint[],
  index: number,
  distanceKm: number,
  outgoingKm = 0,
): string {
  const kilometres = `${Math.round(distanceKm).toLocaleString('en-US')} km`;
  const point = points[Math.max(0, Math.min(points.length - 1, index))];
  if (!point) return kilometres;
  const line = `${MONTH_FORMAT.format(point.instant)} · ${kilometres}`;
  const mode = travelModeLabel(point.mode ?? inferTravelMode(outgoingKm));
  return mode ? `${line} · ${mode}` : line;
}

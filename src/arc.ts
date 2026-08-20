import type { WorldPoint } from './types';

/**
 * A hop longer than this in world units is drawn as a bowed arc rather than a
 * straight chord — roughly 800 km at mid latitude, which separates flights and
 * long-distance rail from ordinary intercity travel.
 */
export const ARC_MIN_WORLD_LENGTH = 0.02;

/** Height of the bow as a fraction of the chord. */
export const ARC_BOW = 0.14;

export function isLongHop(from: WorldPoint, to: WorldPoint): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= ARC_MIN_WORLD_LENGTH;
}

function controlPoint(from: WorldPoint, to: WorldPoint): WorldPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  let normalX = -dy / length;
  let normalY = dx / length;
  // World y grows southward, so a northern-hemisphere route bows toward -y, the
  // way a real great-circle track leans toward the pole.
  const wanted = (from.y + to.y) / 2 < 0.5 ? -1 : 1;
  if (normalY === 0 ? normalX < 0 : Math.sign(normalY) !== wanted) {
    normalX = -normalX;
    normalY = -normalY;
  }
  const bow = length * ARC_BOW;
  return {
    x: (from.x + to.x) / 2 + normalX * bow,
    y: (from.y + to.y) / 2 + normalY * bow,
  };
}

/**
 * Where the traveller is along a hop. Straight hops interpolate linearly; long
 * ones follow the same quadratic the trail is drawn with, so the marker never
 * drifts off its own line.
 */
export function bowedPoint(from: WorldPoint, to: WorldPoint, fraction: number): WorldPoint {
  const t = Math.max(0, Math.min(1, fraction));
  if (!isLongHop(from, to)) {
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }
  const control = controlPoint(from, to);
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

/** The hop as a polyline, so the drawn path and the marker share one geometry. */
export function bowedPolyline(from: WorldPoint, to: WorldPoint, steps = 24): WorldPoint[] {
  if (!isLongHop(from, to)) return [to];
  const path: WorldPoint[] = [];
  for (let step = 1; step <= steps; step += 1) {
    path.push(bowedPoint(from, to, step / steps));
  }
  return path;
}

/** The finished part of a hop, from its start up to `fraction`. */
export function bowedPartial(
  from: WorldPoint,
  to: WorldPoint,
  fraction: number,
  steps = 24,
): WorldPoint[] {
  const t = Math.max(0, Math.min(1, fraction));
  if (!isLongHop(from, to)) return [bowedPoint(from, to, t)];
  const path: WorldPoint[] = [];
  const used = Math.max(1, Math.round(steps * t));
  for (let step = 1; step <= used; step += 1) {
    path.push(bowedPoint(from, to, (t * step) / used));
  }
  return path;
}

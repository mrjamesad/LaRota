import type { WorldPoint } from './types';

/**
 * Ramer–Douglas–Peucker in world coordinates, returning the indices it keeps so a
 * caller can intersect them with the part of the route travelled so far. Iterative
 * rather than recursive: an eight-year route overflows the call stack.
 */
export function simplifyIndices(points: WorldPoint[], tolerance: number): number[] {
  if (points.length <= 2) return points.map((_, index) => index);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const toleranceSquared = tolerance * tolerance;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;
    const ax = points[first].x;
    const ay = points[first].y;
    const dx = points[last].x - ax;
    const dy = points[last].y - ay;
    const lengthSquared = dx * dx + dy * dy;
    let farthest = -1;
    let farthestDistance = 0;
    for (let index = first + 1; index < last; index += 1) {
      const px = points[index].x - ax;
      const py = points[index].y - ay;
      const along = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
      const offsetX = px - along * dx;
      const offsetY = py - along * dy;
      const distance = offsetX * offsetX + offsetY * offsetY;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = index;
      }
    }
    if (farthest >= 0 && farthestDistance > toleranceSquared) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  const indices: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (keep[index]) indices.push(index);
  }
  return indices;
}

export const SIMPLIFICATION_LEVELS = 14;
export const FINEST_TOLERANCE = 2 ** -22;

export interface SimplificationLadder {
  tolerances: number[];
  indices: number[][];
}

export function buildSimplificationLadder(points: WorldPoint[]): SimplificationLadder {
  const tolerances: number[] = [];
  const indices: number[][] = [];
  for (let level = 0; level < SIMPLIFICATION_LEVELS; level += 1) {
    const tolerance = FINEST_TOLERANCE * 2 ** level;
    tolerances.push(tolerance);
    indices.push(simplifyIndices(points, tolerance));
  }
  return { tolerances, indices };
}

export function indicesForTolerance(ladder: SimplificationLadder, tolerance: number): number[] {
  let level = 0;
  while (level < ladder.tolerances.length - 1 && ladder.tolerances[level] < tolerance) {
    level += 1;
  }
  return ladder.indices[level];
}

import type { GeoPoint } from './types';

export type SegmentClass = 'longHaul' | 'intercity' | 'local';

export interface PacingOptions {
  longHaulKm: number;
  intercityKm: number;
  intercityExponent: number;
  repeatWeight: number;
  shares: Record<SegmentClass, number>;
}

/**
 * Time is budgeted per class rather than per kilometre. A flight gets a fixed
 * slot no matter how far it goes, a repeat of a corridor already shown gets less,
 * and everything left over goes to local movement — which is what the video is
 * actually about.
 */
export const DEFAULT_PACING: PacingOptions = {
  longHaulKm: 400,
  intercityKm: 60,
  intercityExponent: 0.6,
  repeatWeight: 0.4,
  shares: { longHaul: 0.10, intercity: 0.14, local: 0.76 },
};

export interface PacingCurve {
  progressBreakpoints: number[];
  distanceBreakpoints: number[];
  shares: Record<SegmentClass, number>;
}

function corridorKey(from: GeoPoint, to: GeoPoint): string {
  return [
    `${Math.round(from.latitude)},${Math.round(from.longitude)}`,
    `${Math.round(to.latitude)},${Math.round(to.longitude)}`,
  ].sort().join('|');
}

export function buildPacingCurve(
  points: GeoPoint[],
  cumulativeDistanceKm: number[],
  options: PacingOptions = DEFAULT_PACING,
): PacingCurve {
  const total = cumulativeDistanceKm.at(-1) ?? 0;
  const emptyShares: Record<SegmentClass, number> = { longHaul: 0, intercity: 0, local: 0 };
  if (points.length < 2 || total <= 0) {
    return {
      progressBreakpoints: [0, 1],
      distanceBreakpoints: [0, total],
      shares: emptyShares,
    };
  }

  const classes: SegmentClass[] = [];
  const weights: number[] = [];
  const seenCorridors = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const km = cumulativeDistanceKm[index] - cumulativeDistanceKm[index - 1];
    if (km > options.longHaulKm) {
      const key = corridorKey(points[index - 1], points[index]);
      const repeated = seenCorridors.has(key);
      seenCorridors.add(key);
      classes.push('longHaul');
      weights.push(repeated ? options.repeatWeight : 1);
    } else if (km > options.intercityKm) {
      classes.push('intercity');
      weights.push(km ** options.intercityExponent);
    } else {
      classes.push('local');
      weights.push(km);
    }
  }

  const classTotals: Record<SegmentClass, number> = { longHaul: 0, intercity: 0, local: 0 };
  for (let index = 0; index < classes.length; index += 1) {
    classTotals[classes[index]] += weights[index];
  }

  const names: SegmentClass[] = ['longHaul', 'intercity', 'local'];
  const present = names.filter((name) => classTotals[name] > 0);
  const availableShare = present.reduce((sum, name) => sum + options.shares[name], 0);
  const scale: Record<SegmentClass, number> = { longHaul: 0, intercity: 0, local: 0 };
  for (const name of present) {
    scale[name] = options.shares[name] / availableShare / classTotals[name];
  }

  const progressBreakpoints = [0];
  const distanceBreakpoints = [0];
  let accumulated = 0;
  for (let index = 0; index < classes.length; index += 1) {
    accumulated += weights[index] * scale[classes[index]];
    progressBreakpoints.push(accumulated);
    distanceBreakpoints.push(cumulativeDistanceKm[index + 1]);
  }

  const span = accumulated > 0 ? accumulated : 1;
  for (let index = 0; index < progressBreakpoints.length; index += 1) {
    progressBreakpoints[index] /= span;
  }

  return {
    progressBreakpoints,
    distanceBreakpoints,
    shares: {
      longHaul: (classTotals.longHaul * scale.longHaul) / span,
      intercity: (classTotals.intercity * scale.intercity) / span,
      local: (classTotals.local * scale.local) / span,
    },
  };
}

export function distanceAtProgress(curve: PacingCurve, progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  const xs = curve.progressBreakpoints;
  const ys = curve.distanceBreakpoints;
  if (xs.length < 2) return ys.at(-1) ?? 0;
  let low = 1;
  let high = xs.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (xs[middle] < clamped) low = middle + 1;
    else high = middle;
  }
  const from = low - 1;
  const width = xs[low] - xs[from];
  const fraction = width <= 0 ? 0 : (clamped - xs[from]) / width;
  return ys[from] + (ys[low] - ys[from]) * fraction;
}

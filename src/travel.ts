import { DEFAULT_PACING } from './pacing';

/** Above this a hop is transit rather than moving about a place. */
export const DEFAULT_PACING_INTERCITY_KM = DEFAULT_PACING.intercityKm;

/** The transport modes the marker and subtitle can show. */
export type TravelMode =
  | 'walking'
  | 'cycling'
  | 'driving'
  | 'bus'
  | 'rail'
  | 'flight'
  | 'ferry'
  | 'unknown';

/**
 * Google writes the activity type as free-ish prose ("in passenger vehicle",
 * "in subway"). Everything on rails collapses to one mode, because the marker
 * cannot usefully distinguish a tram from a metro at this size.
 */
const MODE_BY_KEYWORD: Array<[RegExp, TravelMode]> = [
  [/fly|plane|air/, 'flight'],
  [/ferry|boat|sail/, 'ferry'],
  [/train|subway|metro|tram|rail/, 'rail'],
  [/bus|coach/, 'bus'],
  // Before the bicycle rule: "motorcycling" contains "cycl".
  [/motorcycl|moped|scooter/, 'driving'],
  [/cycl|bike|bicycle/, 'cycling'],
  [/walk|run|hik|foot/, 'walking'],
  [/vehicle|driv|car|taxi/, 'driving'],
];

/**
 * Where no activity was recorded, the length of the hop is the only witness left.
 * The boundaries are the pacing curve's own classes, so the icon agrees with how
 * the video already budgets that leg: a long-haul crossing flies, an intercity
 * run drives, and local movement says nothing — under 60 km the distance cannot
 * tell a walk from a bus, and a wrong icon is worse than none.
 */
export function inferTravelMode(km: number): TravelMode | undefined {
  if (km > DEFAULT_PACING.longHaulKm) return 'flight';
  if (km > DEFAULT_PACING.intercityKm) return 'driving';
  return undefined;
}

export function normaliseTravelMode(raw: unknown): TravelMode {
  if (typeof raw !== 'string') return 'unknown';
  const text = raw.toLowerCase();
  for (const [pattern, mode] of MODE_BY_KEYWORD) {
    if (pattern.test(text)) return mode;
  }
  return 'unknown';
}

const MODE_LABEL: Record<TravelMode, string> = {
  walking: 'walking',
  cycling: 'cycling',
  driving: 'driving',
  bus: 'by bus',
  rail: 'by train',
  flight: 'flying',
  ferry: 'by ferry',
  unknown: '',
};

export function travelModeLabel(mode: TravelMode | undefined): string {
  return mode ? MODE_LABEL[mode] : '';
}

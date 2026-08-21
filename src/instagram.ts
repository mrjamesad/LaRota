import type { GeoPoint } from './types';

export type InstagramParseReason = 'unsupported-format' | 'no-usable-locations';

export class InstagramParseError extends Error {
  constructor(
    public readonly reason: InstagramParseReason,
    message: string,
  ) {
    super(message);
    this.name = 'InstagramParseError';
  }
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The export splits one `exif_data` array across several objects: a bare
 * latitude/longitude pair in one, the camera settings and capture date in
 * another. Both readers below scan the whole array rather than the first entry.
 */
function coordinateIn(entries: unknown[]): [number, number] | null {
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    if (entry.latitude === undefined || entry.longitude === undefined) continue;
    const latitude = Number(entry.latitude);
    const longitude = Number(entry.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    // Location services off records the null island rather than omitting the field.
    if (latitude === 0 && longitude === 0) continue;
    if (latitude < -85.05112878 || latitude > 85.05112878 || longitude < -180 || longitude > 180) {
      continue;
    }
    return [latitude, longitude];
  }
  return null;
}

function captureDateIn(entries: unknown[]): string | null {
  for (const entry of entries) {
    if (isObject(entry) && typeof entry.date_time_original === 'string') {
      return entry.date_time_original;
    }
  }
  return null;
}

interface ExifInstant {
  instant: Date;
  recordedDate: string;
}

/** EXIF writes `2026:07:09 21:41:42` and carries no zone, so read it as the wall clock. */
function parseExifInstant(raw: string): ExifInstant | null {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const recordedDate = `${year}-${month}-${day}`;
  const instant = new Date(`${recordedDate}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(instant.getTime()) ? null : { instant, recordedDate };
}

/**
 * The capture date beats the upload timestamp: a story shared a week after the
 * photograph was taken belongs to the day it was taken, at the place it was taken.
 */
function pointFrom(entries: unknown[], uploadTimestamp: number | undefined): GeoPoint | null {
  const coordinate = coordinateIn(entries);
  if (!coordinate) return null;
  const captured = captureDateIn(entries);
  const exif = captured ? parseExifInstant(captured) : null;
  if (exif) {
    return {
      instant: exif.instant,
      latitude: coordinate[0],
      longitude: coordinate[1],
      recordedDate: exif.recordedDate,
      timeZoneMissing: true,
      share: 'instagram',
    };
  }
  if (uploadTimestamp === undefined) return null;
  return {
    instant: new Date(uploadTimestamp * 1000),
    latitude: coordinate[0],
    longitude: coordinate[1],
    timeZoneMissing: false,
    share: 'instagram',
  };
}

/**
 * Stories, posts, reels and past insights nest the media at different depths, so
 * walk for `exif_data` instead of hard-coding four paths. `creation_timestamp`
 * is inherited downward: in the insights shape it sits above the metadata block.
 */
function collect(node: unknown, inherited: number | undefined, into: GeoPoint[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, inherited, into);
    return;
  }
  if (!isObject(node)) return;
  const timestamp = typeof node.creation_timestamp === 'number'
    && Number.isFinite(node.creation_timestamp)
    ? node.creation_timestamp
    : inherited;
  if (Array.isArray(node.exif_data)) {
    const point = pointFrom(node.exif_data, timestamp);
    if (point) into.push(point);
    return;
  }
  for (const value of Object.values(node)) collect(value, timestamp, into);
}

/**
 * The denominator behind the status line. A shared item is anything the export
 * stamps with an upload time and either a file or a metadata block — which counts
 * the ones stripped of EXIF, the very items the user is owed an explanation for.
 */
export function countSharedMedia(node: unknown): number {
  if (Array.isArray(node)) {
    return node.reduce<number>((total, child) => total + countSharedMedia(child), 0);
  }
  if (!isObject(node)) return 0;
  if (node.creation_timestamp !== undefined && ('uri' in node || 'media_metadata' in node)) {
    return 1;
  }
  return Object.values(node).reduce<number>((total, value) => total + countSharedMedia(value), 0);
}

function containsMediaMetadata(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsMediaMetadata);
  if (!isObject(node)) return false;
  if ('media_metadata' in node) return true;
  return Object.values(node).some(containsMediaMetadata);
}

function isRecognisedExport(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.some((entry) => isObject(entry) && Array.isArray(entry.media));
  }
  if (!isObject(data)) return false;
  if (Array.isArray(data.ig_stories) || Array.isArray(data.organic_insights_posts)) return true;
  return containsMediaMetadata(data);
}

export function parseInstagramJson(data: unknown): GeoPoint[] {
  if (!isRecognisedExport(data)) {
    throw new InstagramParseError(
      'unsupported-format',
      'Bu bir Instagram dışa aktarım dosyası değil.',
    );
  }
  const points: GeoPoint[] = [];
  collect(data, undefined, points);
  if (points.length === 0) {
    throw new InstagramParseError(
      'no-usable-locations',
      'Bu dosyadaki paylaşımların hiçbirinde konum bilgisi yok.',
    );
  }
  return points.sort((a, b) => a.instant.getTime() - b.instant.getTime());
}

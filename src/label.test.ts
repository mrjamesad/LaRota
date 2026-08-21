import { describe, expect, it } from 'vitest';
import { journeySubtitle } from './label';
import type { GeoPoint } from './types';

const points: GeoPoint[] = [
  { instant: new Date('2025-07-04T10:00:00Z'), latitude: 40, longitude: 30 },
  { instant: new Date('2025-08-04T10:00:00Z'), latitude: 52, longitude: 0 },
];

describe('journeySubtitle', () => {
  it('names the month at the current position and the distance so far', () => {
    expect(journeySubtitle(points, 0, 9047)).toBe('July 2025 · 9,047 km');
  });

  it('advances to the later month', () => {
    expect(journeySubtitle(points, 1, 12000)).toBe('August 2025 · 12,000 km');
  });

  it('rounds fractional kilometres', () => {
    expect(journeySubtitle(points, 0, 1234.7)).toBe('July 2025 · 1,235 km');
  });

  it('falls back to the distance alone when there is no point', () => {
    expect(journeySubtitle([], 0, 42)).toBe('42 km');
  });

  it('clamps an index past the end of the journey', () => {
    expect(journeySubtitle(points, 99, 100)).toBe('August 2025 · 100 km');
  });

  it('names the transport mode when the point carries one', () => {
    const flying: GeoPoint[] = [
      { instant: new Date('2025-07-04T10:00:00Z'), latitude: 40, longitude: 30, mode: 'flight' },
    ];
    expect(journeySubtitle(flying, 0, 2544)).toBe('July 2025 · 2,544 km · flying');
  });

  it('leaves the subtitle alone for an unknown mode', () => {
    const idle: GeoPoint[] = [
      { instant: new Date('2025-07-04T10:00:00Z'), latitude: 40, longitude: 30, mode: 'unknown' },
    ];
    expect(journeySubtitle(idle, 0, 10)).toBe('July 2025 · 10 km');
  });
});

describe('journeySubtitle with an inferred mode', () => {
  it('names the crossing when the point carries no mode of its own', () => {
    const points = [
      { instant: new Date('2026-02-03T16:00:00Z'), latitude: 51.5, longitude: -0.12 },
      { instant: new Date('2026-02-05T16:00:00Z'), latitude: 52.5, longitude: 13.4 },
    ];

    expect(journeySubtitle(points, 0, 930, 930)).toContain('flying');
  });
});

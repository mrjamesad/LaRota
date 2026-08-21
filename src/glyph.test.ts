import { describe, expect, it } from 'vitest';
import { glyphFor } from './glyph';
import type { GeoPoint } from './types';

function point(extra: Partial<GeoPoint>): GeoPoint {
  return { instant: new Date('2026-05-10T10:00:00Z'), latitude: 51.5, longitude: -0.12, ...extra };
}

describe('glyphFor', () => {
  it('shows the transport mode the marker is travelling by', () => {
    expect(glyphFor(point({ mode: 'flight' }))).toBe('flight');
  });

  it('shows the share mark where a moment came from Instagram', () => {
    expect(glyphFor(point({ share: 'instagram' }))).toBe('instagram');
  });

  it('lets the share mark win over the mode carried into it', () => {
    // Modes are carried forward across visits, so a shared moment nearly always
    // has one. The share is the more particular thing to say about that instant.
    expect(glyphFor(point({ mode: 'driving', share: 'instagram' }))).toBe('instagram');
  });

  it('shows nothing for a point with neither', () => {
    expect(glyphFor(point({}))).toBeUndefined();
  });

  it('shows nothing when there is no point at all', () => {
    expect(glyphFor(undefined)).toBeUndefined();
  });
});

describe('glyphFor across a leg', () => {
  it('flies the marker over a country-level hop out of a share', () => {
    // London to Berlin between two Instagram posts: the crossing should read as
    // a flight, not as an Instagram mark drifting across a continent.
    expect(glyphFor(point({ share: 'instagram' }), 930)).toBe('flight');
  });

  it('drives the marker between cities', () => {
    expect(glyphFor(point({ share: 'instagram' }), 280)).toBe('driving');
  });

  it('keeps the share mark where the movement is local', () => {
    expect(glyphFor(point({ share: 'instagram' }), 0.7)).toBe('instagram');
  });

  it('lets a real transport mode outrank the share mark in transit', () => {
    expect(glyphFor(point({ mode: 'rail', share: 'instagram' }), 280)).toBe('rail');
  });

  it('still shows the transport mode of an ordinary timeline point', () => {
    expect(glyphFor(point({ mode: 'walking' }), 0.4)).toBe('walking');
  });
});

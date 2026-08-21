import { describe, expect, it } from 'vitest';
import { attachSharePoints } from './share';
import type { GeoPoint } from './types';

function at(time: string, latitude = 51.5, longitude = -0.12): GeoPoint {
  return { instant: new Date(time), latitude, longitude };
}

function share(time: string, latitude = 41.0, longitude = 29.0): GeoPoint {
  return { instant: new Date(time), latitude, longitude, share: 'instagram' };
}

describe('attachSharePoints', () => {
  it('returns the timeline untouched when there are no shares', () => {
    const timeline = [at('2026-05-10T10:00:00Z'), at('2026-05-10T12:00:00Z')];

    expect(attachSharePoints(timeline, [])).toEqual(timeline);
  });

  it('flags the nearer point when the timeline already covers the moment', () => {
    const timeline = [at('2026-05-10T10:00:00Z'), at('2026-05-10T12:00:00Z')];

    const merged = attachSharePoints(timeline, [share('2026-05-10T11:30:00Z')]);

    // Two hours apart is coverage, so geometry stays the Timeline's: no new vertex,
    // and the flag lands on the point nearest in time.
    expect(merged).toHaveLength(2);
    expect(merged[0].share).toBeUndefined();
    expect(merged[1].share).toBe('instagram');
    expect(merged[1].latitude).toBe(51.5);
  });

  it('inserts the share when the timeline has a gap longer than six hours', () => {
    const timeline = [at('2026-05-10T02:00:00Z'), at('2026-05-10T20:00:00Z')];

    const merged = attachSharePoints(timeline, [share('2026-05-10T11:00:00Z')]);

    expect(merged).toHaveLength(3);
    expect(merged[1].latitude).toBe(41);
    expect(merged[1].share).toBe('instagram');
  });

  it('inserts a share that falls before the first timeline point', () => {
    const timeline = [at('2026-05-10T10:00:00Z')];

    const merged = attachSharePoints(timeline, [share('2026-05-09T10:00:00Z')]);

    expect(merged).toHaveLength(2);
    expect(merged[0].share).toBe('instagram');
  });

  it('inserts a share that falls after the last timeline point', () => {
    const timeline = [at('2026-05-10T10:00:00Z')];

    const merged = attachSharePoints(timeline, [share('2026-05-11T10:00:00Z')]);

    expect(merged).toHaveLength(2);
    expect(merged[1].share).toBe('instagram');
  });

  it('flags instead of inserting when the share sits on top of a neighbour', () => {
    // A long gap, but the share is in the same place — inserting would draw a
    // zero-length spur, so the flag moves onto the point already there.
    const timeline = [at('2026-05-10T02:00:00Z'), at('2026-05-10T20:00:00Z')];

    const merged = attachSharePoints(timeline, [share('2026-05-10T11:00:00Z', 51.5, -0.12)]);

    expect(merged).toHaveLength(2);
    expect(merged.filter((point) => point.share === 'instagram')).toHaveLength(1);
  });

  it('keeps the merged points in chronological order', () => {
    const timeline = [at('2026-05-10T02:00:00Z'), at('2026-05-12T02:00:00Z')];

    const merged = attachSharePoints(timeline, [
      share('2026-05-11T12:00:00Z'),
      share('2026-05-10T12:00:00Z'),
    ]);

    const times = merged.map((point) => point.instant.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('does not mutate the timeline it was given', () => {
    const timeline = [at('2026-05-10T10:00:00Z'), at('2026-05-10T12:00:00Z')];

    attachSharePoints(timeline, [share('2026-05-10T11:30:00Z')]);

    expect(timeline.every((point) => point.share === undefined)).toBe(true);
  });

  it('returns the shares alone when there is no timeline', () => {
    const merged = attachSharePoints([], [share('2026-05-10T11:00:00Z')]);

    expect(merged).toHaveLength(1);
    expect(merged[0].share).toBe('instagram');
  });
});

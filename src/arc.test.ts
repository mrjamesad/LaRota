import { describe, expect, it } from 'vitest';
import { ARC_BOW, bowedPoint, bowedPolyline, isLongHop } from './arc';
import { project } from './geo';
import type { WorldPoint } from './types';

const istanbulish = project(41, 29);
const londonish = project(52, 0);
const nearby = project(41.1, 29.2);

describe('isLongHop', () => {
  it('separates a flight from a drive across town', () => {
    expect(isLongHop(istanbulish, londonish)).toBe(true);
    expect(isLongHop(istanbulish, nearby)).toBe(false);
  });
});

describe('bowedPoint', () => {
  it('interpolates a short hop in a straight line', () => {
    const middle = bowedPoint(istanbulish, nearby, 0.5);
    expect(middle.x).toBeCloseTo((istanbulish.x + nearby.x) / 2, 12);
    expect(middle.y).toBeCloseTo((istanbulish.y + nearby.y) / 2, 12);
  });

  it('keeps both ends of a long hop exactly where they were', () => {
    expect(bowedPoint(istanbulish, londonish, 0)).toEqual(istanbulish);
    const end = bowedPoint(istanbulish, londonish, 1);
    expect(end.x).toBeCloseTo(londonish.x, 12);
    expect(end.y).toBeCloseTo(londonish.y, 12);
  });

  it('bows a northern route toward the pole', () => {
    const middle = bowedPoint(istanbulish, londonish, 0.5);
    const chordY = (istanbulish.y + londonish.y) / 2;
    // Smaller world y is further north.
    expect(middle.y).toBeLessThan(chordY);
  });

  it('bows by about the configured fraction of the chord', () => {
    const middle = bowedPoint(istanbulish, londonish, 0.5);
    const chord = Math.hypot(londonish.x - istanbulish.x, londonish.y - istanbulish.y);
    const chordMid = {
      x: (istanbulish.x + londonish.x) / 2,
      y: (istanbulish.y + londonish.y) / 2,
    };
    const rise = Math.hypot(middle.x - chordMid.x, middle.y - chordMid.y);
    // A quadratic reaches half of its control offset at the midpoint.
    expect(rise).toBeCloseTo((chord * ARC_BOW) / 2, 6);
  });

  it('clamps a fraction outside the hop', () => {
    expect(bowedPoint(istanbulish, londonish, -1)).toEqual(istanbulish);
  });
});

describe('bowedPolyline', () => {
  it('leaves a short hop as a single step', () => {
    expect(bowedPolyline(istanbulish, nearby)).toEqual([nearby]);
  });

  it('walks a long hop through the same curve the marker follows', () => {
    const steps = 12;
    const path: WorldPoint[] = bowedPolyline(istanbulish, londonish, steps);
    expect(path).toHaveLength(steps);
    path.forEach((point, index) => {
      const expected = bowedPoint(istanbulish, londonish, (index + 1) / steps);
      expect(point.x).toBeCloseTo(expected.x, 12);
      expect(point.y).toBeCloseTo(expected.y, 12);
    });
  });
});

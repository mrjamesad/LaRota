import { describe, expect, it } from 'vitest';
import { collapseNearDuplicates, dropRepeatedDailyCrossings } from './cleanup';
import type { GeoPoint } from './types';

function point(latitude: number, longitude: number, minute = 0): GeoPoint {
  return { instant: new Date(minute * 60_000), latitude, longitude };
}

describe('collapseNearDuplicates', () => {
  it('keeps one fix when the same place is recorded three times', () => {
    const collapsed = collapseNearDuplicates([
      point(40.0000, 30.0000, 0),
      point(40.0001, 30.0002, 1),
      point(40.0000, 30.0000, 2),
    ]);
    expect(collapsed).toHaveLength(1);
  });

  it('keeps genuine movement', () => {
    const collapsed = collapseNearDuplicates([
      point(40.0000, 30.0000, 0),
      point(40.0600, 30.0700, 1),
    ]);
    expect(collapsed).toHaveLength(2);
  });

  it('returns an empty array for no input', () => {
    expect(collapseNearDuplicates([])).toEqual([]);
  });
});

describe('dropRepeatedDailyCrossings', () => {
  const east: [number, number] = [40.00, 30.00];
  const west: [number, number] = [52.00, 0.00];

  function at(place: [number, number], isoDate: string, hour: number): GeoPoint {
    return {
      instant: new Date(`${isoDate}T${String(hour).padStart(2, '0')}:00:00`),
      latitude: place[0],
      longitude: place[1],
    };
  }

  it('keeps one crossing when a day contains three', () => {
    const kept = dropRepeatedDailyCrossings([
      at(east, '2025-04-08', 6),
      at(west, '2025-04-08', 10),
      at(east, '2025-04-08', 14),
      at(west, '2025-04-08', 18),
    ]);
    expect(kept).toHaveLength(2);
    expect(kept[0].latitude).toBeCloseTo(40.00, 2);
    expect(kept[1].latitude).toBeCloseTo(52.00, 2);
  });

  it('moves a duplicated return onto the day it was recorded', () => {
    const kept = dropRepeatedDailyCrossings([
      at(east, '2019-11-25', 8),
      at(west, '2019-11-25', 12),
      at(east, '2019-11-25', 16),
      at(west, '2019-11-29', 8),
      at(east, '2019-11-29', 12),
    ]);
    // Out on the 25th, back on the 29th - two crossings, not four.
    expect(kept).toHaveLength(3);
    expect(kept[1].latitude).toBeCloseTo(52.00, 2);
    expect(kept[2].latitude).toBeCloseTo(40.00, 2);
  });

  it('leaves a single crossing untouched', () => {
    const kept = dropRepeatedDailyCrossings([
      at(east, '2025-04-08', 6),
      at(west, '2025-04-08', 10),
    ]);
    expect(kept).toHaveLength(2);
  });
});

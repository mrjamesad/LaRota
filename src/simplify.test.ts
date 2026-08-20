import { describe, expect, it } from 'vitest';
import { buildSimplificationLadder, indicesForTolerance, simplifyIndices } from './simplify';
import type { WorldPoint } from './types';

function path(coordinates: Array<[number, number]>): WorldPoint[] {
  return coordinates.map(([x, y]) => ({ x, y }));
}

describe('simplifyIndices', () => {
  it('drops points that sit on a straight line', () => {
    const indices = simplifyIndices(path([[0, 0], [0.5, 0], [1, 0]]), 0.01);
    expect(indices).toEqual([0, 2]);
  });

  it('keeps a corner that exceeds the tolerance', () => {
    const indices = simplifyIndices(path([[0, 0], [0.5, 0.5], [1, 0]]), 0.01);
    expect(indices).toEqual([0, 1, 2]);
  });

  it('always keeps the first and last point', () => {
    const indices = simplifyIndices(path([[0, 0], [0.5, 0.0001], [1, 0]]), 0.5);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(2);
  });

  it('returns every index for short paths', () => {
    expect(simplifyIndices(path([[0, 0], [1, 1]]), 0.5)).toEqual([0, 1]);
  });
});

describe('ladder', () => {
  const noisy = path(
    Array.from({ length: 400 }, (_, index) => [
      index / 400,
      (index % 2 === 0 ? 1 : -1) * 0.000001,
    ] as [number, number]),
  );

  it('gives coarser tolerances fewer points', () => {
    const ladder = buildSimplificationLadder(noisy);
    const fine = indicesForTolerance(ladder, ladder.tolerances[0]);
    const coarse = indicesForTolerance(ladder, ladder.tolerances.at(-1)!);
    expect(coarse.length).toBeLessThan(fine.length);
  });

  it('clamps a tolerance above the ladder to the coarsest level', () => {
    const ladder = buildSimplificationLadder(noisy);
    expect(indicesForTolerance(ladder, 10)).toEqual(ladder.indices.at(-1));
  });
});

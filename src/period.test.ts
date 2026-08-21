import { describe, expect, it } from 'vitest';
import { availablePresets, presetRange } from './period';

describe('presetRange', () => {
  it('spans everything the export covers', () => {
    expect(presetRange('all', '2018-10-04', '2026-08-11'))
      .toEqual({ start: '2018-10-04', end: '2026-08-11' });
  });

  it('walks a year back from the last day recorded', () => {
    expect(presetRange('year', '2018-10-04', '2026-08-11'))
      .toEqual({ start: '2025-08-11', end: '2026-08-11' });
  });

  it('walks six months back', () => {
    expect(presetRange('half', '2018-10-04', '2026-08-11'))
      .toEqual({ start: '2026-02-11', end: '2026-08-11' });
  });

  it('stops at the first day recorded rather than before it', () => {
    expect(presetRange('year', '2025-11-03', '2026-08-11'))
      .toEqual({ start: '2025-11-03', end: '2026-08-11' });
  });

  it('lands on the last day of a shorter month', () => {
    // Six months before 31 August is 31 February, which does not exist.
    expect(presetRange('half', '2018-01-01', '2026-08-31').start).toBe('2026-02-28');
  });
});

describe('availablePresets', () => {
  it('offers every window when the export is long enough for them', () => {
    expect(availablePresets('2018-10-04', '2026-08-11'))
      .toEqual(['all', 'year', 'half', 'custom']);
  });

  it('drops a window that would just repeat the whole span', () => {
    // Nine months of data: six months is a real cut, a year is not.
    expect(availablePresets('2025-11-03', '2026-08-11')).toEqual(['all', 'half', 'custom']);
  });

  it('leaves only the whole span and a custom range for a short export', () => {
    expect(availablePresets('2026-07-01', '2026-08-11')).toEqual(['all', 'custom']);
  });
});

import { describe, expect, it } from 'vitest';
import { inferTravelMode, normaliseTravelMode, travelModeLabel } from './travel';

describe('normaliseTravelMode', () => {
  it('reads the activity types this export actually contains', () => {
    expect(normaliseTravelMode('in passenger vehicle')).toBe('driving');
    expect(normaliseTravelMode('walking')).toBe('walking');
    expect(normaliseTravelMode('in bus')).toBe('bus');
    expect(normaliseTravelMode('in subway')).toBe('rail');
    expect(normaliseTravelMode('in train')).toBe('rail');
    expect(normaliseTravelMode('in tram')).toBe('rail');
    expect(normaliseTravelMode('cycling')).toBe('cycling');
    expect(normaliseTravelMode('in ferry')).toBe('ferry');
    expect(normaliseTravelMode('flying')).toBe('flight');
    expect(normaliseTravelMode('motorcycling')).toBe('driving');
    expect(normaliseTravelMode('unknown')).toBe('unknown');
  });

  it('prefers the more specific mode when words overlap', () => {
    // "in railway station bus" must not fall through to rail before bus is tried;
    // flight and ferry outrank every ground mode.
    expect(normaliseTravelMode('seaplane')).toBe('flight');
    expect(normaliseTravelMode('boating')).toBe('ferry');
  });

  it('treats anything unrecognised or absent as unknown', () => {
    expect(normaliseTravelMode('teleporting')).toBe('unknown');
    expect(normaliseTravelMode(undefined)).toBe('unknown');
    expect(normaliseTravelMode(42)).toBe('unknown');
  });
});

describe('travelModeLabel', () => {
  it('names the mode for the subtitle', () => {
    expect(travelModeLabel('flight')).toBe('flying');
    expect(travelModeLabel('rail')).toBe('by train');
  });

  it('says nothing for an unknown or missing mode', () => {
    expect(travelModeLabel('unknown')).toBe('');
    expect(travelModeLabel(undefined)).toBe('');
  });
});

describe('inferTravelMode', () => {
  it('reads a country-level hop as a flight', () => {
    expect(inferTravelMode(2532)).toBe('flight');
  });

  it('reads an intercity hop as driving', () => {
    expect(inferTravelMode(280)).toBe('driving');
  });

  it('says nothing about local movement', () => {
    // Under 60 km the distance cannot tell a walk from a bus, and a wrong icon
    // is worse than none: the share mark shows there instead.
    expect(inferTravelMode(12)).toBeUndefined();
    expect(inferTravelMode(0)).toBeUndefined();
  });

  it('agrees with the boundaries the pacing curve already classifies by', () => {
    expect(inferTravelMode(60)).toBeUndefined();
    expect(inferTravelMode(61)).toBe('driving');
    expect(inferTravelMode(400)).toBe('driving');
    expect(inferTravelMode(401)).toBe('flight');
  });
});

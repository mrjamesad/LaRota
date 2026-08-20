import { describe, expect, it } from 'vitest';
import { avcCodecCandidates, isMp4 } from './video';

describe('isMp4', () => {
  it('accepts an ISO base media file signature', () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    expect(isMp4(bytes.buffer)).toBe(true);
  });

  it('rejects short and unrelated output', () => {
    expect(isMp4(new ArrayBuffer(4))).toBe(false);
    expect(isMp4(new TextEncoder().encode('not-an-mp4-file').buffer)).toBe(false);
  });
});

describe('avcCodecCandidates', () => {
  it('offers level 3.1 for a small square frame', () => {
    expect(avcCodecCandidates(480, 480)).toContain('avc1.42001f');
  });

  it('skips levels too small to encode a portrait 1080x1920 frame', () => {
    const candidates = avcCodecCandidates(1080, 1920);
    // 8160 macroblocks: level 3.1 caps at 3600 and 3.2 at 5120.
    expect(candidates).not.toContain('avc1.42001f');
    expect(candidates).not.toContain('avc1.420020');
    expect(candidates).toContain('avc1.420028');
  });

  it('always produces well-formed codec strings', () => {
    for (const codec of avcCodecCandidates(1080, 1920)) {
      expect(codec).toMatch(/^avc1\.[0-9a-f]{6}$/);
    }
  });

  it('returns nothing for a frame no level can encode', () => {
    expect(avcCodecCandidates(16384, 16384)).toEqual([]);
  });
});

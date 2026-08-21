import { describe, expect, it } from 'vitest';
import { countSharedMedia, InstagramParseError, parseInstagramJson } from './instagram';

function story(exif: unknown[], creationTimestamp = 1783629796, branch = 'photo_metadata') {
  return {
    ig_stories: [{
      uri: 'media/stories/202607/18022875623850555.jpg',
      creation_timestamp: creationTimestamp,
      media_metadata: { [branch]: { exif_data: exif } },
    }],
  };
}

const COORDINATE = { latitude: 52.229760026919, longitude: -0.54802354809395 };
const CAPTURED = { iso: 2500, date_time_original: '2026:07:09 21:41:42' };

describe('parseInstagramJson', () => {
  it('reads a story whose coordinates sit in a sibling exif entry', () => {
    // The export splits one exif_data array into a bare coordinate object and a
    // separate camera object; the capture date is only in the latter.
    const points = parseInstagramJson(story([COORDINATE, CAPTURED]));

    expect(points).toHaveLength(1);
    expect(points[0].latitude).toBeCloseTo(52.22976, 5);
    expect(points[0].longitude).toBeCloseTo(-0.54802, 5);
    expect(points[0].share).toBe('instagram');
  });

  it('reads coordinates from video metadata as well as photo metadata', () => {
    const points = parseInstagramJson(story([COORDINATE, CAPTURED], 1783629796, 'video_metadata'));

    expect(points).toHaveLength(1);
    expect(points[0].latitude).toBeCloseTo(52.22976, 5);
  });

  it('reads the past-insights export shape', () => {
    const points = parseInstagramJson({
      organic_insights_posts: [{
        media_map_data: {
          'Media thumbnail': {
            creation_timestamp: 1783273959,
            media_metadata: { photo_metadata: { exif_data: [COORDINATE, CAPTURED] } },
          },
        },
      }],
    });

    expect(points).toHaveLength(1);
    expect(points[0].latitude).toBeCloseTo(52.22976, 5);
  });

  it('reads the posts export shape', () => {
    const points = parseInstagramJson([{
      media: [{
        uri: 'media/posts/202607/x.jpg',
        creation_timestamp: 1783273959,
        media_metadata: { photo_metadata: { exif_data: [COORDINATE, CAPTURED] } },
      }],
    }]);

    expect(points).toHaveLength(1);
    expect(points[0].latitude).toBeCloseTo(52.22976, 5);
  });

  it('prefers the capture date over the upload date', () => {
    // Observed in the real export: shared 2026-05-17, photographed 2026-05-10.
    const uploadedOn17May = 1778976000;
    const points = parseInstagramJson(story(
      [COORDINATE, { date_time_original: '2026:05:10 00:33:30' }],
      uploadedOn17May,
    ));

    expect(points[0].recordedDate).toBe('2026-05-10');
    expect(points[0].timeZoneMissing).toBe(true);
  });

  it('falls back to the upload timestamp when the exif carries no date', () => {
    const points = parseInstagramJson(story([COORDINATE, { iso: 2500 }], 1783629796));

    expect(points[0].instant.getTime()).toBe(1783629796 * 1000);
    expect(points[0].timeZoneMissing).toBe(false);
    expect(points[0].recordedDate).toBeUndefined();
  });

  it('rejects the zero island', () => {
    // Location services off records 0,0 rather than omitting the field.
    expect(() => parseInstagramJson(story([{ latitude: 0, longitude: 0 }, CAPTURED])))
      .toThrow(InstagramParseError);
  });

  it('rejects coordinates outside the world', () => {
    expect(() => parseInstagramJson(story([{ latitude: 91, longitude: 200 }, CAPTURED])))
      .toThrow(InstagramParseError);
  });

  it('skips media whose exif carries no coordinates', () => {
    const data = story([COORDINATE, CAPTURED]);
    data.ig_stories.push({
      uri: 'media/stories/202608/none.jpg',
      creation_timestamp: 1786468471,
      media_metadata: { photo_metadata: { exif_data: [{ iso: 80 }] } },
    } as never);

    expect(parseInstagramJson(data)).toHaveLength(1);
  });

  it('returns points in chronological order', () => {
    const data = story([COORDINATE, { date_time_original: '2026:07:09 21:41:42' }]);
    data.ig_stories.push({
      uri: 'media/stories/202602/berlin.jpg',
      creation_timestamp: 1770220800,
      media_metadata: {
        photo_metadata: {
          exif_data: [
            { latitude: 52.51017, longitude: 13.38039 },
            { date_time_original: '2026:02:03 16:00:45' },
          ],
        },
      },
    } as never);

    const points = parseInstagramJson(data);

    expect(points.map((point) => point.recordedDate)).toEqual(['2026-02-03', '2026-07-09']);
  });

  it('reports a recognised export that carries no coordinates', () => {
    try {
      parseInstagramJson(story([{ iso: 80 }]));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InstagramParseError).reason).toBe('no-usable-locations');
    }
  });

  it('reports a file that is not an Instagram export', () => {
    try {
      parseInstagramJson({ semanticSegments: [] });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InstagramParseError).reason).toBe('unsupported-format');
    }
  });
});

describe('countSharedMedia', () => {
  it('counts every shared item, including the ones with no coordinates', () => {
    const data = story([COORDINATE, CAPTURED]);
    data.ig_stories.push({
      uri: 'media/stories/202608/none.jpg',
      creation_timestamp: 1786468471,
      media_metadata: { photo_metadata: { exif_data: [{ iso: 80 }] } },
    } as never);

    // The status line needs the denominator: 2 shared, 1 locatable.
    expect(countSharedMedia(data)).toBe(2);
    expect(parseInstagramJson(data)).toHaveLength(1);
  });

  it('counts media that carries no metadata block at all', () => {
    expect(countSharedMedia({
      ig_stories: [{ uri: 'media/stories/202608/bare.jpg', creation_timestamp: 1786468471 }],
    })).toBe(1);
  });

  it('counts nothing in a file that is not an export', () => {
    expect(countSharedMedia({ semanticSegments: [] })).toBe(0);
  });
});

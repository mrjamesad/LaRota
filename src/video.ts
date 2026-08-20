import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from 'mediabunny';
import { frameAtElapsedSeconds, OUTRO_SECONDS } from './animation';
import { drawFrame } from './renderer';
import type { PreparedJourney } from './types';

export interface ExportOptions {
  durationSeconds: number;
  title: string;
  periodLabel: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export const VIDEO_BITRATE = 10_000_000;
const FRAME_RATE = 24;

/**
 * Macroblock capacity per AVC level. Upstream pinned level 3.1, which tops out at
 * 1280x720 — a portrait 1080x1920 frame needs 8160 macroblocks and would be
 * refused outright.
 */
const AVC_LEVELS: Array<{ byte: number; maxMacroblocks: number }> = [
  { byte: 0x1f, maxMacroblocks: 3600 },
  { byte: 0x20, maxMacroblocks: 5120 },
  { byte: 0x28, maxMacroblocks: 8192 },
  { byte: 0x2a, maxMacroblocks: 8704 },
  { byte: 0x33, maxMacroblocks: 22080 },
];

/** Codec strings that can encode this frame size, smallest sufficient level first. */
export function avcCodecCandidates(width: number, height: number): string[] {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const candidates: string[] = [];
  for (const level of AVC_LEVELS) {
    if (macroblocks > level.maxMacroblocks) continue;
    const hex = level.byte.toString(16).padStart(2, '0');
    // Baseline first, matching upstream's preference for the widest device support.
    candidates.push(`avc1.4200${hex}`);
    candidates.push(`avc1.6400${hex}`);
  }
  return candidates;
}

export function hasVideoEncoder(): boolean {
  return typeof globalThis.VideoEncoder !== 'undefined';
}

export async function supportedCodec(width: number, height: number): Promise<string | null> {
  if (!hasVideoEncoder()) return null;
  for (const codec of avcCodecCandidates(width, height)) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: VIDEO_BITRATE,
        framerate: FRAME_RATE,
        hardwareAcceleration: 'no-preference',
      });
      if (result.supported === true) return codec;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export async function canCreateMp4(width = 480, height = 480): Promise<boolean> {
  return (await supportedCodec(width, height)) !== null;
}

export function isMp4(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer, 4, 8);
  return String.fromCharCode(...bytes).startsWith('ftyp');
}

export async function createJourneyMp4(
  canvas: HTMLCanvasElement,
  journey: PreparedJourney,
  options: ExportOptions,
): Promise<Blob> {
  const codec = await supportedCodec(canvas.width, canvas.height);
  if (!codec) {
    throw new Error('Bu tarayıcı video oluşturamıyor. Güncel bir Safari veya Chrome kullan.');
  }

  const fps = FRAME_RATE;
  const frameDuration = 1 / fps;
  const journeyFrameCount = Math.max(1, Math.round(options.durationSeconds * fps));
  const outroFrameCount = Math.round(OUTRO_SECONDS * fps);
  const frameCount = journeyFrameCount + outroFrameCount;
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    fullCodecString: codec,
    quality: new Quality({ bitrate: VIDEO_BITRATE }),
    keyFrameInterval: 1,
    hardwareAcceleration: 'no-preference',
  });
  output.addVideoTrack(source, { frameRate: fps });
  output.setMetadataTags({ title: options.title });
  await output.start();

  for (let frame = 0; frame < frameCount; frame += 1) {
    if (options.signal?.aborted) {
      await output.cancel();
      throw new DOMException('Oluşturma durduruldu.', 'AbortError');
    }
    const animationFrame = frame < journeyFrameCount
      ? {
        journeyProgress: journeyFrameCount === 1 ? 1 : frame / (journeyFrameCount - 1),
        outroProgress: 0,
      }
      : frameAtElapsedSeconds(
        options.durationSeconds + (frame - journeyFrameCount) / fps,
        options.durationSeconds,
      );
    drawFrame(canvas, journey, animationFrame, options.title, options.periodLabel);
    await source.add(frame * frameDuration, frameDuration, { keyFrame: frame % fps === 0 });
    options.onProgress?.((frame + 1) / frameCount);
  }

  await output.finalize();
  if (!target.buffer) throw new Error('Video kodlayıcı bir dosya üretemedi.');
  if (!isMp4(target.buffer)) throw new Error('Video kodlayıcı geçersiz bir dosya üretti.');
  return new Blob([target.buffer], { type: 'video/mp4' });
}

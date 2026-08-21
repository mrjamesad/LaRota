import type { TravelMode } from './travel';
import type { GeoPoint } from './types';

type Ctx = CanvasRenderingContext2D;

/** What the marker draws at a moment: how it is moving, or that it posted from here. */
export type GlyphKind = TravelMode | 'instagram';

/**
 * A mode is carried forward across visits, so a shared moment nearly always has
 * one too. The share is the more particular thing to say about that instant, so
 * it wins.
 */
export function glyphFor(point: GeoPoint | undefined): GlyphKind | undefined {
  return point?.share ?? point?.mode;
}

/**
 * Mode marks drawn with canvas primitives rather than an icon font, so the video
 * carries no external dependency and the shapes stay crisp at any render size.
 * Each is authored inside a 24-unit box centred on the origin. `hole` is the disc
 * colour behind the mark, used to knock out windows.
 */
function walking(context: Ctx): void {
  context.beginPath();
  context.arc(0.6, -7.8, 2.5, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(0.6, -4.4);
  context.lineTo(-0.6, 0.8);
  context.moveTo(-0.6, 0.8);
  context.lineTo(-3.8, 7.8);
  context.moveTo(-0.6, 0.8);
  context.lineTo(3.4, 5.0);
  context.lineTo(3.0, 9.2);
  context.moveTo(0.3, -3.0);
  context.lineTo(-3.8, -0.4);
  context.moveTo(0.3, -3.0);
  context.lineTo(4.0, -1.0);
  context.stroke();
}

function driving(context: Ctx): void {
  context.beginPath();
  context.roundRect(-9.2, -2.2, 18.4, 5.4, 1.9);
  context.fill();
  context.beginPath();
  context.moveTo(-5.6, -2.2);
  context.lineTo(-3.4, -6.8);
  context.lineTo(3.4, -6.8);
  context.lineTo(5.6, -2.2);
  context.closePath();
  context.fill();
  context.beginPath();
  context.arc(-5.1, 3.6, 2.5, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(5.1, 3.6, 2.5, 0, Math.PI * 2);
  context.fill();
}

function boxed(context: Ctx, hole: string, topRadius: number, split: boolean): void {
  const ink = context.fillStyle;
  context.beginPath();
  context.roundRect(-7.4, -9.0, 14.8, 13.6, [topRadius, topRadius, 2, 2]);
  context.fill();
  context.fillStyle = hole;
  context.beginPath();
  context.roundRect(-5.5, -6.9, 11.0, 5.2, 1.2);
  context.fill();
  if (split) {
    context.fillStyle = ink;
    context.beginPath();
    context.rect(-0.5, -6.9, 1.0, 5.2);
    context.fill();
  }
  context.fillStyle = ink;
  context.beginPath();
  context.arc(-4.4, 6.3, 2.2, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(4.4, 6.3, 2.2, 0, Math.PI * 2);
  context.fill();
}

function cycling(context: Ctx): void {
  context.lineWidth = 1.7;
  context.beginPath();
  context.arc(-5.9, 3.4, 4.4, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(5.9, 3.4, 4.4, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(-5.9, 3.4);
  context.lineTo(-1.0, 3.4);
  context.lineTo(1.8, -3.2);
  context.lineTo(5.9, 3.4);
  context.moveTo(-1.0, 3.4);
  context.lineTo(1.8, -3.2);
  context.moveTo(0.4, -3.4);
  context.lineTo(3.8, -3.4);
  context.stroke();
}

function flight(context: Ctx): void {
  context.beginPath();
  context.moveTo(0, -9.6);
  context.quadraticCurveTo(1.9, -7.4, 1.9, -3.3);
  context.lineTo(9.2, 1.3);
  context.lineTo(9.2, 3.5);
  context.lineTo(1.9, 1.7);
  context.lineTo(1.9, 5.7);
  context.lineTo(4.1, 7.7);
  context.lineTo(4.1, 8.9);
  context.lineTo(0, 7.9);
  context.lineTo(-4.1, 8.9);
  context.lineTo(-4.1, 7.7);
  context.lineTo(-1.9, 5.7);
  context.lineTo(-1.9, 1.7);
  context.lineTo(-9.2, 3.5);
  context.lineTo(-9.2, 1.3);
  context.lineTo(-1.9, -3.3);
  context.quadraticCurveTo(-1.9, -7.4, 0, -9.6);
  context.closePath();
  context.fill();
}

function ferry(context: Ctx): void {
  context.beginPath();
  context.moveTo(-9.2, 2.4);
  context.lineTo(9.2, 2.4);
  context.lineTo(6.5, 7.8);
  context.quadraticCurveTo(5.9, 8.8, 4.5, 8.8);
  context.lineTo(-4.5, 8.8);
  context.quadraticCurveTo(-5.9, 8.8, -6.5, 7.8);
  context.closePath();
  context.fill();
  context.beginPath();
  context.roundRect(-5.4, -4.6, 10.8, 5.8, 1.4);
  context.fill();
  context.beginPath();
  context.roundRect(1.3, -8.6, 2.9, 4.2, 0.9);
  context.fill();
}

/** The share mark: outlined so it reads against the disc like the boxed modes do. */
function instagram(context: Ctx): void {
  context.beginPath();
  context.roundRect(-8.4, -8.4, 16.8, 16.8, 5.2);
  context.stroke();
  context.beginPath();
  context.arc(0, 0, 4.3, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(4.9, -4.9, 1.4, 0, Math.PI * 2);
  context.fill();
}

export function drawModeGlyph(
  context: Ctx,
  mode: GlyphKind | undefined,
  centerX: number,
  centerY: number,
  size: number,
  ink: string,
  hole: string,
): void {
  if (!mode || mode === 'unknown') return;
  const unit = size / 24;
  context.save();
  context.translate(centerX, centerY);
  context.scale(unit, unit);
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (mode === 'walking') walking(context);
  else if (mode === 'driving') driving(context);
  else if (mode === 'bus') boxed(context, hole, 2.4, false);
  else if (mode === 'rail') boxed(context, hole, 4.4, true);
  else if (mode === 'cycling') cycling(context);
  else if (mode === 'flight') flight(context);
  else if (mode === 'ferry') ferry(context);
  else if (mode === 'instagram') instagram(context);
  context.restore();
}

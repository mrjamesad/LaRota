import { easeInOutCubic, easeOutCubic } from './animation';
import {
  blendViewport,
  buildCameraTrack,
  cameraViewportAt,
  overviewViewport,
  worldPositionAtProgress,
} from './camera';
import { cumulativeDistances, overviewRouteSegments, project, unwrapWorldPoints } from './geo';
import { bowedPartial, bowedPolyline } from './arc';
import { drawModeGlyph } from './glyph';
import { journeySubtitle } from './label';
import { buildPacingCurve } from './pacing';
import { buildSimplificationLadder, indicesForTolerance } from './simplify';
import type {
  CameraMovement,
  CameraTrack,
  GeoPoint,
  PreparedJourney,
  TimelineFrame,
  Viewport,
  WorldPoint,
} from './types';

const TILE_TEMPLATE = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png';

/**
 * The video's palette, kept together so the whole look moves with one edit. Tuned
 * for the Voyager basemap — warm off-white land (#fbf8f3), pale blue water
 * (#d5e8eb), pale green vegetation (#edf2e3) — so the trail takes the one hue none
 * of those occupy.
 */
const THEME = {
  voidFill: '#f6f3ee',
  trail: '#e5006e',
  headRing: '#ffffff',
  headShadow: 'rgba(32, 20, 28, 0.30)',
  glyph: '#ffffff',
  card: 'rgba(255, 255, 255, 0.90)',
  cardEdge: 'rgba(28, 26, 30, 0.10)',
  title: '#1c1a1e',
  subtitle: '#6e646a',
} as const;

function worldToCanvas(
  point: WorldPoint,
  viewport: Viewport,
  width: number,
  height: number,
): [number, number] {
  return [
    ((point.x - viewport.minX) / (viewport.maxX - viewport.minX)) * width,
    ((point.y - viewport.minY) / (viewport.maxY - viewport.minY)) * height,
  ];
}

interface TileCoordinate {
  zoom: number;
  x: number;
  y: number;
}

function tileKey(tile: TileCoordinate): string {
  return `${tile.zoom}/${tile.x}/${tile.y}`;
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const cleanup = (): void => signal?.removeEventListener('abort', abort);
    const abort = (): void => {
      image.src = '';
      cleanup();
      reject(new DOMException('Oluşturma durduruldu.', 'AbortError'));
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Harita karosu yüklenemedi: ${url}`));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}

export function requiredTiles(viewport: Viewport): TileCoordinate[] {
  const tileCount = 2 ** viewport.zoom;
  const minTileX = Math.floor(viewport.minX * tileCount);
  const maxTileX = Math.floor(viewport.maxX * tileCount);
  const minTileY = Math.max(0, Math.floor(viewport.minY * tileCount));
  const maxTileY = Math.min(tileCount - 1, Math.floor(viewport.maxY * tileCount));
  const tiles: TileCoordinate[] = [];
  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      tiles.push({
        zoom: viewport.zoom,
        x: ((tileX % tileCount) + tileCount) % tileCount,
        y: tileY,
      });
    }
  }
  return tiles;
}

function drawMapBackground(
  canvas: HTMLCanvasElement,
  viewport: Viewport,
  tiles: Map<string, HTMLImageElement>,
): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Çizim yüzeyi kullanılamıyor.');
  context.fillStyle = THEME.voidFill;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const tileCount = 2 ** viewport.zoom;
  const minTileX = Math.floor(viewport.minX * tileCount);
  const maxTileX = Math.floor(viewport.maxX * tileCount);
  const minTileY = Math.max(0, Math.floor(viewport.minY * tileCount));
  const maxTileY = Math.min(tileCount - 1, Math.floor(viewport.maxY * tileCount));

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      const image = tiles.get(tileKey({ zoom: viewport.zoom, x: wrappedX, y: tileY }));
      if (!image) continue;
      const worldX = tileX / tileCount;
      const worldY = tileY / tileCount;
      const [left, top] = worldToCanvas({ x: worldX, y: worldY }, viewport, canvas.width, canvas.height);
      const width = (1 / tileCount / (viewport.maxX - viewport.minX)) * canvas.width;
      const height = (1 / tileCount / (viewport.maxY - viewport.minY)) * canvas.height;
      context.drawImage(image, left, top, width, height);
    }
  }
}

async function loadRequiredTiles(
  coordinates: TileCoordinate[],
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, HTMLImageElement>> {
  const tiles = new Map<string, HTMLImageElement>();
  let nextIndex = 0;
  let completed = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < coordinates.length) {
      if (signal?.aborted) throw new DOMException('Oluşturma durduruldu.', 'AbortError');
      const coordinate = coordinates[nextIndex];
      nextIndex += 1;
      const url = TILE_TEMPLATE.replace('{z}', String(coordinate.zoom))
        .replace('{x}', String(coordinate.x))
        .replace('{y}', String(coordinate.y));
      try {
        tiles.set(tileKey(coordinate), await loadImage(url, signal));
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      }
      completed += 1;
      onProgress?.(completed, coordinates.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, coordinates.length) }, worker));
  return tiles;
}

/**
 * Every distinct basemap tile a render will ask CARTO for. Separated out so the
 * count can be measured before anything is downloaded — a portrait canvas covers
 * far more tiles per view than the square one this code was written for.
 */
export function requiredJourneyTiles(
  cameraTrack: CameraTrack,
  endingOverview: Viewport,
  totalDistanceKm: number,
  durationSeconds: number,
  height: number,
  aspect: number,
): TileCoordinate[] {
  const sampleCount = Math.max(
    20,
    Math.min(durationSeconds * 8, Math.max(durationSeconds * 2, Math.ceil(totalDistanceKm / 250))),
  );
  const required = new Map<string, TileCoordinate>();
  for (let sample = 0; sample <= sampleCount; sample += 1) {
    for (const tile of requiredTiles(cameraViewportAt(cameraTrack, sample / sampleCount))) {
      required.set(tileKey(tile), tile);
    }
  }
  const journeyEnd = cameraViewportAt(cameraTrack, 1);
  for (let sample = 0; sample <= 12; sample += 1) {
    const ending = blendViewport(journeyEnd, endingOverview, easeOutCubic(sample / 12), height, aspect);
    for (const tile of requiredTiles(ending)) required.set(tileKey(tile), tile);
  }
  return [...required.values()];
}

export async function prepareJourney(
  points: GeoPoint[],
  width = 480,
  height = width,
  cameraMovement: CameraMovement = 'steady',
  durationSeconds = 30,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<PreparedJourney> {
  if (points.length < 2) throw new Error('En az iki konum noktası içeren bir aralık seç.');
  const worldPoints = unwrapWorldPoints(points.map((point) => project(point.latitude, point.longitude)));
  const distances = cumulativeDistances(points);
  const journey = {
    points,
    worldPoints,
    cumulativeDistanceKm: distances,
    totalDistanceKm: distances.at(-1) ?? 0,
    pacing: buildPacingCurve(points, distances),
  };
  const aspect = width / height;
  const cameraTrack = buildCameraTrack(journey, width, cameraMovement, aspect);
  const overviewSegments = overviewRouteSegments(worldPoints);
  const endingOverview = overviewViewport(
    { ...journey, worldPoints: overviewSegments.flat() },
    width,
    height,
  );
  const required = requiredJourneyTiles(
    cameraTrack,
    endingOverview,
    journey.totalDistanceKm,
    durationSeconds,
    height,
    aspect,
  );
  const tiles = await loadRequiredTiles(required, signal, onProgress);
  return {
    ...journey,
    overviewRouteSegments: overviewSegments,
    simplification: buildSimplificationLadder(worldPoints),
    cameraTrack,
    overviewViewport: endingOverview,
    tiles,
  };
}

function pointAtProgress(journey: PreparedJourney, progress: number) {
  const position = worldPositionAtProgress(journey, progress);
  return { ...position, completedIndex: position.fromIndex };
}

/**
 * `tail` is already-curved geometry — the part-finished hop the marker sits on —
 * so it is traced as given. Gaps between `points` are expanded here, because a
 * long hop is drawn as a bow rather than a chord.
 */
function strokeRoute(
  context: CanvasRenderingContext2D,
  points: WorldPoint[],
  tail: WorldPoint[],
  viewport: Viewport,
  width: number,
  height: number,
): void {
  if (points.length === 0) return;
  context.beginPath();
  const [startX, startY] = worldToCanvas(points[0], viewport, width, height);
  context.moveTo(startX, startY);
  for (let index = 1; index < points.length; index += 1) {
    for (const step of bowedPolyline(points[index - 1], points[index])) {
      const [x, y] = worldToCanvas(step, viewport, width, height);
      context.lineTo(x, y);
    }
  }
  for (const step of tail) {
    const [x, y] = worldToCanvas(step, viewport, width, height);
    context.lineTo(x, y);
  }
  context.stroke();
}

/**
 * A fixed pixel width hides the streets underneath once the camera is close in,
 * so the trail thins as the viewport narrows and thickens for continental views.
 */
function zoomWidthScale(viewport: Viewport, floor: number): number {
  const span = Math.max(viewport.maxX - viewport.minX, 1e-9);
  const t = Math.max(0, Math.min(1,
    (Math.log(span) - Math.log(0.0006)) / (Math.log(0.05) - Math.log(0.0006))));
  return floor + (1 - floor) * t;
}

/** A slice of the route, thinned to what the current zoom can actually show. */
function traveledPath(
  journey: PreparedJourney,
  fromIndex: number,
  toIndex: number,
  worldPerPixel: number,
): WorldPoint[] {
  const indices = indicesForTolerance(journey.simplification, worldPerPixel * 1.2);
  const path: WorldPoint[] = [];
  for (const index of indices) {
    if (index < fromIndex) continue;
    if (index > toIndex) break;
    path.push(journey.worldPoints[index]);
  }
  return path;
}

let trailLayer: HTMLCanvasElement | null = null;

function trailLayerFor(width: number, height: number): HTMLCanvasElement {
  if (!trailLayer) trailLayer = document.createElement('canvas');
  if (trailLayer.width !== width || trailLayer.height !== height) {
    trailLayer.width = width;
    trailLayer.height = height;
  }
  return trailLayer;
}

export function drawFrame(
  canvas: HTMLCanvasElement,
  journey: PreparedJourney,
  frame: TimelineFrame,
  title: string,
  // Kept for call-site compatibility; the subtitle is now derived per frame.
  _periodLabel: string,
): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Çizim yüzeyi kullanılamıyor.');
  const width = canvas.width;
  const height = canvas.height;
  const aspect = width / height;
  context.clearRect(0, 0, width, height);
  const journeyViewport = cameraViewportAt(journey.cameraTrack, frame.journeyProgress);
  const viewport = frame.outroProgress <= 0
    ? journeyViewport
    : blendViewport(
      journeyViewport,
      journey.overviewViewport,
      easeOutCubic(frame.outroProgress),
      height,
      aspect,
    );
  drawMapBackground(canvas, viewport, journey.tiles);

  const current = pointAtProgress(journey, frame.journeyProgress);
  const headTail = bowedPartial(
    journey.worldPoints[current.fromIndex],
    journey.worldPoints[current.toIndex],
    current.fraction,
  );
  const trailScale = zoomWidthScale(viewport, 0.40);
  const markerScale = zoomWidthScale(viewport, 0.74);
  const worldPerPixel = (viewport.maxX - viewport.minX) / width;
  // Upstream's stroke widths are absolute pixels tuned at 480 wide. Scaling by the
  // same factor keeps the reference proportions at any canvas size.
  const strokeScale = width / 480;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const activeAlpha = 1 - easeOutCubic(frame.outroProgress);
  context.save();

  const layer = trailLayerFor(width, height);
  const layerContext = layer.getContext('2d');
  if (!layerContext) throw new Error('Çizim yüzeyi kullanılamıyor.');
  layerContext.clearRect(0, 0, width, height);
  layerContext.lineCap = 'round';
  layerContext.lineJoin = 'round';
  layerContext.strokeStyle = THEME.trail;
  layerContext.lineWidth = 5 * strokeScale * trailScale;
  strokeRoute(
    layerContext,
    traveledPath(journey, 0, current.completedIndex, worldPerPixel),
    headTail,
    viewport,
    width,
    height,
  );
  // Composite once, so crossings of the same street do not stack alpha.
  context.globalAlpha = activeAlpha * 0.34;
  context.drawImage(layer, 0, 0);

  context.globalAlpha = activeAlpha;
  const recentStartDistance = Math.max(
    0,
    current.distanceKm - Math.max(80, journey.totalDistanceKm * 0.16),
  );
  const recentStartIndex = Math.max(
    0,
    journey.cumulativeDistanceKm.findIndex((distance) => distance >= recentStartDistance),
  );
  context.strokeStyle = THEME.trail;
  context.lineWidth = 8 * strokeScale * trailScale;
  strokeRoute(
    context,
    traveledPath(journey, recentStartIndex, current.completedIndex, worldPerPixel),
    headTail,
    viewport,
    width,
    height,
  );
  const [headX, headY] = worldToCanvas(current.point, viewport, width, height);

  // A white ring lifts the marker off the map; the disc carries the mode mark.
  context.shadowColor = THEME.headShadow;
  context.shadowBlur = 12 * strokeScale;
  context.fillStyle = THEME.headRing;
  context.beginPath();
  context.arc(headX, headY, 20 * strokeScale * markerScale, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = THEME.trail;
  context.beginPath();
  context.arc(headX, headY, 16.5 * strokeScale * markerScale, 0, Math.PI * 2);
  context.fill();
  drawModeGlyph(
    context,
    journey.points[current.completedIndex]?.mode,
    headX,
    headY,
    21 * strokeScale * markerScale,
    THEME.glyph,
    THEME.trail,
  );
  context.restore();

  if (frame.outroProgress > 0) {
    context.save();
    context.globalAlpha = (190 / 255) * easeInOutCubic(frame.outroProgress);
    context.strokeStyle = THEME.trail;
    context.lineWidth = 3.5 * strokeScale * trailScale;
    for (const segment of journey.overviewRouteSegments) {
      strokeRoute(context, segment, [], viewport, width, height);
    }
    context.restore();
  }

  const scale = width / 720;
  context.fillStyle = THEME.card;
  context.beginPath();
  context.roundRect(34 * scale, 28 * scale, width - 68 * scale, 104 * scale, 24 * scale);
  context.fill();
  context.strokeStyle = THEME.cardEdge;
  context.lineWidth = 1 * strokeScale;
  context.stroke();
  context.textAlign = 'center';
  context.fillStyle = THEME.title;
  context.font = `700 ${34 * scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
  context.fillText(title || 'My Timeline', width / 2, 72 * scale, width - 104 * scale);
  context.fillStyle = THEME.subtitle;
  context.font = `${20 * scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
  context.fillText(
    journeySubtitle(journey.points, current.completedIndex, current.distanceKm),
    width / 2,
    108 * scale,
  );
}

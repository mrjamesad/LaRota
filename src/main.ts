import './style.css';
import { frameAtElapsedSeconds, totalDurationSeconds } from './animation';
import { cleanTimelinePoints } from './cleanup';
import { suggestedDurationSeconds } from './duration';
import { cumulativeDistances } from './geo';
import { countSharedMedia, InstagramParseError, parseInstagramJson } from './instagram';
import { drawFrame, prepareJourney } from './renderer';
import { attachSharePoints } from './share';
import {
  availableMonths,
  localDateKey,
  parseRawSignalsJson,
  parseTimelineJson,
  pointDateKey,
  processRawSignals,
  selectDateRange,
  selectRange,
  TimelineParseError,
} from './timeline';
import type { RawSignalPoint, RawSignalProcessingResult } from './timeline';
import type { CameraMovement, GeoPoint, MonthOption, PreparedJourney } from './types';
import { canCreateMp4, createJourneyMp4 } from './video';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const fileInput = element<HTMLInputElement>('timeline-file');
const sampleButton = element<HTMLButtonElement>('sample-button');
const fileStatus = element<HTMLParagraphElement>('file-status');
const instagramFile = element<HTMLInputElement>('instagram-file');
const instagramStatus = element<HTMLParagraphElement>('instagram-status');
const compatibilityStatus = element<HTMLParagraphElement>('compatibility-status');
const settingsCard = element<HTMLElement>('settings-card');
const exactDateToggle = element<HTMLInputElement>('exact-date-toggle');
const periodControls = element<HTMLElement>('period-controls');
const rawSignalsRow = element<HTMLElement>('raw-signals-row');
const rawSignalsToggle = element<HTMLInputElement>('raw-signals-toggle');
const rawSignalsDescription = element<HTMLElement>('raw-signals-description');
const rawAccuracyField = element<HTMLElement>('raw-accuracy-field');
const rawAccuracyLimit = element<HTMLInputElement>('raw-accuracy-limit');
const monthRangeFields = element<HTMLElement>('month-range-fields');
const exactDateFields = element<HTMLElement>('exact-date-fields');
const startSelect = element<HTMLSelectElement>('start-month');
const endSelect = element<HTMLSelectElement>('end-month');
const startDateInput = element<HTMLInputElement>('start-date');
const endDateInput = element<HTMLInputElement>('end-date');
const titleInput = element<HTMLInputElement>('video-title');
const durationSelect = element<HTMLSelectElement>('duration');
const cameraMovementSelect = element<HTMLSelectElement>('camera-movement');
const selectionSummary = element<HTMLParagraphElement>('selection-summary');
const mapConsent = element<HTMLInputElement>('map-consent');
const settingsError = element<HTMLParagraphElement>('settings-error');
const previewCard = element<HTMLElement>('preview-card');
const canvas = element<HTMLCanvasElement>('journey-canvas');
const previewButton = element<HTMLButtonElement>('preview-button');
const createButton = element<HTMLButtonElement>('create-button');
const cancelButton = element<HTMLButtonElement>('cancel-button');
const progress = element<HTMLProgressElement>('export-progress');
const progressLabel = element<HTMLSpanElement>('progress-label');
const errorMessage = element<HTMLParagraphElement>('error-message');
const resultVideo = element<HTMLVideoElement>('result-video');
const resultActions = element<HTMLElement>('result-actions');
const shareButton = element<HTMLButtonElement>('share-button');
const downloadLink = element<HTMLAnchorElement>('download-link');
const rawOnlyDialog = element<HTMLDialogElement>('raw-only-dialog');
const openGoogleMapsButton = element<HTMLButtonElement>('open-google-maps');
const continueRawDataButton = element<HTMLButtonElement>('continue-raw-data');

if (import.meta.env.VITE_PREVIEW === 'true') {
  element<HTMLElement>('preview-banner').classList.remove('hidden');
}

let allPoints: GeoPoint[] = [];
let semanticPoints: GeoPoint[] = [];
let timelinePoints: GeoPoint[] = [];
let timelineSourceName = '';
let timelineIsRawOnly = false;
let sharePoints: GeoPoint[] = [];
let sharedMediaCount = 0;
let rawSignalPoints: RawSignalPoint[] = [];
let rawSignalProcessing: RawSignalProcessingResult | null = null;
let pendingRawOnlyImport: { data: unknown; sourceName: string } | null = null;
let months: MonthOption[] = [];
let prepared: PreparedJourney | null = null;
let selectedSignature = '';
let resultUrl: string | null = null;
let resultFile: File | null = null;
let previewAnimation = 0;
let encodingSupported = false;
let compatibilityChecked = false;
let isExporting = false;
let isPreparing = false;
let durationChosenByHand = false;
let exportController: AbortController | null = null;

function setError(message: string | null): void {
  errorMessage.textContent = message ?? '';
  errorMessage.classList.toggle('hidden', !message);
}

function setSettingsError(message: string | null): void {
  settingsError.textContent = message ?? '';
  settingsError.classList.toggle('hidden', !message);
}

function populateMonths(select: HTMLSelectElement, options: MonthOption[]): void {
  select.replaceChildren(...options.map(({ key, label }) => new Option(label, key)));
}

function rebuildRawSignalProcessing(): boolean {
  const trimmed = rawAccuracyLimit.value.trim();
  const limit = trimmed === '' ? null : Number(trimmed);
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
    setSettingsError('Doğruluk sınırı negatif olamaz. Boş da bırakabilirsin.');
    rawAccuracyLimit.focus();
    return false;
  }
  rawSignalProcessing = processRawSignals(rawSignalPoints, limit);
  return true;
}

function currentPoints(): GeoPoint[] {
  if (rawSignalsToggle.checked) {
    return rebuildRawSignalProcessing() ? rawSignalProcessing?.points ?? [] : [];
  }
  if (exactDateToggle.checked) {
    return selectDateRange(semanticPoints, startDateInput.value, endDateInput.value);
  }
  return selectRange(semanticPoints, startSelect.value, endSelect.value);
}

function formatInputDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(year, month - 1, day));
}

function currentPeriodLabel(): string {
  if (rawSignalsToggle.checked) return 'Raw location data';
  if (exactDateToggle.checked) {
    const start = formatInputDate(startDateInput.value);
    const end = formatInputDate(endDateInput.value);
    return startDateInput.value === endDateInput.value ? start : `${start} – ${end}`;
  }
  const start = months.find((month) => month.key === startSelect.value)?.label ?? startSelect.value;
  const end = months.find((month) => month.key === endSelect.value)?.label ?? endSelect.value;
  return startSelect.value === endSelect.value ? start : `${start} – ${end}`;
}

function currentRangeSignature(): string {
  if (rawSignalsToggle.checked) return `raw:${rawAccuracyLimit.value.trim()}`;
  return exactDateToggle.checked
    ? `dates:${startDateInput.value}:${endDateInput.value}`
    : `months:${startSelect.value}:${endSelect.value}`;
}

function selectedDistanceKm(points: GeoPoint[]): number {
  return cumulativeDistances(points).at(-1) ?? 0;
}

function refreshActionAvailability(points = currentPoints()): void {
  const hasJourney = points.length >= 2 && selectedDistanceKm(points) > 0;
  previewButton.disabled = isExporting || isPreparing || !hasJourney;
  createButton.disabled = isExporting || isPreparing || !hasJourney || !encodingSupported;
  if (!compatibilityChecked) {
    createButton.title = 'Tarayıcı video desteği kontrol ediliyor.';
  } else if (!encodingSupported) {
    createButton.title = 'Video oluşturmak için H.264 destekli güncel bir tarayıcı gerekiyor.';
  } else if (!hasJourney) {
    createButton.title = 'En az iki farklı konum içeren bir aralık seç.';
  } else {
    createButton.removeAttribute('title');
  }
}

/**
 * Offers a runtime that fits the selected period, and marks it in the list. The
 * choice is only applied until the viewer picks one themselves.
 */
function applySuggestedDuration(points: GeoPoint[]): void {
  const suggested = points.length >= 2 ? suggestedDurationSeconds(points) : null;
  for (const option of durationSelect.options) {
    const seconds = Number(option.value);
    option.textContent = seconds === suggested
      ? `${seconds} saniye · önerilen`
      : `${seconds} saniye`;
  }
  if (suggested !== null && !durationChosenByHand) durationSelect.value = String(suggested);
}

function updateSelection(): void {
  cancelAnimationFrame(previewAnimation);
  setSettingsError(null);
  if (!rawSignalsToggle.checked && exactDateToggle.checked) {
    if (startDateInput.value > endDateInput.value) endDateInput.value = startDateInput.value;
  } else if (!rawSignalsToggle.checked && startSelect.value > endSelect.value) {
    endSelect.value = startSelect.value;
  }

  const points = currentPoints();
  const distanceKm = selectedDistanceKm(points);
  if (points.length === 0) {
    selectionSummary.textContent = 'Bu aralıkta konum yok';
  } else if (points.length === 1) {
    selectionSummary.textContent = '1 konum noktası · Aralığı genişlet';
  } else if (distanceKm <= 0) {
    selectionSummary.textContent = `${points.length.toLocaleString()} konum noktası · Hareket yok`;
  } else {
    const estimate = rawSignalsToggle.checked ? 'tahmini ' : 'yaklaşık ';
    const ignored = rawSignalsToggle.checked && rawSignalProcessing?.rejectedCount
      ? ` · ${rawSignalProcessing.rejectedCount.toLocaleString()} gürültülü nokta atlandı`
      : '';
    selectionSummary.textContent = `${points.length.toLocaleString()} konum noktası · ${estimate}${Math.round(distanceKm).toLocaleString()} km${ignored}`;
  }
  applySuggestedDuration(points);
  prepared = null;
  selectedSignature = '';
  refreshActionAvailability(points);
}

async function getPreparedJourney(signal?: AbortSignal): Promise<PreparedJourney> {
  const cameraMovement = cameraMovementSelect.value as CameraMovement;
  const durationSeconds = Number(durationSelect.value);
  const signature = `${currentRangeSignature()}:camera:${cameraMovement}:duration:${durationSeconds}`;
  if (prepared && signature === selectedSignature) return prepared;
  if (signal?.aborted) throw new DOMException('Video creation was cancelled.', 'AbortError');
  progressLabel.textContent = 'Harita hazırlanıyor';
  const nextJourney = await prepareJourney(
    currentPoints(),
    canvas.width,
    canvas.height,
    cameraMovement,
    durationSeconds,
    signal,
    (completed, total) => {
      progressLabel.textContent = `Harita hazırlanıyor ${completed}/${total}`;
    },
  );
  if (signal?.aborted) throw new DOMException('Video creation was cancelled.', 'AbortError');
  prepared = nextJourney;
  selectedSignature = signature;
  return nextJourney;
}

function requireMapConsent(): boolean {
  if (mapConsent.checked) return true;
  setSettingsError('Devam etmek için harita görsellerini indirmeyi onayla.');
  mapConsent.focus();
  return false;
}

function parseTimelineText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TimelineParseError('malformed-json', 'Bu geçerli veya eksiksiz bir JSON dosyası değil.');
  }
}

function applyTimeline(data: unknown, sourceName: string, useRawOnly = false): void {
  rawSignalPoints = parseRawSignalsJson(data);
  rawSignalProcessing = processRawSignals(rawSignalPoints, Number(rawAccuracyLimit.value));
  timelinePoints = useRawOnly ? [] : cleanTimelinePoints(parseTimelineJson(data));
  timelineSourceName = sourceName;
  timelineIsRawOnly = useRawOnly;
  adoptPoints();
}

/**
 * Rebuilds every range control from the merged point set. Split out of
 * `applyTimeline` because an Instagram file arriving later has to redo all of it
 * without reparsing the Timeline export.
 */
function adoptPoints(): void {
  const useRawOnly = timelineIsRawOnly;
  const sourceName = timelineSourceName;
  semanticPoints = attachSharePoints(timelinePoints, sharePoints);
  allPoints = useRawOnly ? rawSignalProcessing?.points ?? [] : semanticPoints;
  if (allPoints.length === 0) {
    throw new TimelineParseError('no-usable-locations', 'Bu dosyada kullanılabilir konum noktası yok.');
  }
  months = availableMonths(allPoints);
  populateMonths(startSelect, months);
  populateMonths(endSelect, months);
  startSelect.value = months[0].key;
  endSelect.value = months.at(-1)?.key ?? months[0].key;
  const dateKeys = allPoints.map(pointDateKey).sort();
  const firstDate = dateKeys[0] ?? localDateKey(allPoints[0].instant);
  const lastDate = dateKeys.at(-1) ?? firstDate;
  startDateInput.min = firstDate;
  startDateInput.max = lastDate;
  endDateInput.min = firstDate;
  endDateInput.max = lastDate;
  startDateInput.value = firstDate;
  endDateInput.value = lastDate;
  exactDateToggle.checked = false;
  durationChosenByHand = false;
  rawSignalsToggle.checked = useRawOnly;
  rawSignalsRow.classList.toggle('hidden', useRawOnly || rawSignalPoints.length === 0);
  rawSignalsDescription.classList.toggle('hidden', !useRawOnly);
  rawAccuracyField.classList.toggle('hidden', !useRawOnly);
  periodControls.classList.toggle('hidden', useRawOnly);
  monthRangeFields.classList.remove('hidden');
  exactDateFields.classList.add('hidden');
  mapConsent.checked = false;
  settingsCard.classList.remove('hidden');
  previewCard.classList.add('hidden');
  const timezoneNote = allPoints.some((point) => point.timeZoneMissing)
    ? ' · saat dilimi yok, sıra korunuyor'
    : '';
  const sourceNote = useRawOnly ? ' · ham konum verisi' : '';
  fileStatus.textContent = `${sourceName} · ${allPoints.length.toLocaleString()} nokta · ${months[0].label} – ${months.at(-1)?.label}${sourceNote}${timezoneNote}`;
  refreshShareStatus();
  updateSelection();
}

function refreshShareStatus(): void {
  if (sharePoints.length === 0) {
    instagramStatus.textContent = 'Seçilmedi';
    return;
  }
  const located = `${sharedMediaCount.toLocaleString()} paylaşımdan ${sharePoints.length} tanesinde konum var`;
  if (timelineIsRawOnly) {
    instagramStatus.textContent = `${located} · ham konum modunda işaretler kullanılmıyor`;
    return;
  }
  if (timelinePoints.length === 0) {
    instagramStatus.textContent = `${located} · rota yalnızca paylaşımlardan çiziliyor`;
    return;
  }
  const marked = allPoints.filter((point) => point.share).length;
  instagramStatus.textContent = `${located} · ${marked} tanesi rotaya işlendi`;
}

async function loadTimeline(file: File): Promise<void> {
  setError(null);
  setSettingsError(null);
  fileStatus.textContent = `${file.name} okunuyor…`;
  const data = parseTimelineText(await file.text());
  try {
    applyTimeline(data, file.name);
  } catch (error) {
    const rawPoints = parseRawSignalsJson(data);
    if (error instanceof TimelineParseError && error.reason === 'raw-signals-only' && rawPoints.length > 0) {
      pendingRawOnlyImport = { data, sourceName: file.name };
      fileStatus.textContent = 'Sadece ham konum verisi bulundu';
      rawOnlyDialog.showModal();
      return;
    }
    throw error;
  }
}

async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await loadTimeline(file);
  } catch (error) {
    settingsCard.classList.add('hidden');
    fileStatus.textContent = 'Dosya yüklenemedi';
    setError(error instanceof Error ? error.message : 'Dosya okunamadı.');
    previewCard.classList.remove('hidden');
  }
});

instagramFile.addEventListener('change', async () => {
  const file = instagramFile.files?.[0];
  if (!file) return;
  setError(null);
  setSettingsError(null);
  instagramStatus.textContent = `${file.name} okunuyor…`;
  try {
    const data = parseTimelineText(await file.text());
    sharedMediaCount = countSharedMedia(data);
    sharePoints = parseInstagramJson(data);
  } catch (error) {
    sharePoints = [];
    instagramStatus.textContent = error instanceof InstagramParseError
      && error.reason === 'no-usable-locations'
      ? `${sharedMediaCount.toLocaleString()} paylaşım okundu, hiçbirinde konum yok`
      : (error instanceof Error ? error.message : 'Instagram dosyası okunamadı.');
    return;
  }
  // With no Timeline loaded the shares are the whole journey, so they name the source.
  if (timelinePoints.length === 0 && !timelineIsRawOnly) {
    timelineSourceName = file.name;
  }
  adoptPoints();
});

sampleButton.addEventListener('click', async () => {
  setError(null);
  setSettingsError(null);
  fileStatus.textContent = 'Örnek yolculuk yükleniyor…';
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}sample-timeline.json`);
    if (!response.ok) throw new Error('Örnek yolculuk yüklenemedi.');
    applyTimeline(parseTimelineText(await response.text()), 'Fictional sample');
  } catch (error) {
    settingsCard.classList.add('hidden');
    fileStatus.textContent = 'Örnek yüklenemedi';
    setError(error instanceof Error ? error.message : 'Örnek yolculuk yüklenemedi.');
    previewCard.classList.remove('hidden');
  }
});

startSelect.addEventListener('change', updateSelection);
endSelect.addEventListener('change', updateSelection);
startDateInput.addEventListener('change', updateSelection);
endDateInput.addEventListener('change', updateSelection);
durationSelect.addEventListener('change', () => {
  durationChosenByHand = true;
  updateSelection();
});
cameraMovementSelect.addEventListener('change', updateSelection);
exactDateToggle.addEventListener('change', () => {
  monthRangeFields.classList.toggle('hidden', exactDateToggle.checked);
  exactDateFields.classList.toggle('hidden', !exactDateToggle.checked);
  updateSelection();
});
rawSignalsToggle.addEventListener('change', () => {
  periodControls.classList.toggle('hidden', rawSignalsToggle.checked);
  rawSignalsDescription.classList.toggle('hidden', !rawSignalsToggle.checked);
  rawAccuracyField.classList.toggle('hidden', !rawSignalsToggle.checked);
  updateSelection();
});
rawAccuracyLimit.addEventListener('input', updateSelection);
mapConsent.addEventListener('change', () => {
  if (mapConsent.checked) setSettingsError(null);
});

openGoogleMapsButton.addEventListener('click', () => {
  window.open('https://www.google.com/maps', '_blank', 'noopener');
  pendingRawOnlyImport = null;
  rawOnlyDialog.close();
  settingsCard.classList.add('hidden');
  fileStatus.textContent = 'Ziyaretlerin göründükten sonra dosyayı yeniden dışa aktarıp buraya yükle.';
});

continueRawDataButton.addEventListener('click', () => {
  const pending = pendingRawOnlyImport;
  if (!pending) return;
  pendingRawOnlyImport = null;
  rawOnlyDialog.close();
  try {
    applyTimeline(pending.data, pending.sourceName, true);
  } catch (error) {
    settingsCard.classList.add('hidden');
    fileStatus.textContent = 'Dosya yüklenemedi';
    setError(error instanceof Error ? error.message : 'Dosya okunamadı.');
    previewCard.classList.remove('hidden');
  }
});

rawOnlyDialog.addEventListener('cancel', () => {
  pendingRawOnlyImport = null;
  settingsCard.classList.add('hidden');
  fileStatus.textContent = 'Ham veri içe aktarımı iptal edildi';
});

previewButton.addEventListener('click', async () => {
  if (!requireMapConsent()) return;
  cancelAnimationFrame(previewAnimation);
  setError(null);
  resultActions.classList.add('hidden');
  resultVideo.classList.add('hidden');
  previewCard.classList.remove('hidden');
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  isPreparing = true;
  refreshActionAvailability();
  try {
    const journey = await getPreparedJourney();
    const started = performance.now();
    const previewJourneyDuration = Math.min(8, Number(durationSelect.value));
    const previewDuration = totalDurationSeconds(previewJourneyDuration);
    const tick = (now: number): void => {
      const elapsedSeconds = Math.min(previewDuration, (now - started) / 1000);
      const fraction = elapsedSeconds / previewDuration;
      drawFrame(
        canvas,
        journey,
        frameAtElapsedSeconds(elapsedSeconds, previewJourneyDuration),
        titleInput.value.trim(),
        currentPeriodLabel(),
      );
      progressLabel.textContent = fraction < 1 ? 'Önizleniyor' : 'Önizleme bitti';
      if (fraction < 1) previewAnimation = requestAnimationFrame(tick);
    };
    previewAnimation = requestAnimationFrame(tick);
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Önizleme başarısız.');
  } finally {
    isPreparing = false;
    refreshActionAvailability();
  }
});

cancelButton.addEventListener('click', () => {
  cancelButton.disabled = true;
  progressLabel.textContent = 'Durduruluyor…';
  exportController?.abort();
});

createButton.addEventListener('click', async () => {
  if (!requireMapConsent()) return;
  cancelAnimationFrame(previewAnimation);
  setError(null);
  resultActions.classList.add('hidden');
  resultVideo.classList.add('hidden');
  previewCard.classList.remove('hidden');
  progress.classList.remove('hidden');
  cancelButton.classList.remove('hidden');
  cancelButton.disabled = false;
  progress.value = 0;
  isExporting = true;
  refreshActionAvailability();
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  exportController = new AbortController();
  const wakeLock = await requestWakeLock();
  try {
    const journey = await getPreparedJourney(exportController.signal);
    progressLabel.textContent = 'Video oluşturuluyor';
    const blob = await createJourneyMp4(canvas, journey, {
      durationSeconds: Number(durationSelect.value),
      title: titleInput.value.trim() || 'My Timeline',
      periodLabel: currentPeriodLabel(),
      signal: exportController.signal,
      onProgress: (fraction) => {
        progress.value = fraction;
        progressLabel.textContent = `Video oluşturuluyor %${Math.round(fraction * 100)}`;
      },
    });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    resultFile = new File([blob], 'larota.mp4', { type: 'video/mp4' });
    downloadLink.href = resultUrl;
    resultVideo.src = resultUrl;
    resultVideo.classList.remove('hidden');
    resultActions.classList.remove('hidden');
    progressLabel.textContent = `Video hazır · ${(blob.size / 1_000_000).toFixed(1)} MB`;
    const shareData = { files: [resultFile] };
    const canShare = typeof navigator.share === 'function'
      && (typeof navigator.canShare !== 'function' || navigator.canShare(shareData));
    shareButton.hidden = !canShare;
  } catch (error) {
    if (exportController.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      progressLabel.textContent = 'Oluşturma durduruldu';
      progress.value = 0;
    } else {
      setError(error instanceof Error ? error.message : 'Video oluşturulamadı.');
      progressLabel.textContent = 'Video oluşturulamadı';
    }
  } finally {
    await wakeLock?.release().catch(() => undefined);
    exportController = null;
    isExporting = false;
    cancelButton.classList.add('hidden');
    refreshActionAvailability();
  }
});

shareButton.addEventListener('click', async () => {
  if (!resultFile || typeof navigator.share !== 'function') return;
  try {
    await navigator.share({ files: [resultFile], title: titleInput.value.trim() || 'My Timeline' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    setError('Paylaşım menüsü açılamadı. İndir düğmesini kullan.');
  }
});

void canCreateMp4(canvas.width, canvas.height).then((supported) => {
  compatibilityChecked = true;
  encodingSupported = supported;
  compatibilityStatus.textContent = supported
    ? 'Bu tarayıcı video oluşturabiliyor.'
    : 'Sadece önizleme. Video oluşturmak için H.264 destekli güncel bir tarayıcı gerekiyor.';
  refreshActionAvailability();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`);
  });
}

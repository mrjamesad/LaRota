/** The windows the range picker offers, in the order it shows them. */
export type RangePreset = 'all' | 'year' | 'half' | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

const MONTHS_BACK: Partial<Record<RangePreset, number>> = { year: 12, half: 6 };

function toParts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month, day];
}

function format(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Calendar arithmetic, not 30-day steps: "six months back" from 11 August should
 * read 11 February. Where the target month is too short to hold the day — the
 * 31st of February — it lands on that month's last day instead of spilling over.
 */
function monthsBefore(date: string, months: number): string {
  const [year, month, day] = toParts(date);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return format(targetYear, targetMonth, Math.min(day, lastDay));
}

export function presetRange(preset: RangePreset, first: string, last: string): DateRange {
  const months = MONTHS_BACK[preset];
  if (months === undefined) return { start: first, end: last };
  const start = monthsBefore(last, months);
  return { start: start < first ? first : start, end: last };
}

/**
 * A window that reaches past the first day recorded is the whole span under
 * another name, so it is not offered — an inert control reads as a broken one.
 */
export function availablePresets(first: string, last: string): RangePreset[] {
  const order: RangePreset[] = ['all', 'year', 'half', 'custom'];
  return order.filter((preset) => {
    const months = MONTHS_BACK[preset];
    return months === undefined || monthsBefore(last, months) > first;
  });
}

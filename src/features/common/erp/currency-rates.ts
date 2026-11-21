export type RatePeriod = { startDate: string; endDate: string | null; rate: string };

export const MAX_RATE_PERIODS = 50;

export function normaliseRate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const rate = value.trim();
  if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(rate) || !/[1-9]/.test(rate)) return null;
  const [whole, fraction] = rate.split(".");
  const integer = whole.replace(/^0+/, "") || "0";
  return fraction === undefined ? integer : `${integer}.${fraction}`;
}

export function readRatePeriods(data: Record<string, unknown>): RatePeriod[] {
  if (!Array.isArray(data.customRates)) return [];
  return data.customRates.flatMap((period: unknown) => {
    if (!period || typeof period !== "object" || !("startDate" in period) || !("rate" in period)) return [];
    const { startDate, rate } = period;
    const endDate = "endDate" in period ? period.endDate ?? null : null;
    if (typeof startDate !== "string" || typeof rate !== "string" || (endDate !== null && typeof endDate !== "string")) return [];
    return [{ startDate, endDate, rate }];
  });
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateRatePeriods(periods: readonly RatePeriod[]): string | null {
  if (periods.length > MAX_RATE_PERIODS) return `Enter at most ${MAX_RATE_PERIODS} rate periods.`;
  for (const [index, { startDate, endDate, rate }] of periods.entries()) {
    const label = `Rate period ${index + 1}`;
    if (!isIsoDate(startDate)) return `${label} needs a valid start date.`;
    if (endDate !== null && !isIsoDate(endDate)) return `${label} needs a valid end date or a blank end date.`;
    if (endDate !== null && endDate < startDate) return `${label} ends before it starts.`;
    if (normaliseRate(rate) === null) return `${label} needs a positive rate with up to six decimal places.`;
  }

  const ordered = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let index = 1; index < ordered.length; index++) {
    const previousEnd = ordered[index - 1].endDate;
    if (previousEnd === null || ordered[index].startDate <= previousEnd) return "Rate periods must not overlap.";
  }
  return null;
}

export function effectiveRate(data: Record<string, unknown>, isoDate: string): string | null {
  const period = readRatePeriods(data).find(({ startDate, endDate }) =>
    startDate <= isoDate && (endDate === null || isoDate <= endDate),
  );
  return period?.rate ?? normaliseRate(typeof data.rate === "number" ? String(data.rate) : data.rate);
}

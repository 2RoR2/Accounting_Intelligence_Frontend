import { WORKSPACE_PAGES } from "@/lib/constants/routes";
import type {
  CommentaryFact, ForecastBucket, ForecastHorizon, Horizon, InsightAnomaly, InsightsForecast, SpendRow, SpendSection, TrendPoint,
} from "./insights-api";

/** Pure helpers behind the Insights charts: periods, windows, scales and geometry. No figure is invented here. */

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isPeriod = (value: string) => PERIOD.test(value);

/** The current month in Kuala Lumpur, as YYYY-MM. */
export function currentPeriod(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  if (!isPeriod(period)) return period;
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function shortMonth(month: string): string {
  if (!isPeriod(month)) return month;
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-MY", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, number - 1, 1)));
}

/**
 * An in-app link for a path the API gave. Report paths (`/reports/profit-and-loss?...`) open the Reports page,
 * because its tabs are not separate routes; other paths are used only when they name a page this role can open.
 * Absolute and protocol-relative addresses are never followed. `base` is `/workspace` or `/company`.
 */
export function resolveHref(href: string | null | undefined, base: string): string | null {
  if (!href || !/^\/(?![/\\])[^\s]*$/.test(href)) return null;
  const [path] = href.split(/[?#]/);
  const [first, second] = path.split("/").filter(Boolean);
  if (!first) return null;
  const area = base.replace("/", "");
  if (["workspace", "company", "admin"].includes(first)) {
    return first === area && WORKSPACE_PAGES[area]?.has(second ?? "") ? path : null;
  }
  if (first === "reports") return `${base}/reports`;
  return WORKSPACE_PAGES[area]?.has(first) ? `${base}/${path.split("/").filter(Boolean).slice(0, 2).join("/")}` : null;
}

export type Scale = { min: number; max: number; ticks: number[] };

/** A rounded axis that always includes zero, so a negative balance is drawn below the line. */
export function niceScale(values: number[], wanted = 4): Scale {
  const finite = values.filter(Number.isFinite);
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  if (high === low) return { min: 0, max: 1, ticks: [0, 1] };
  const rough = (high - low) / wanted;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Math.abs(value) < step / 1e6 ? 0 : Number(value.toFixed(6)));
  return { min, max, ticks };
}

export function compactMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const body = absolute >= 1000 ? new Intl.NumberFormat("en-MY", { notation: "compact", maximumFractionDigits: 1 }).format(absolute) : String(Math.round(absolute));
  return `${sign}RM ${body}`;
}

export function linePath(coords: Array<[number, number]>): string {
  return coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

/* ---------- cash forecast ---------- */

/** The horizon each due-date bucket belongs to. "After 90 days" is on no chart. */
const BUCKET_HORIZON: Record<string, Horizon> = { overdue: 30, d1_30: 30, d31_60: 60, d61_90: 90 };
const BUCKET_SHORT: Record<string, string> = { overdue: "Past due", d1_30: "1–30 d", d31_60: "31–60 d", d61_90: "61–90 d" };

export function horizonFor(forecast: InsightsForecast, days: Horizon): ForecastHorizon | null {
  return forecast.horizons.find((horizon) => horizon.days === days) ?? null;
}

export type ForecastColumn = {
  key: string;
  label: string;
  /** The backend's wording, for the selected-column readout and screen readers. */
  title: string;
  receivables: string | null;
  payables: string | null;
  receivableCount: number | null;
  payableCount: number | null;
  /** The projected balance at the end of this column, only where the backend supplies one. */
  balance: string | null;
};

/**
 * Columns for the cash chart: today's balance first, then each due-date bucket inside the horizon. A projected
 * balance exists only at the end of the 30, 60 and 90 day horizons (the backend's own figures), so past-due items
 * carry bars but no balance point: they are part of the 30 day balance.
 */
export function forecastColumns(forecast: InsightsForecast, days: Horizon): ForecastColumn[] {
  const columns: ForecastColumn[] = [];
  if (forecast.openingBalance !== null && Number.isFinite(Number(forecast.openingBalance))) {
    columns.push({
      key: "opening", label: "Now", title: "Bank and cash balance today", receivables: null, payables: null,
      receivableCount: null, payableCount: null, balance: forecast.openingBalance,
    });
  }
  const endOfBucket: Record<string, number> = { d1_30: 30, d31_60: 60, d61_90: 90 };
  for (const bucket of forecast.buckets) {
    const horizon = BUCKET_HORIZON[bucket.key];
    if (horizon === undefined || horizon > days) continue;
    const balance = endOfBucket[bucket.key] ? horizonFor(forecast, endOfBucket[bucket.key] as Horizon)?.projectedBalance ?? null : null;
    columns.push({
      key: bucket.key, label: BUCKET_SHORT[bucket.key] ?? bucket.label, title: bucket.label,
      receivables: bucket.receivables, payables: bucket.payables,
      receivableCount: bucket.receivableCount, payableCount: bucket.payableCount, balance,
    });
  }
  return columns;
}

const isZero = (value: string | null) => value === null || Number(value) === 0;

/** True when no open item has a recorded due date inside the window: nothing to chart beyond today's balance. */
export function forecastIsEmpty(forecast: InsightsForecast, days: Horizon): boolean {
  return forecastColumns(forecast, days).every((column) => column.key === "opening" || (isZero(column.receivables) && isZero(column.payables)));
}

export function bucketRows(forecast: InsightsForecast): ForecastBucket[] {
  return forecast.buckets;
}

/* ---------- spend ---------- */

export function spendIsEmpty(section: SpendSection): boolean {
  return section.items.every((row) => !(Number(row.amount) > 0));
}

/** The API's order (largest first, "other" last), with zero and negative rows dropped. */
export function spendRows(section: SpendSection): SpendRow[] {
  return section.items.filter((row) => Number(row.amount) > 0);
}

export function percent(share: string | null): string | null {
  if (share === null || !Number.isFinite(Number(share))) return null;
  return `${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 1 }).format(Number(share))}%`;
}

/** Bar length as a share of the largest row (never negative). */
export function barWidth(amount: string, largest: string): number {
  const whole = Number(largest);
  return whole > 0 ? Math.max(0, Math.min(1, Number(amount) / whole)) : 0;
}

export function largestAmount(rows: SpendRow[]): string {
  return String(Math.max(0, ...rows.map((row) => Number(row.amount))));
}

export type DonutSlice = { row: SpendRow; start: number; end: number; path: string };

function arc(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  const point = (radius: number, angle: number) => `${(cx + radius * Math.sin(angle)).toFixed(2)} ${(cy - radius * Math.cos(angle)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return `M${point(outer, start)} A${outer} ${outer} 0 ${large} 1 ${point(outer, end)} L${point(inner, end)} A${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`;
}

/** Donut slices in the order given. A single row is drawn as a full ring (an arc cannot start and end at one point). */
export function donutSlices(rows: SpendRow[], cx: number, cy: number, outer: number, inner: number): DonutSlice[] {
  const positive = rows.filter((row) => Number(row.amount) > 0);
  const total = positive.reduce((sum, row) => sum + Number(row.amount), 0);
  if (total <= 0) return [];
  let angle = 0;
  return positive.map((row) => {
    const sweep = (Number(row.amount) / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    const end = positive.length === 1 ? start + Math.PI * 2 - 0.0001 : angle;
    return { row, start, end, path: arc(cx, cy, outer, inner, start, end) };
  });
}

/* ---------- trend ---------- */

export type TrendColumn = { point: TrendPoint; revenue: number; expenses: number; net: number; anomalies: InsightAnomaly[] };

/** Only whole-month anomalies are marked on the trend; a supplier anomaly is listed as a text row instead. */
export const isMonthAnomaly = (anomaly: InsightAnomaly) => anomaly.kind === "month";

export function trendColumns(trend: TrendPoint[], anomalies: InsightAnomaly[]): TrendColumn[] {
  return trend.map((point) => ({
    point,
    revenue: Number(point.revenue),
    expenses: Number(point.expenses),
    net: Number(point.net),
    anomalies: anomalies.filter((anomaly) => isMonthAnomaly(anomaly) && anomaly.month === point.month),
  }));
}

export function trendIsEmpty(trend: TrendPoint[]): boolean {
  return trend.every((point) => Number(point.revenue) === 0 && Number(point.expenses) === 0 && Number(point.net) === 0);
}

/** Anomalies with no marker on the chart: supplier anomalies, and month anomalies outside the plotted months. */
export function unplottedAnomalies(trend: TrendPoint[], anomalies: InsightAnomaly[]): InsightAnomaly[] {
  const months = new Set(trend.map((point) => point.month));
  return anomalies.filter((anomaly) => !isMonthAnomaly(anomaly) || !anomaly.month || !months.has(anomaly.month));
}

/** A fact's value as the backend wrote it into the text (`display`), else formatted from its unit. */
export function formatFact(fact: Pick<CommentaryFact, "value" | "unit"> & { display?: string | null }): string {
  if (fact.display) return fact.display;
  const number = Number(fact.value);
  const unit = (fact.unit ?? "").toLowerCase();
  if (!Number.isFinite(number)) return fact.value;
  if (["myr", "rm", "currency", "money"].includes(unit)) {
    return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(number);
  }
  if (unit === "%" || unit === "percent") return `${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 1 }).format(number)}%`;
  const plain = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(number);
  return unit === "days" ? `${plain} days` : plain;
}

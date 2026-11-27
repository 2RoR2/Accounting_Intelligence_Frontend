import { ApiError, get } from "@/lib/api/client";

/**
 * Insights contract (backend `GET /api/insights/overview` and `/commentary`, docs/api/insights-reports.md).
 *
 * Money arrives as two-decimal strings and is shown as received. Nothing on this page recalculates a figure: the
 * backend computes every number, and `normalize*` below only reshapes the response, turning anything missing or
 * malformed into `null` / an empty list so the page shows "Not available" rather than a made-up zero.
 */
export type Money = string;
export type Horizon = 30 | 60 | 90;
export const HORIZONS: readonly Horizon[] = [30, 60, 90];

export type ForecastBucket = {
  key: string;
  label: string;
  from: string | null;
  to: string | null;
  receivables: Money | null;
  payables: Money | null;
  receivableCount: number | null;
  payableCount: number | null;
};
/** Cumulative: the bank balance plus everything recorded as due by `days` (past-due items are in the first one). */
export type ForecastHorizon = {
  days: number;
  date: string | null;
  receivablesDue: Money | null;
  payablesDue: Money | null;
  projectedBalance: Money | null;
};
export type NoDueDate = { receivables: Money | null; payables: Money | null; receivableCount: number | null; payableCount: number | null; note: string | null };
export type InsightsForecast = {
  asOf: string;
  /** The backend's own wording for what this is: a projection from recorded due dates, not a prediction. */
  basis: string | null;
  openingBalance: Money | null;
  buckets: ForecastBucket[];
  horizons: ForecastHorizon[];
  /** Open items with no recorded due date. They are reported here and never placed on the timeline. */
  noDueDate: NoDueDate;
};
export type SpendRow = { key: string; name: string; amount: Money; share: string | null; entries: number | null; isOther: boolean };
export type SpendSection = { total: Money | null; items: SpendRow[] };
export type TrendPoint = { month: string; revenue: Money; expenses: Money; net: Money; partial: boolean };
export type InsightAnomaly = {
  id: string;
  kind: string;
  subject: string;
  metric: string | null;
  month: string | null;
  value: Money | null;
  direction: string | null;
  reason: string;
};
export type InsightsOverview = {
  period: string;
  asOf: string;
  currency: string;
  generatedAt: string | null;
  forecast: InsightsForecast;
  spendBySupplier: SpendSection;
  spendByCategory: SpendSection;
  trend: TrendPoint[];
  anomalies: InsightAnomaly[];
  anomalyMethod: string | null;
};

export type CommentaryFact = { id: string; label: string; value: string; unit: string | null; display: string | null; href: string | null };
export type CommentaryParagraph = { text: string; factIds: string[] };
export type Commentary = {
  paragraphs: CommentaryParagraph[];
  facts: CommentaryFact[];
  generatedAt: string | null;
  /** True when the backend wrote the text from a fixed template instead of the AI model. */
  fallback: boolean;
  fallbackReason: string | null;
  /** The backend's own one-line label for this text (an AI draft, or a template). */
  label: string | null;
  partialPeriod: boolean;
};
/** `off` means the AI features are switched off for this deployment: the commentary card is not shown at all. */
export type CommentaryResult = { status: "ready"; commentary: Commentary } | { status: "off" };

export function overviewPath(period: string) {
  return `/api/insights/overview?${new URLSearchParams({ period })}`;
}
export function commentaryPath(period: string) {
  return `/api/insights/commentary?${new URLSearchParams({ period })}`;
}

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const decimal = (value: unknown): Money | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return value.trim();
  return null;
};

function spendSection(value: unknown): SpendSection {
  const raw = isRecord(value) ? value : {};
  return {
    total: decimal(raw.total),
    items: list(raw.items).flatMap((item, index): SpendRow[] => {
      if (!isRecord(item)) return [];
      const amount = decimal(item.amount);
      const name = text(item.name);
      if (amount === null || name === null) return [];
      return [{
        key: text(item.accountId) ?? `${name}-${index}`,
        name,
        amount,
        share: decimal(item.share),
        entries: count(item.entries),
        isOther: item.isOther === true,
      }];
    }),
  };
}

export function normalizeOverview(value: unknown): InsightsOverview | null {
  if (!isRecord(value)) return null;
  const forecast = isRecord(value.forecast) ? value.forecast : {};
  const noDueDate = isRecord(forecast.noDueDate) ? forecast.noDueDate : {};
  const trend = isRecord(value.trend) ? value.trend : {};
  return {
    period: text(value.period) ?? "",
    asOf: text(value.asOf) ?? text(forecast.asOf) ?? "",
    currency: text(value.currency) ?? "MYR",
    generatedAt: text(value.generatedAt),
    forecast: {
      asOf: text(forecast.asOf) ?? "",
      basis: text(forecast.basis),
      openingBalance: decimal(forecast.openingBalance),
      buckets: list(forecast.buckets).flatMap((item): ForecastBucket[] => {
        if (!isRecord(item)) return [];
        const key = text(item.key);
        return key ? [{
          key, label: text(item.label) ?? key, from: text(item.from), to: text(item.to),
          receivables: decimal(item.receivables), payables: decimal(item.payables),
          receivableCount: count(item.receivableCount), payableCount: count(item.payableCount),
        }] : [];
      }),
      horizons: list(forecast.horizons).flatMap((item): ForecastHorizon[] => {
        if (!isRecord(item)) return [];
        const days = count(item.days);
        return days === null ? [] : [{
          days, date: text(item.date), receivablesDue: decimal(item.receivablesDue),
          payablesDue: decimal(item.payablesDue), projectedBalance: decimal(item.projectedBalance),
        }];
      }),
      noDueDate: {
        receivables: decimal(noDueDate.receivables), payables: decimal(noDueDate.payables),
        receivableCount: count(noDueDate.receivableCount), payableCount: count(noDueDate.payableCount), note: text(noDueDate.note),
      },
    },
    spendBySupplier: spendSection(value.spendBySupplier),
    spendByCategory: spendSection(value.spendByCategory),
    trend: list(trend.months).flatMap((item): TrendPoint[] => {
      if (!isRecord(item)) return [];
      const month = text(item.month);
      const revenue = decimal(item.revenue);
      const expenses = decimal(item.expenses);
      const net = decimal(item.net);
      return month && revenue !== null && expenses !== null && net !== null
        ? [{ month, revenue, expenses, net, partial: item.partial === true }] : [];
    }),
    anomalies: list(value.anomalies).flatMap((item, index): InsightAnomaly[] => {
      if (!isRecord(item)) return [];
      const reason = text(item.reason);
      if (!reason) return [];
      return [{
        id: text(item.id) ?? `anomaly-${index}`,
        kind: text(item.kind) ?? "month",
        subject: text(item.subject) ?? "Flagged item",
        metric: text(item.metric),
        month: text(item.month),
        value: decimal(item.value),
        direction: text(item.direction),
        reason,
      }];
    }),
    anomalyMethod: text(value.anomalyMethod),
  };
}

export function normalizeCommentary(value: unknown): Commentary | null {
  if (!isRecord(value)) return null;
  const paragraphs = list(value.paragraphs).flatMap((item): CommentaryParagraph[] => {
    if (!isRecord(item)) return [];
    const body = text(item.text);
    return body ? [{ text: body, factIds: list(item.factIds).flatMap((id) => text(id) ?? []) }] : [];
  });
  const facts = list(value.facts).flatMap((item): CommentaryFact[] => {
    if (!isRecord(item)) return [];
    const id = text(item.id);
    const label = text(item.label);
    const raw = typeof item.value === "number" ? String(item.value) : text(item.value);
    return id && label && raw !== null
      ? [{ id, label, value: raw, unit: text(item.unit), display: text(item.display), href: text(item.href) }] : [];
  });
  return {
    paragraphs,
    facts,
    generatedAt: text(value.generatedAt),
    fallback: value.fallback === true,
    fallbackReason: text(value.fallbackReason),
    label: text(value.label),
    partialPeriod: value.partialPeriod === true,
  };
}

/** The backend answers 200 with a template and this reason when `AI_ASSIST` is off. */
export const AI_OFF_REASON = "ai_disabled";

/** Statuses a deployment without the insights routes (or with the AI features removed) answers with. */
export function commentaryIsOff(error: unknown): boolean {
  return error instanceof ApiError && [404, 501, 503].includes(error.status ?? 0);
}

async function mockModule() {
  return import("./insights-mock");
}
const mockEnabled = () => process.env.NEXT_PUBLIC_INSIGHTS_MOCK === "1";

export async function getInsightsOverview(period: string): Promise<InsightsOverview> {
  const raw = mockEnabled() ? (await mockModule()).mockOverview(period) : await get<unknown>(overviewPath(period));
  const overview = normalizeOverview(raw);
  if (!overview) throw new Error("The insights response was not in the expected shape.");
  return overview;
}

export async function getInsightsCommentary(period: string): Promise<CommentaryResult> {
  try {
    const raw = mockEnabled() ? (await mockModule()).mockCommentary(period) : await get<unknown>(commentaryPath(period));
    if (isRecord(raw) && (raw.enabled === false || raw.aiEnabled === false)) return { status: "off" };
    const commentary = normalizeCommentary(raw);
    if (!commentary) throw new Error("The commentary response was not in the expected shape.");
    if (commentary.fallback && commentary.fallbackReason === AI_OFF_REASON) return { status: "off" };
    return { status: "ready", commentary };
  } catch (error) {
    if (commentaryIsOff(error)) return { status: "off" };
    throw error;
  }
}

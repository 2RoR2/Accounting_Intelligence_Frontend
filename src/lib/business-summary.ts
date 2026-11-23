import type { BusinessSummary } from "@/lib/api/business-summary";

/** Bar and line positions for the six-month trend, on one shared scale (profit may be negative). */
export function trendScale(trend: BusinessSummary["trend"]) {
  const values = trend.flatMap((row) => [Number(row.sales), Number(row.expenses), Number(row.netProfit)]);
  const high = Math.max(0, ...values);
  const low = Math.min(0, ...values);
  const span = high - low || 1;
  return { high, low, span, share: (value: number) => (value - low) / span };
}

/** A party's share of the table total, for the little bar beside each row (never below zero). */
export function shareOfTotal(amount: string, total: string) {
  const whole = Number(total);
  return whole > 0 ? Math.max(0, Math.min(1, Number(amount) / whole)) : 0;
}

/** Short label such as "Nov 26" for a YYYY-MM month code. */
export function monthLabel(code: string) {
  const [year, month] = code.split("-").map(Number);
  if (!year || !month) return code;
  return new Intl.DateTimeFormat("en-MY", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function overdueLabel(days: number) {
  return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

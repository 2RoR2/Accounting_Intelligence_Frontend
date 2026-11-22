/**
 * Figures for the Dashboard in the team's `latest_update` layout, from `GET /api/ledger/profit-and-loss`
 * (posted journals, plus open approved invoices and bills by age) and `GET /api/bank/transactions`.
 *
 * A figure the data cannot give is `null` and is shown as "—" with a hint, never as RM 0.00:
 * income and profit need posted journals, so an empty period is "—", not zero.
 */
import { currencyTotals } from "./api/document-contract";
import type { ProfitAndLossDashboard } from "./api/ledger.service";

export type DashPeriod = "month" | "quarter" | "year" | "30d" | "12m" | "lastMonth" | "lastQuarter" | "lastYear";
export const DASH_PERIODS: Array<[DashPeriod, string]> = [
  ["month", "This Month"], ["quarter", "This Quarter"], ["year", "This Year"], ["30d", "Last 30 Days"],
  ["12m", "Last 12 Months"], ["lastMonth", "Last Month"], ["lastQuarter", "Last Quarter"], ["lastYear", "Last Year"],
];
export interface DashRange { fromDate: string; toDate: string; granularity: "day" | "month" }

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

/** The dates a period covers, ending on `asOf` (YYYY-MM-DD). Up to a month is shown by day, longer by month. */
export function periodRange(period: DashPeriod, asOf: string): DashRange {
  const [y, m, d] = asOf.split("-").map(Number);
  const today = utc(y, m - 1, d);
  const quarter = Math.floor((m - 1) / 3) * 3;
  const ranges: Record<DashPeriod, [Date, Date]> = {
    month: [utc(y, m - 1, 1), today],
    quarter: [utc(y, quarter, 1), today],
    year: [utc(y, 0, 1), today],
    "30d": [utc(y, m - 1, d - 29), today],
    "12m": [utc(y, m - 12, 1), today],
    lastMonth: [utc(y, m - 2, 1), utc(y, m - 1, 0)],
    lastQuarter: [utc(y, quarter - 3, 1), utc(y, quarter, 0)],
    lastYear: [utc(y - 1, 0, 1), utc(y - 1, 11, 31)],
  };
  const [from, to] = ranges[period];
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return { fromDate: iso(from), toDate: iso(to), granularity: days <= 31 ? "day" : "month" };
}

export interface MoneyFigure {
  /** Exact decimal in the home currency, or null when it cannot be worked out. */
  amount: string | null;
  items: number;
  /** Amounts in other currencies are left out of `amount` and counted here. */
  otherCurrencies: number;
}

const PAST_DUE = new Set(["1_30_days", "31_60_days", "61_90_days", "over_90_days"]);
type Aging = ProfitAndLossDashboard["aging"];

function sumIn(rows: Aging, currency: string): MoneyFigure {
  const same = (value: string | null | undefined) => (value ?? "").toUpperCase() === currency.toUpperCase();
  const totals = currencyTotals(rows.map((row) => ({ currency: row.currency, total: row.amount })));
  const home = totals.find((total) => same(total.currency));
  return {
    amount: home?.total ?? "0.00",
    items: rows.filter((row) => same(row.currency)).reduce((n, row) => n + row.itemCount, 0),
    otherCurrencies: totals.filter((total) => total !== home).length,
  };
}

/**
 * Open invoices (receivable) and bills (payable): approved records less settlement allocations.
 * A zero here is real (nothing approved is unpaid), so it is shown; a failed report gives null.
 */
export function agingFigures(aging: Aging | null | undefined, currency: string) {
  if (!aging) {
    const none: MoneyFigure = { amount: null, items: 0, otherCurrencies: 0 };
    return { invoicesOutstanding: none, invoicesOverdue: none, billsOutstanding: none, billsOverdue: none };
  }
  const receivable = aging.filter((row) => row.category === "accounts_receivable");
  const payable = aging.filter((row) => row.category !== "accounts_receivable");
  return {
    invoicesOutstanding: sumIn(receivable, currency),
    invoicesOverdue: sumIn(receivable.filter((row) => PAST_DUE.has(row.bucket)), currency),
    billsOutstanding: sumIn(payable, currency),
    billsOverdue: sumIn(payable.filter((row) => PAST_DUE.has(row.bucket)), currency),
  };
}

/** Income, expenses and net profit in the home currency; null when no journals were posted in the period. */
export function postedTotals(report: ProfitAndLossDashboard | null | undefined, currency: string) {
  return report?.totals.find((row) => row.currency.toUpperCase() === currency.toUpperCase()) ?? null;
}

/** Periods with posted activity in the home currency, oldest first, and their sums (null when there are none). */
export function periodRows(report: ProfitAndLossDashboard | null | undefined, currency: string) {
  const rows = (report?.periods ?? []).filter((row) => row.currency.toUpperCase() === currency.toUpperCase());
  const sum = (key: "income" | "expenses" | "netProfit") => rows.length
    ? currencyTotals(rows.map((row) => ({ currency, total: row[key] })))[0]?.total ?? null
    : null;
  return { rows, income: sum("income"), expenses: sum("expenses"), net: sum("netProfit") };
}

/** "RM 1,250.50" from an exact decimal string; "—" when there is no figure. */
export function rm(amount: string | null | undefined, currency = "MYR") {
  if (amount === null || amount === undefined) return "—";
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return "—";
  const symbol = currency.toUpperCase() === "MYR" ? "RM" : currency.toUpperCase();
  return `${match[1]}${symbol} ${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(match[3] ?? "").padEnd(2, "0").slice(0, 2)}`;
}

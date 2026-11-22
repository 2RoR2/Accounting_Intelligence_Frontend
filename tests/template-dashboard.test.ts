import test from "node:test";
import assert from "node:assert/strict";
import { agingFigures, periodRange, periodRows, postedTotals, rm } from "../src/lib/template-dashboard";
import { importedAccounts } from "../src/features/common/money/bank-accounts";
import type { ProfitAndLossDashboard } from "../src/lib/api/ledger.service";
import type { BankMoneyTransaction } from "../src/types/money";

/** Shaped like backend GET /api/ledger/profit-and-loss. */
const report = (overrides: Partial<ProfitAndLossDashboard> = {}): ProfitAndLossDashboard => ({
  basis: "accrual", fromDate: "2025-12-01", toDate: "2026-11-21", granularity: "month",
  totals: [], periods: [], accrualNote: null, cashBasisNote: null, accounts: [], aging: [], ...overrides,
});

test("period ranges end on the as-of date; up to a month is daily, longer is monthly", () => {
  assert.deepEqual(periodRange("12m", "2026-11-21"), { fromDate: "2025-12-01", toDate: "2026-11-21", granularity: "month" });
  assert.deepEqual(periodRange("month", "2026-11-21"), { fromDate: "2026-11-01", toDate: "2026-11-21", granularity: "day" });
  assert.deepEqual(periodRange("30d", "2026-11-21"), { fromDate: "2026-10-23", toDate: "2026-11-21", granularity: "day" });
  assert.deepEqual(periodRange("lastMonth", "2026-03-15"), { fromDate: "2026-02-01", toDate: "2026-02-28", granularity: "day" });
  assert.deepEqual(periodRange("lastQuarter", "2026-02-10"), { fromDate: "2025-10-01", toDate: "2025-12-31", granularity: "month" });
  assert.deepEqual(periodRange("lastYear", "2026-11-21"), { fromDate: "2025-01-01", toDate: "2025-12-31", granularity: "month" });
});

test("no posted journals gives no figure (—), never RM 0.00", () => {
  const empty = report();
  assert.equal(postedTotals(empty, "MYR"), null);
  assert.equal(periodRows(empty, "MYR").income, null);
  assert.equal(rm(postedTotals(empty, "MYR")?.income), "—");
  assert.equal(rm(null), "—");
});

test("a failed report gives no aging figure; an empty one gives a real zero", () => {
  assert.equal(agingFigures(null, "MYR").invoicesOutstanding.amount, null);
  assert.equal(agingFigures([], "MYR").billsOverdue.amount, "0.00");
});

test("aging splits invoices from bills and overdue from not yet due, in the home currency only", () => {
  const figures = agingFigures([
    { category: "accounts_receivable", currency: "MYR", bucket: "not_due", amount: "100.50", itemCount: 1 },
    { category: "accounts_receivable", currency: "MYR", bucket: "31_60_days", amount: "200.25", itemCount: 2 },
    { category: "accounts_payable", currency: "MYR", bucket: "over_90_days", amount: "10.00", itemCount: 1 },
    { category: "accounts_payable", currency: "USD", bucket: "1_30_days", amount: "99.00", itemCount: 1 },
  ], "MYR");
  assert.deepEqual(figures.invoicesOutstanding, { amount: "300.75", items: 3, otherCurrencies: 0 });
  assert.deepEqual(figures.invoicesOverdue, { amount: "200.25", items: 2, otherCurrencies: 0 });
  assert.deepEqual(figures.billsOutstanding, { amount: "10.00", items: 1, otherCurrencies: 1 });
  assert.equal(figures.billsOverdue.amount, "10.00");
});

test("monthly rows sum exactly and keep losses negative", () => {
  const rows = periodRows(report({ periods: [
    { period: "2026-10-01", currency: "MYR", income: "1000.10", expenses: "400.05", netProfit: "600.05" },
    { period: "2026-11-01", currency: "MYR", income: "0.00", expenses: "700.00", netProfit: "-700.00" },
    { period: "2026-11-01", currency: "USD", income: "5.00", expenses: "0.00", netProfit: "5.00" },
  ] }), "MYR");
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.income, "1000.10");
  assert.equal(rows.net, "-99.95");
  assert.equal(rm(rows.net), "-RM 99.95");
  assert.equal(rm("1234567.5"), "RM 1,234,567.50");
});

test("bank accounts are listed from imported statement lines, totals per currency", () => {
  const line = (id: string, ref: string | null, direction: "money_in" | "money_out", amount: string, postedDate: string) =>
    ({ id, bankAccountRef: ref, direction, amount, currency: "MYR", postedDate, status: "unmatched" }) as unknown as BankMoneyTransaction;
  const accounts = importedAccounts([
    line("1", "MBB-001", "money_in", "100.00", "2026-11-01"),
    line("2", "MBB-001", "money_out", "40.50", "2026-11-03"),
    line("3", null, "money_in", "5.00", "2026-10-01"),
  ]);
  assert.deepEqual(accounts.map((row) => row.ref), ["Account not stated", "MBB-001"]);
  assert.deepEqual(accounts[1], { ref: "MBB-001", lines: 2, lastDate: "2026-11-03", moneyIn: "MYR 100.00", moneyOut: "MYR 40.50" });
  assert.equal(accounts[0].moneyOut, "—");
});

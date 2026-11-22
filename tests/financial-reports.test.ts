import assert from "node:assert/strict";
import test from "node:test";
import { statementRows } from "../src/features/common/reports/financial-report-rows";
import { financialReportPath, monthPackPath, type FinancialReportQuery } from "../src/lib/api/financial-report-query";

test("financial reports use the contract endpoints and filter names for JSON and downloads", () => {
  const range = { fromDate: "2026-04-01", toDate: "2026-04-30" };
  const asOf = "2026-04-30";
  const requests: Array<[FinancialReportQuery, string]> = [
    [{ report: "profit-and-loss", ...range }, "profit-and-loss?fromDate=2026-04-01&toDate=2026-04-30"],
    [{ report: "balance-sheet", asOf }, "balance-sheet?asOf=2026-04-30"],
    [{ report: "general-ledger", ...range }, "general-ledger?fromDate=2026-04-01&toDate=2026-04-30"],
    [{ report: "receivables-ageing", asOf }, "ageing?type=receivables&asOf=2026-04-30"],
    [{ report: "payables-ageing", asOf }, "ageing?type=payables&asOf=2026-04-30"],
    [{ report: "tax-summary", ...range }, "tax-summary?fromDate=2026-04-01&toDate=2026-04-30"],
  ];
  for (const [query, suffix] of requests) {
    const path = `/api/reports/financial/${suffix}`;
    assert.equal(financialReportPath(query), path);
    assert.equal(financialReportPath(query, "csv"), `${path}&format=csv`);
    assert.equal(financialReportPath(query, "xlsx"), `${path}&format=xlsx`);
  }
});

test("the ledger account filter is encoded and month pack only needs a period code", () => {
  assert.equal(financialReportPath({
    report: "general-ledger",
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    accountId: "a/b + c",
  }, "xlsx"), "/api/reports/financial/general-ledger?fromDate=2026-04-01&toDate=2026-04-30&accountId=a%2Fb+%2B+c&format=xlsx");
  assert.equal(monthPackPath("2026-04"), "/api/reports/month-pack?period=2026-04");
  assert.equal(monthPackPath("2026-04&format=csv"), "/api/reports/month-pack?period=2026-04%26format%3Dcsv");
});

test("statement formatting keeps account names, decimal amounts and supplied subtotals", () => {
  const section = {
    key: "income",
    label: "Other Income",
    accounts: [{ accountId: "a1", code: "4000", name: "Interest", amount: "-1234.50" }],
    total: "-1234.50",
  };
  assert.deepEqual(statementRows(section), {
    rows: [{ key: "account-a1", label: "4000 · Interest", amount: "-1234.50" }],
    subtotal: { label: "Total other income", amount: "-1234.50" },
  });
});

test("current year earnings appear in equity without recalculating the backend subtotal", () => {
  const equity = {
    key: "equity",
    label: "Equity",
    accounts: [{ accountId: "e1", code: "3000", name: "Capital", amount: "500.00" }],
    total: "466.20",
  };
  assert.deepEqual(statementRows(equity, "-33.80"), {
    rows: [
      { key: "account-e1", label: "3000 · Capital", amount: "500.00" },
      { key: "earnings", label: "Current year earnings", amount: "-33.80" },
    ],
    subtotal: { label: "Total equity", amount: "466.20" },
  });
  const assets = { key: "assets", label: "Assets", accounts: [], total: "0.00" };
  assert.deepEqual(statementRows(assets, "0.00").rows, []);
  assert.deepEqual(statementRows(equity, "0.00").rows.at(-1), {
    key: "earnings", label: "Current year earnings", amount: "0.00",
  });
});

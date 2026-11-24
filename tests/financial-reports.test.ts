import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { statementRows } from "../src/features/common/reports/financial-report-rows";
import { FinancialReportTable } from "../src/features/common/reports/financial-report-tables";
import { financialReportPath, monthPackPath, type FinancialReportQuery } from "../src/lib/api/financial-report-query";
import type { FinancialReport } from "../src/lib/api/reports.service";

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

test("the ledger account filter is encoded and the Monthly Accounting Pack only needs a period code", () => {
  assert.equal(financialReportPath({
    report: "general-ledger",
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    accountId: "a/b + c",
  }, "xlsx"), "/api/reports/financial/general-ledger?fromDate=2026-04-01&toDate=2026-04-30&accountId=a%2Fb+%2B+c&format=xlsx");
  assert.equal(monthPackPath("2026-04"), "/api/reports/month-pack?period=2026-04");
  assert.equal(monthPackPath("FY26-Q2"), "/api/reports/month-pack?period=FY26-Q2");
  assert.equal(monthPackPath("2026-04&format=csv"), "/api/reports/month-pack?period=2026-04%26format%3Dcsv");
});

test("statement formatting keeps account names, decimal amounts and supplied subtotals", () => {
  const section = {
    key: "income",
    label: "Other Income",
    accounts: [{ accountId: "a1", code: "4000", name: "Interest", amount: "-1234.50" }],
    total: "-1234.50",
  };
  assert.deepEqual(statementRows(section, "profit-and-loss"), {
    rows: [{ key: "account-a1", label: "4000 · Interest", amount: "-1234.50" }],
    subtotal: { label: "Total Other Income", amount: "-1234.50" },
  });
});

test("profit and loss shows section subtotals separately from report totals", () => {
  const report: FinancialReport = {
    report: "profit-and-loss",
    data: {
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      sections: [
        { key: "Income", label: "Income", accounts: [], total: "500.00" },
        { key: "Expenses", label: "Expenses", accounts: [], total: "30.00" },
        { key: "Cost of Sales", label: "Cost of Sales", accounts: [], total: "150.00" },
      ],
      totalIncome: "500.00",
      totalExpenses: "180.00",
      netProfit: "320.00",
    },
  };
  const html = renderToStaticMarkup(createElement(FinancialReportTable, report));
  const sectionTotals = [...html.matchAll(/<tbody>.*?<th scope="row">([^<]+)<\/th>.*?<\/tbody>/g)];
  assert.deepEqual(sectionTotals.map((match) => match[1]), ["Subtotal", "Subtotal", "Total Cost of Sales"]);
  const footer = html.match(/<tfoot[^>]*>(.*?)<\/tfoot>/)?.[1] ?? "";
  assert.deepEqual([...footer.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((match) => match[1]), [
    "Total income", "Total expenses", "Net profit",
  ]);
});

test("equity shows each API earnings row once and the rows sum to the subtotal", () => {
  const equity = {
    key: "equity" as const,
    label: "Equity",
    accounts: [
      { accountId: "e1", code: "3000", name: "Capital", amount: "500.00" },
      { accountId: "retained-earnings", code: "", name: "Retained earnings (prior years)", amount: "100.20" },
      { accountId: "current-year-earnings", code: "", name: "Current year earnings", amount: "-33.80" },
    ],
    total: "566.40",
  };
  const result = statementRows(equity, "balance-sheet");
  assert.deepEqual(result, {
    rows: [
      { key: "account-e1", label: "3000 · Capital", amount: "500.00" },
      { key: "account-retained-earnings", label: "Retained earnings (prior years)", amount: "100.20" },
      { key: "account-current-year-earnings", label: "Current year earnings", amount: "-33.80" },
    ],
    subtotal: { label: "Total equity", amount: "566.40" },
  });
  const cents = (amount: string) => Math.round(Number(amount) * 100);
  assert.equal(result.rows.reduce((sum, row) => sum + cents(row.amount), 0), cents(result.subtotal.amount));

  const html = renderToStaticMarkup(createElement(FinancialReportTable, {
    report: "balance-sheet",
    data: {
      asOf: "2026-04-30",
      sections: [equity],
      retainedEarnings: "100.20",
      currentYearEarnings: "-33.80",
      totalAssets: "0.00",
      totalLiabilitiesAndEquity: equity.total,
      balanced: false,
    },
  }));
  assert.equal(html.split("Retained earnings (prior years)").length - 1, 1);
  assert.equal(html.split("Current year earnings").length - 1, 1);
});

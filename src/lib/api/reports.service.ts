import { download, get } from "./client";
import { financialReportPath, monthPackPath, type FinancialReportQuery, type ReportFormat } from "./financial-report-query";
import type { User } from "@/types";

export type AccountingReport = { key: string; title: string; count: number };
export type AccountingReports = {
  cards: AccountingReport[];
  summary: { documentCount: number; totalAmount: number; lineAmount: number; openExceptions: number };
  documents: Array<{ reference: string; kind: string; status: string; date: string }>;
};

export function getAccountingReports(user: User) {
  void user;
  return get<AccountingReports>("/api/reports/accounting");
}

export type FinancialSection = {
  key: string;
  label: string;
  accounts: Array<{ accountId: string; code: string; name: string; amount: string }>;
  total: string;
};

type ProfitAndLoss = {
  fromDate: string;
  toDate: string;
  sections: FinancialSection[];
  totalIncome: string;
  totalExpenses: string;
  netProfit: string;
};

type BalanceSheet = {
  asOf: string;
  sections: Array<FinancialSection & { key: "assets" | "liabilities" | "equity" }>;
  retainedEarnings: string;
  currentYearEarnings: string;
  totalAssets: string;
  totalLiabilitiesAndEquity: string;
  balanced: boolean;
};

export type GeneralLedger = {
  fromDate: string;
  toDate: string;
  accounts: Array<{
    accountId: string;
    code: string;
    name: string;
    openingBalance: string;
    lines: Array<{ date: string; journalId: string; description: string; sourceType: string; debit: string; credit: string; balance: string }>;
    closingBalance: string;
  }>;
};

type AgeingBuckets = ["current", "1-30", "31-60", "61-90", "90+"];
export type AgeingBucket = AgeingBuckets[number];
export type Ageing = {
  type: "receivables" | "payables";
  asOf: string;
  buckets: AgeingBuckets;
  rows: Array<{
    contactName: string;
    source: "typed" | "scanned" | "opening";
    documentNumber: string;
    documentDate: string;
    dueDate: string | null;
    outstanding: string;
    bucket: AgeingBucket;
  }>;
  totals: Record<AgeingBucket | "total", string>;
};

type TaxAmounts = { outputTax: string; inputTax: string; net: string };
export type TaxSummary = {
  fromDate: string;
  toDate: string;
  note: "Recorded tax only - not a tax return";
  months: Array<TaxAmounts & { month: string }>;
  totals: TaxAmounts;
};

export type FinancialReport =
  | { report: "profit-and-loss"; data: ProfitAndLoss }
  | { report: "balance-sheet"; data: BalanceSheet }
  | { report: "general-ledger"; data: GeneralLedger }
  | { report: "receivables-ageing" | "payables-ageing"; data: Ageing }
  | { report: "tax-summary"; data: TaxSummary };

export async function getFinancialReport(query: FinancialReportQuery): Promise<FinancialReport> {
  const path = financialReportPath(query);
  const { report } = query;
  switch (report) {
    case "profit-and-loss": return { report, data: await get<ProfitAndLoss>(path) };
    case "balance-sheet": return { report, data: await get<BalanceSheet>(path) };
    case "general-ledger": return { report, data: await get<GeneralLedger>(path) };
    case "receivables-ageing":
    case "payables-ageing": return { report, data: await get<Ageing>(path) };
    case "tax-summary": return { report, data: await get<TaxSummary>(path) };
  }
}

export function downloadFinancialReport(query: FinancialReportQuery, format: ReportFormat) {
  return download(financialReportPath(query, format), `${query.report}.${format}`);
}

export function downloadMonthPack(period: string) {
  return download(monthPackPath(period), `month-pack-${period}.xlsx`);
}

type DateRange = { fromDate: string; toDate: string };
export type FinancialReportQuery =
  | ({ report: "profit-and-loss" | "tax-summary" } & DateRange)
  | ({ report: "general-ledger"; accountId?: string } & DateRange)
  | { report: "balance-sheet" | "receivables-ageing" | "payables-ageing"; asOf: string };
export type ReportFormat = "csv" | "xlsx";

export function financialReportPath(query: FinancialReportQuery, format?: ReportFormat) {
  const { report } = query;
  const isAgeing = report === "receivables-ageing" || report === "payables-ageing";
  const params = new URLSearchParams();
  if (isAgeing) params.set("type", report === "receivables-ageing" ? "receivables" : "payables");
  if ("asOf" in query) {
    params.set("asOf", query.asOf);
  } else {
    params.set("fromDate", query.fromDate);
    params.set("toDate", query.toDate);
    if (query.report === "general-ledger" && query.accountId) params.set("accountId", query.accountId);
  }
  if (format) params.set("format", format);

  return `/api/reports/financial/${isAgeing ? "ageing" : report}?${params}`;
}

export function monthPackPath(period: string) {
  return `/api/reports/month-pack?${new URLSearchParams({ period })}`;
}

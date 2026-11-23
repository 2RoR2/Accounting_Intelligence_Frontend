import { get } from "./client";

/** Money arrives as 2-decimal strings from the backend; nothing here recalculates a posted figure. */
export type SummaryParty = { name: string; amount: string; entries: number; named: boolean };
export type SummaryProduct = { name: string; sku: string | null; quantity: string | null; amount: string; named: boolean };
export type SummaryOverdue = {
  contactName: string;
  documentNumber: string;
  documentDate: string;
  dueDate: string | null;
  outstanding: string;
  daysOverdue: number;
};
export type SummaryOwed = {
  total: string;
  overdue: string;
  overdueCount: number;
  openCount: number;
  buckets: Record<string, string>;
};
export type SummaryPosition = {
  asOf: string;
  bank: { asOf: string; accounts: Array<{ accountId: string; code: string; name: string; balance: string }>; total: string };
  receivables: SummaryOwed;
  payables: SummaryOwed;
};
export type SummaryResult = {
  sales: string;
  expenses: string;
  costOfSales: string;
  operatingExpenses: string;
  grossProfit: string;
  netProfit: string;
  costOfSalesTracked: boolean;
  cashIn: string;
  cashOut: string;
  position: SummaryPosition;
};
export type BusinessSummary = {
  company: string;
  currency: "MYR";
  date: string;
  monthCode: string;
  profitNote: string;
  today: SummaryResult & { date: string };
  month: SummaryResult & {
    fromDate: string;
    toDate: string;
    recordedTax: { outputTax: string; inputTax: string; net: string; note: string };
  };
  topCustomers: SummaryParty[];
  topSuppliers: SummaryParty[];
  overdueInvoices: SummaryOverdue[];
  overdueBills: SummaryOverdue[];
  trend: Array<{ month: string; fromDate: string; toDate: string; sales: string; expenses: string; netProfit: string }>;
  salesByCustomer: SummaryParty[];
  purchasesBySupplier: SummaryParty[];
  salesByProduct: SummaryProduct[];
};

/** `month` is YYYY-MM; leave it out for the company's current month. */
export function businessSummaryPath(month?: string) {
  return `/api/reports/business-summary${month ? `?${new URLSearchParams({ month })}` : ""}`;
}

export function getBusinessSummary(month?: string) {
  return get<BusinessSummary>(businessSummaryPath(month));
}

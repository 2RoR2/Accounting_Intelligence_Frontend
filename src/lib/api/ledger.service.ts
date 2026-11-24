import { api, get, post } from "./client";

export type LedgerAccount = { id: string; code: string; name: string; accountType: string };
export type AccountingPeriodInput = { periodCode: string; startsOn: string; endsOn: string };
export type AccountingPeriod = AccountingPeriodInput & { id: string; status: "open" | "closed" };
export type JournalLineInput = { accountId: string; debit?: string; credit?: string; description?: string; sourceField?: string | null };
export type Journal = { id: string; periodId: string; sourceType: string; sourceId?: string | null; status: string; date: string; description: string; totalDebit: string; totalCredit: string; idempotencyKey: string };
export type Settlement = { id: string; settlementRef: string; date?: string; direction: "money_in" | "money_out"; amount: string; allocated: string; unmatchedAmount: string; currency: string; status: string };
export type Allocation = { id: string; settlementId: string; settlementRef: string; recordId: string; amount: string; currency: string; direction: string; status: string; unmatchedSettlementAmount: string; createdAt: string; reversedAt?: string | null; reversalReason?: string | null };
export type TrialBalanceRow = { accountId: string; code: string; name: string; accountType: string; totalDebit: string; totalCredit: string; netBalance: string };
export type AccountClass = "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
export type ChartAccountInput = { code: string; name: string; accountClass: AccountClass; parentId?: string | null };
export type ChartAccount = ChartAccountInput & { id: string; isActive: boolean };
type ProfitAndLossTotal = { currency: string; income: string; expenses: string; netProfit: string };
export type ProfitAndLossDashboard = {
  basis: "accrual" | "cash";
  fromDate: string;
  toDate: string;
  granularity: "day" | "week" | "month";
  totals: ProfitAndLossTotal[];
  periods: Array<ProfitAndLossTotal & { period: string }>;
  accrualNote: string | null;
  cashBasisNote: string | null;
  /** Posted income and expense by account. */
  accounts: Array<{ currency: string; accountType: string; accountCode: string; accountName: string; amount: string }>;
  /** Open approved invoices (accounts_receivable) and bills by age bucket, e.g. "not_due", "1_30_days". */
  aging: Array<{ category: string; currency: string; bucket: string; amount: string; itemCount: number }>;
};
export type JournalPosting = { id: string; status: string; idempotent: boolean };

export const getChartAccounts = (includeInactive = false) =>
  api<ChartAccount[]>(`/api/chart-of-accounts?includeInactive=${includeInactive}`);
export const createChartAccount = (input: ChartAccountInput) =>
  api<ChartAccount>("/api/chart-of-accounts", { method: "POST", body: JSON.stringify(input) });
export const getProfitAndLossDashboard = (fromDate: string, toDate: string, basis: "accrual" | "cash" = "accrual", granularity: "day" | "week" | "month" = "month") =>
  api<ProfitAndLossDashboard>(`/api/ledger/profit-and-loss?${new URLSearchParams({ fromDate, toDate, basis, granularity })}`);
export const createManualJournal = (input: {
  periodId: string; idempotencyKey: string; journalDate: string; description: string; lines: JournalLineInput[];
}) => api<JournalPosting>("/api/ledger/journals", {
  method: "POST", body: JSON.stringify({ ...input, sourceType: "manual" }),
});
export const postSupplierPayment = (transactionId: string, input: {
  periodId: string; payableAccountId: string; bankAccountId: string; journalDate: string;
}) => api<JournalPosting & { recordId: string | null; settlementId: string; amount: string; currency: string }>(
  `/api/ledger/journals/from-supplier-payment/${encodeURIComponent(transactionId)}`,
  { method: "POST", body: JSON.stringify(input) },
);

export type JournalDetail = {
  id: string; date: string; description: string; status: string; sourceType: string; periodCode: string | null;
  postedBy: string | null; postedAt: string | null; reversesJournalId: string | null; reversedByJournalId: string | null;
  source: { kind: string; type: string; id: string; number: string; amount?: string | null } | null;
  totalDebit: string; totalCredit: string; balanced: boolean;
  lines: Array<{ lineNumber: number; accountId: string; code: string; name: string; accountType: string; description: string; debit: string; credit: string }>;
};
export const getLedgerJournal = (id: string) => get<JournalDetail>(`/api/ledger/journals/${encodeURIComponent(id)}`);
export const getLedgerAccounts = () => api<LedgerAccount[]>("/api/ledger/accounts");
const periodsPath = "/api/ledger/periods";
export const getAccountingPeriods = () => get<AccountingPeriod[]>(periodsPath);
export const createAccountingPeriod = (input: AccountingPeriodInput) => post<AccountingPeriod>(periodsPath, input);
export const closeAccountingPeriod = (id: string, reason?: string) =>
  post<AccountingPeriod>(`${periodsPath}/${encodeURIComponent(id)}/close`, { reason });
export const reopenAccountingPeriod = (id: string, reason: string) =>
  post<AccountingPeriod>(`${periodsPath}/${encodeURIComponent(id)}/reopen`, { reason });
export const getLedgerJournals = () => api<Journal[]>("/api/ledger/journals");
export const getSettlements = () => api<Settlement[]>("/api/ledger/settlements");
export const getAllocations = () => api<Allocation[]>("/api/ledger/allocations");
export const getTrialBalance = () => api<TrialBalanceRow[]>("/api/ledger/trial-balance");

export const createSettlementFromBank = (transactionId: string) =>
  api(`/api/ledger/settlements/from-bank/${encodeURIComponent(transactionId)}`, { method: "POST" });

export const allocateSettlement = (settlementId: string, recordId: string, amount: string) =>
  api("/api/ledger/allocations", { method: "POST", body: JSON.stringify({ settlementId, recordId, amount }) });

export const reverseAllocation = (allocationId: string) =>
  api(`/api/ledger/allocations/${encodeURIComponent(allocationId)}/reverse`, { method: "POST" });

export const reverseJournal = (journalId: string) =>
  api(`/api/ledger/journals/${encodeURIComponent(journalId)}/reverse`, { method: "POST" });

export const postSupplierBill = (recordId: string, payload: { periodId: string; expenseAccountId: string; payableAccountId: string; journalDate: string; description?: string }) =>
  api(`/api/ledger/journals/from-supplier-bill/${encodeURIComponent(recordId)}`, { method: "POST", body: JSON.stringify(payload) });

export const postCustomerInvoice = (recordId: string, payload: { periodId: string; receivableAccountId: string; revenueAccountId: string; journalDate: string; description?: string }) =>
  api(`/api/ledger/journals/from-customer-invoice/${encodeURIComponent(recordId)}`, { method: "POST", body: JSON.stringify(payload) });

export const postDocumentAdjustment = (recordId: string, payload: { periodId: string; debitAccountId: string; creditAccountId: string; amount: string; journalDate: string; adjustmentKind: "credit_note" | "debit_note"; description?: string }) =>
  api(`/api/ledger/journals/from-adjustment/${encodeURIComponent(recordId)}`, { method: "POST", body: JSON.stringify(payload) });

export const createSettlement = (payload: { settlementRef: string; settlementDate: string; direction: "money_in" | "money_out"; amount: string; currency: string; sourceType: "bank_import" | "manual_record" | "document_evidence"; sourceId?: string }) =>
  api("/api/ledger/settlements", { method: "POST", body: JSON.stringify(payload) });

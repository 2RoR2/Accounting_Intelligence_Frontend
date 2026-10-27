import type { User } from "@/types";
import { api, get } from "@/lib/api/client";
import type {
  BankMoneyTransaction,
  BankMoneyTransactionDetail,
  BankReconciliationCandidate,
  CashSummary,
  MoneyDirection,
} from "@/types/money";

type BankTransactionResponse = Omit<BankMoneyTransaction, "amount" | "amountDelta" | "currency" | "createdAt"> & {
  amount: string | null;
  amountDelta: string | null;
  currency: string | null;
  createdAt: string | null;
  importId: string;
  sourceRow: number;
  candidateId?: string | null;
  expectedRevision?: number | null;
  candidates?: BankReconciliationCandidate[];
};

function mapTransaction(row: BankTransactionResponse): BankMoneyTransactionDetail {
  return {
    ...row,
    amount: row.amount,
    amountDelta: row.amountDelta,
    currency: row.currency,
    createdAt: row.createdAt,
    candidates: row.candidates ?? [],
    candidateId: row.candidateId ?? null,
    expectedRevision: row.expectedRevision ?? null,
  };
}

export async function getMoneyTransactions(
  _user: User,
  direction: MoneyDirection,
): Promise<BankMoneyTransaction[]> {
  const rows = await get<BankTransactionResponse[]>(
    `/api/bank-transactions?direction=${encodeURIComponent(direction)}&limit=500&offset=0`,
  );
  return rows.map(mapTransaction);
}

export async function getMoneyTransactionDetail(
  _user: User,
  id: string,
): Promise<BankMoneyTransactionDetail | undefined> {
  const row = await get<BankTransactionResponse>(`/api/bank-transactions/${encodeURIComponent(id)}`);
  return mapTransaction(row);
}

export async function decideMatch(
  _user: User,
  candidateId: string,
  decision: "confirm" | "reject",
  expectedRevision: number,
  reason?: string,
): Promise<BankMoneyTransactionDetail> {
  const row = await api<BankTransactionResponse>(`/api/reconciliation/${encodeURIComponent(candidateId)}/decision`, {
    method: "POST",
    body: JSON.stringify({
      decision,
      expectedRevision,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    }),
  });
  return mapTransaction(row);
}

export interface BankImportPreview {
  importId: string;
  rowCount: number;
  duplicateRowsSkipped: number;
  needsReviewCount: number;
  canConfirm: boolean;
  status: "previewed";
  sampleRows: Array<{
    sourceRow: number;
    postedDate: string | null;
    description: string;
    reference: string | null;
    debit: string | null;
    credit: string | null;
    direction: MoneyDirection | null;
    currency: string | null;
    status: string;
    reviewReasons: string[];
  }>;
}

export async function previewBankImport(
  _user: User,
  file: File,
  accountRef: string,
  mapping: Record<string, string>,
  dateFormat: "iso" | "dmy" | "mdy",
): Promise<BankImportPreview> {
  const form = new FormData();
  form.set("file", file);
  form.set("source_bank_account_ref", accountRef);
  form.set("mapping", JSON.stringify(mapping));
  form.set("date_format", dateFormat);
  return api<BankImportPreview>("/api/bank-imports/preview", { method: "POST", body: form });
}

export async function confirmBankImport(_user: User, importId: string) {
  return api<{ importId: string; status: string; rowCount: number; candidatesProposed: number }>(
    `/api/bank-imports/${encodeURIComponent(importId)}/confirm`,
    { method: "POST" },
  );
}

export async function discardBankImportPreview(_user: User, importId: string) {
  return api<{ importId: string; status: string }>(
    `/api/bank-imports/${encodeURIComponent(importId)}/discard`,
    { method: "POST" },
  );
}

export async function ignoreBankTransaction(_user: User, id: string): Promise<boolean> {
  const result = await api<{ id: string; status: string }>(
    `/api/bank-transactions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return result.status === "ignored";
}

export async function getCashSummary(_user: User): Promise<CashSummary> {
  void _user;
  return get<CashSummary>("/api/bank-transactions/summary");
}

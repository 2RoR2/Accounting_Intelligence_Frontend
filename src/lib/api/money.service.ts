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
    `/api/bank/transactions?direction=${encodeURIComponent(direction)}`,
  );
  return rows.map(mapTransaction);
}

export async function getMoneyTransactionDetail(
  _user: User,
  id: string,
): Promise<BankMoneyTransactionDetail | undefined> {
  const row = await get<BankTransactionResponse>(`/api/bank/transactions/${encodeURIComponent(id)}`);
  return mapTransaction(row);
}

export async function decideMatch(
  _user: User,
  candidateId: string,
  decision: "confirm" | "reject",
  expectedRevision: number,
  reason?: string,
): Promise<BankMoneyTransactionDetail> {
  const row = await api<BankTransactionResponse>(`/api/bank/reconciliation/candidates/${encodeURIComponent(candidateId)}/decision`, {
    method: "POST",
    body: JSON.stringify({
      candidateId,
      decision: decision === "confirm" ? "confirmed" : "rejected",
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
  return api<BankImportPreview>("/api/bank/imports", { method: "POST", body: form });
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
    `/api/bank/transactions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return result.status === "ignored";
}

export async function getCashSummary(_user: User): Promise<CashSummary> {
  void _user;
  const rows = await get<BankTransactionResponse[]>("/api/bank/transactions");
  const currencies = new Map<string | null, CashSummary["currencies"][number]>();
  for (const row of rows) {
    const item = currencies.get(row.currency) ?? { currency: row.currency, moneyIn: "0.00", moneyOut: "0.00", verifiedIn: "0.00", verifiedOut: "0.00" };
    if (row.direction === "money_in") item.moneyIn = addMoney(item.moneyIn, row.amount ?? "0.00");
    if (row.direction === "money_out") item.moneyOut = addMoney(item.moneyOut, row.amount ?? "0.00");
    if (row.status === "matched" && row.direction === "money_in") item.verifiedIn = addMoney(item.verifiedIn, row.amount ?? "0.00");
    if (row.status === "matched" && row.direction === "money_out") item.verifiedOut = addMoney(item.verifiedOut, row.amount ?? "0.00");
    currencies.set(row.currency, item);
  }
  return { currencies: [...currencies.values()] };
}

function addMoney(left: string, right: string): string {
  const cents = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  };
  const total = cents(left) + cents(right);
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
}

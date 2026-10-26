import type { User } from "@/types";
import type {
  BankMoneyTransaction,
  BankMoneyTransactionDetail,
  MoneyDirection,
  MatchStatus,
} from "@/types/money";

/**
 * Dummy data for client demo of the Money In / Money Out interface.
 * Shape matches the existing backend bank_transactions + reconciliation model.
 *
 * Backend friend: replace these functions with real calls once the endpoints
 * are ready, for example:
 *   GET  /api/bank-transactions?direction=money_in|money_out
 *   GET  /api/bank-transactions/{id}
 *   POST /api/bank-imports                     (upload statement)
 *   POST /api/reconciliation/decisions         (confirm / reject)
 */
let MOCK: BankMoneyTransactionDetail[] = [
  {
    id: "bt-001",
    tenantId: "t1",
    direction: "money_in",
    postedDate: "2026-10-20",
    description: "Payment from ABC Trading",
    reference: "INV-1001",
    amount: 1500,
    currency: "MYR",
    status: "matched",
    matchStatus: "matched",
    bankAccountRef: "Maybank Current",
    relatedRecordId: "rec-101",
    relatedRecordCode: "REC-10070",
    relatedDocumentId: "doc-101",
    relatedDocumentCode: "INVOICE_100001",
    amountDelta: 0,
    createdAt: "2026-10-20T09:15:00Z",
    importId: "imp-1",
    sourceRow: 12,
  },
  {
    id: "bt-002",
    tenantId: "t1",
    direction: "money_out",
    postedDate: "2026-10-21",
    description: "Office Supplies Co",
    reference: "BILL-55",
    amount: 320,
    currency: "MYR",
    status: "matched",
    matchStatus: "matched",
    bankAccountRef: "Maybank Current",
    relatedRecordId: "rec-202",
    relatedRecordCode: "REC-10081",
    relatedDocumentId: "doc-202",
    relatedDocumentCode: "BILL_100012",
    amountDelta: 0,
    createdAt: "2026-10-21T11:02:00Z",
    importId: "imp-1",
    sourceRow: 18,
  },
  {
    id: "bt-003",
    tenantId: "t1",
    direction: "money_in",
    postedDate: "2026-10-22",
    description: "XYZ Services",
    reference: "INV-1008",
    amount: 800,
    currency: "MYR",
    status: "proposed",
    matchStatus: "proposed",
    bankAccountRef: "Maybank Current",
    relatedRecordId: "rec-108",
    relatedRecordCode: "REC-10088",
    relatedDocumentId: "doc-108",
    relatedDocumentCode: "INVOICE_100008",
    amountDelta: 0,
    createdAt: "2026-10-22T14:30:00Z",
    importId: "imp-1",
    sourceRow: 24,
  },
  {
    id: "bt-004",
    tenantId: "t1",
    direction: "money_out",
    postedDate: "2026-10-23",
    description: "Unknown transfer",
    reference: "REF-9921",
    amount: 150,
    currency: "MYR",
    status: "imported",
    matchStatus: "unmatched",
    bankAccountRef: "Maybank Current",
    relatedRecordId: null,
    relatedRecordCode: null,
    relatedDocumentId: null,
    relatedDocumentCode: null,
    amountDelta: null,
    createdAt: "2026-10-23T08:45:00Z",
    importId: "imp-1",
    sourceRow: 31,
  },
  {
    id: "bt-005",
    tenantId: "t1",
    direction: "money_in",
    postedDate: "2026-10-24",
    description: "Cash deposit",
    reference: null,
    amount: 500,
    currency: "MYR",
    status: "needs_review",
    matchStatus: "unmatched",
    bankAccountRef: "Maybank Current",
    relatedRecordId: null,
    relatedRecordCode: null,
    relatedDocumentId: null,
    relatedDocumentCode: null,
    amountDelta: null,
    createdAt: "2026-10-24T10:10:00Z",
    importId: "imp-1",
    sourceRow: 35,
  },
];

export async function getMoneyTransactions(
  _user: User,
  direction: MoneyDirection,
): Promise<BankMoneyTransaction[]> {
  // TODO (backend): replace with GET /api/bank-transactions?direction=...
  await new Promise((r) => setTimeout(r, 80));
  return MOCK.filter((t) => t.direction === direction).map(
    ({ importId: _i, sourceRow: _s, ...rest }) => rest,
  );
}

export async function getMoneyTransactionDetail(
  _user: User,
  id: string,
): Promise<BankMoneyTransactionDetail | undefined> {
  // TODO (backend): replace with GET /api/bank-transactions/{id}
  await new Promise((r) => setTimeout(r, 40));
  return MOCK.find((t) => t.id === id);
}

/** Confirm or reject a proposed match. Demo only — updates local dummy data. */
export async function decideMatch(
  _user: User,
  id: string,
  decision: "confirm" | "reject",
): Promise<BankMoneyTransactionDetail | undefined> {
  // TODO (backend): replace with POST /api/reconciliation/decisions
  await new Promise((r) => setTimeout(r, 120));
  const row = MOCK.find((t) => t.id === id);
  if (!row) return undefined;
  if (decision === "confirm") {
    row.matchStatus = "matched";
    row.status = "matched";
    row.amountDelta = row.amountDelta ?? 0;
  } else {
    row.matchStatus = "unmatched";
    row.status = "imported";
    row.relatedRecordId = null;
    row.relatedRecordCode = null;
    row.relatedDocumentId = null;
    row.relatedDocumentCode = null;
    row.amountDelta = null;
  }
  return { ...row };
}

/**
 * Import a bank statement. Demo only — adds a few sample rows so the client
 * can see the result immediately. Real parsing stays with the backend.
 */
export async function importBankStatement(
  _user: User,
  fileName: string,
): Promise<{ added: number; fileName: string }> {
  // TODO (backend): replace with POST /api/bank-imports (multipart file)
  await new Promise((r) => setTimeout(r, 200));
  const now = new Date().toISOString();
  const extra: BankMoneyTransactionDetail[] = [
    {
      id: `bt-imp-${Date.now()}-1`,
      tenantId: "t1",
      direction: "money_in",
      postedDate: "2026-10-25",
      description: `Imported credit from ${fileName}`,
      reference: "IMP-IN-001",
      amount: 2400,
      currency: "MYR",
      status: "proposed",
      matchStatus: "proposed",
      bankAccountRef: "Maybank Current",
      relatedRecordId: "rec-120",
      relatedRecordCode: "REC-10120",
      relatedDocumentId: "doc-120",
      relatedDocumentCode: "INVOICE_100120",
      amountDelta: 0,
      createdAt: now,
      importId: "imp-demo",
      sourceRow: 1,
    },
    {
      id: `bt-imp-${Date.now()}-2`,
      tenantId: "t1",
      direction: "money_out",
      postedDate: "2026-10-25",
      description: `Imported debit from ${fileName}`,
      reference: "IMP-OUT-002",
      amount: 180,
      currency: "MYR",
      status: "imported",
      matchStatus: "unmatched",
      bankAccountRef: "Maybank Current",
      relatedRecordId: null,
      relatedRecordCode: null,
      relatedDocumentId: null,
      relatedDocumentCode: null,
      amountDelta: null,
      createdAt: now,
      importId: "imp-demo",
      sourceRow: 2,
    },
  ];
  MOCK = [...extra, ...MOCK];
  return { added: extra.length, fileName };
}

/** Remove a bank row (for example a wrong import). Demo only. */
export async function deleteBankTransaction(
  _user: User,
  id: string,
): Promise<boolean> {
  // TODO (backend): replace with DELETE /api/bank-transactions/{id}
  await new Promise((r) => setTimeout(r, 80));
  const before = MOCK.length;
  MOCK = MOCK.filter((t) => t.id !== id);
  return MOCK.length < before;
}

export async function getCashSummary(_user: User): Promise<{
  moneyIn: number;
  moneyOut: number;
  verifiedIn: number;
  verifiedOut: number;
}> {
  // TODO (backend): replace with GET /api/bank-transactions/summary
  await new Promise((r) => setTimeout(r, 40));
  const moneyIn = MOCK.filter((t) => t.direction === "money_in").reduce((s, t) => s + t.amount, 0);
  const moneyOut = MOCK.filter((t) => t.direction === "money_out").reduce((s, t) => s + t.amount, 0);
  const verifiedIn = MOCK.filter((t) => t.direction === "money_in" && t.matchStatus === "matched").reduce((s, t) => s + t.amount, 0);
  const verifiedOut = MOCK.filter((t) => t.direction === "money_out" && t.matchStatus === "matched").reduce((s, t) => s + t.amount, 0);
  return { moneyIn, moneyOut, verifiedIn, verifiedOut };
}

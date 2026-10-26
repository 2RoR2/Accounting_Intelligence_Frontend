import type { User } from "@/types";
import type {
  BankMoneyTransaction,
  BankMoneyTransactionDetail,
  MoneyDirection,
} from "@/types/money";

/**
 * Dummy data for client demo of the Money In / Money Out interface.
 * Shape matches the existing backend bank_transactions + reconciliation model.
 *
 * Backend friend: replace these functions with real calls once the endpoints
 * are ready, for example:
 *   GET /api/bank-transactions?direction=money_in|money_out
 *   GET /api/bank-transactions/{id}
 *   GET /api/reconciliation/candidates?bankTransactionId=...
 */
const MOCK: BankMoneyTransactionDetail[] = [
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
  await new Promise((r) => setTimeout(r, 120));
  return MOCK.filter((t) => t.direction === direction).map(
    ({ importId: _i, sourceRow: _s, ...rest }) => rest,
  );
}

export async function getMoneyTransactionDetail(
  _user: User,
  id: string,
): Promise<BankMoneyTransactionDetail | undefined> {
  // TODO (backend): replace with GET /api/bank-transactions/{id}
  await new Promise((r) => setTimeout(r, 80));
  return MOCK.find((t) => t.id === id);
}

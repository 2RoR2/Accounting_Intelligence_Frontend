import type { User } from "@/types";
import type {
  MoneyDirection,
  MoneyTransaction,
  MoneyTransactionDetail,
} from "@/types/money";

const MOCK: MoneyTransactionDetail[] = [
  {
    id: "mt-001",
    tenantId: "t1",
    direction: "money_in",
    transactionNumber: "RCP-1",
    transactionDate: "2026-10-20",
    customerId: "c1",
    customerName: "ABC Trading",
    vendorId: null,
    currency: "MYR",
    referenceNumber: "INV-1001",
    remarks: "Payment received",
    description: "Sales receipt",
    sourceDocumentId: "doc-101",
    status: "ready",
    createdAt: "2026-10-20T08:00:00Z",
    postedBy: "u1",
    postedAt: "2026-10-20T09:00:00Z",
    itemTotal: 1500,
    paymentTotal: 1500,
    feeTotal: 0,
    items: [
      { id: "i1", moneyTransactionId: "mt-001", lineNumber: 1, accountId: "a4000", accountCode: "4000", accountName: "Sales Revenue", amount: 1500 },
    ],
    payments: [
      { id: "p1", moneyTransactionId: "mt-001", lineNumber: 1, paymentMethodId: "pm1", paymentMethodName: "Bank Transfer", bankAccountId: "b1", bankAccountName: "Maybank Current", amount: 1500, feeAmount: 0 },
    ],
  },
  {
    id: "mt-002",
    tenantId: "t1",
    direction: "money_out",
    transactionNumber: "PV-1",
    transactionDate: "2026-10-21",
    vendorId: "v1",
    vendorName: "Office Supplies Co",
    customerId: null,
    currency: "MYR",
    referenceNumber: "BILL-55",
    description: "Stationery",
    sourceDocumentId: "doc-202",
    status: "ready",
    createdAt: "2026-10-21T10:00:00Z",
    postedBy: "u1",
    postedAt: "2026-10-21T11:00:00Z",
    itemTotal: 320,
    paymentTotal: 320,
    feeTotal: 2,
    items: [
      { id: "i2", moneyTransactionId: "mt-002", lineNumber: 1, accountId: "a5100", accountCode: "5100", accountName: "Office Expenses", amount: 320 },
    ],
    payments: [
      { id: "p2", moneyTransactionId: "mt-002", lineNumber: 1, paymentMethodId: "pm1", paymentMethodName: "Bank Transfer", bankAccountId: "b1", bankAccountName: "Maybank Current", amount: 320, feeAmount: 2, feeAccountId: "a5200", feeAccountName: "Bank Charges" },
    ],
  },
  {
    id: "mt-003",
    tenantId: "t1",
    direction: "money_in",
    transactionNumber: "RCP-2",
    transactionDate: "2026-10-22",
    customerId: "c2",
    customerName: "XYZ Services",
    currency: "MYR",
    referenceNumber: "INV-1008",
    status: "draft",
    createdAt: "2026-10-22T14:00:00Z",
    itemTotal: 800,
    paymentTotal: 800,
    feeTotal: 0,
    items: [
      { id: "i3", moneyTransactionId: "mt-003", lineNumber: 1, accountId: "a4000", accountCode: "4000", accountName: "Sales Revenue", amount: 800 },
    ],
    payments: [
      { id: "p3", moneyTransactionId: "mt-003", lineNumber: 1, paymentMethodId: "pm2", paymentMethodName: "Cash", bankAccountId: "b2", bankAccountName: "Petty Cash", amount: 800, feeAmount: 0 },
    ],
  },
];

export async function getMoneyTransactions(
  _user: User,
  direction: MoneyDirection,
): Promise<MoneyTransaction[]> {
  // TODO: replace with GET /api/money-transactions?direction=...
  await new Promise((r) => setTimeout(r, 120));
  return MOCK.filter((t) => t.direction === direction).map(({ items, payments, ...rest }) => rest);
}

export async function getMoneyTransactionDetail(
  _user: User,
  id: string,
): Promise<MoneyTransactionDetail | undefined> {
  // TODO: replace with GET /api/money-transactions/{id}
  await new Promise((r) => setTimeout(r, 80));
  return MOCK.find((t) => t.id === id);
}

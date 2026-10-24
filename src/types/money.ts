export type MoneyDirection = "money_in" | "money_out";
export type MoneyStatus = "draft" | "pending_approval" | "ready" | "void";

export interface MoneyTransaction {
  id: string;
  tenantId: string;
  direction: MoneyDirection;
  transactionNumber: string;
  transactionDate: string;
  customerId?: string | null;
  vendorId?: string | null;
  customerName?: string | null;
  vendorName?: string | null;
  currency: string;
  referenceNumber?: string | null;
  remarks?: string | null;
  description?: string | null;
  sourceDocumentId?: string | null;
  status: MoneyStatus;
  journalEntryId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  postedBy?: string | null;
  postedAt?: string | null;
  voidedBy?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  itemTotal: number;
  paymentTotal: number;
  feeTotal: number;
}

export interface MoneyTransactionItem {
  id: string;
  moneyTransactionId: string;
  lineNumber: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  description?: string | null;
  amount: number;
  taxCodeId?: string | null;
  taxCode?: string | null;
}

export interface MoneyTransactionPayment {
  id: string;
  moneyTransactionId: string;
  lineNumber: number;
  paymentMethodId: string;
  paymentMethodName?: string;
  bankAccountId: string;
  bankAccountName?: string;
  amount: number;
  referenceNumber?: string | null;
  feeAmount: number;
  feeAccountId?: string | null;
  feeAccountName?: string | null;
}

export interface MoneyTransactionDetail extends MoneyTransaction {
  items: MoneyTransactionItem[];
  payments: MoneyTransactionPayment[];
}

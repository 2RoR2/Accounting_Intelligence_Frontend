export type MoneyDirection = "money_in" | "money_out";

/** Status of a bank statement row (matches backend bank_transactions.status). */
export type BankTransactionStatus =
  | "imported"
  | "needs_review"
  | "proposed"
  | "matched"
  | "ignored";

/** Simplified match state for the Money In / Money Out UI. */
export type MatchStatus = "unmatched" | "proposed" | "matched" | "ignored";

/**
 * Bank money movement shown on Money In / Money Out.
 * Amount is always positive; direction decides in vs out.
 * Related record fields are filled once the bank row is matched to a
 * standardised record.
 */
export interface BankMoneyTransaction {
  id: string;
  tenantId: string;
  direction: MoneyDirection;
  postedDate: string;
  valueDate?: string | null;
  description: string;
  reference?: string | null;
  amount: number;
  currency: string;
  status: BankTransactionStatus;
  matchStatus: MatchStatus;
  bankAccountRef?: string | null;
  relatedRecordId?: string | null;
  relatedRecordCode?: string | null;
  relatedDocumentId?: string | null;
  relatedDocumentCode?: string | null;
  amountDelta?: number | null;
  createdAt: string;
}

export interface BankMoneyTransactionDetail extends BankMoneyTransaction {
  importId?: string | null;
  sourceRow?: number | null;
}

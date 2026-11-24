import type { BANK_TYPES } from "@/lib/api/erp.service";

export type MoneyDirection = "money_in" | "money_out";

/** Status of a bank statement row (matches backend bank_transactions.status). */
export type BankTransactionStatus =
  | "imported"
  | "needs_review"
  | "proposed"
  | "partially_matched"
  | "matched"
  | "ignored";

export interface BankReconciliationCandidate {
  id: string;
  recordId: string;
  recordCode: string;
  documentId: string | null;
  documentCode: string | null;
  revision: number;
  category: string;
  reference: string | null;
  party: string | null;
  currency: string | null;
  amount: string | null;
  amountDelta: string | null;
  dateDeltaDays: number | null;
  reasons: string[];
  evidence: Record<string, unknown>;
  status: "proposed" | "confirmed" | "rejected" | "reversed" | "superseded";
  /** Why the match is suggested: a short label and a sentence ("Amount 462.00 and reference INV-1 match"). */
  matchLabel?: MatchLabel | null;
  matchReason?: string | null;
  /** The typed payment (for example a payment voucher) that already paid this record, if any. */
  settledBy?: SettledByDocument | null;
}

/** exact: amount and reference · reference: reference only · memory: an earlier line went to the same contact ·
 * amount+date: amount and a date within a week · manual: chosen by the reviewer. */
export type MatchLabel = "exact" | "reference" | "amount+date" | "memory" | "manual";

export interface SettledByDocument {
  documentId: string;
  documentNumber: string;
  documentType: string;
  documentLabel: string;
}

/** A typed document a bank line can be matched to: a posted payment to reconcile against ("link"), or an open
 * bill/invoice that still needs its payment document ("pay"). */
export interface BankDocumentTarget {
  targetType: "document";
  documentId: string;
  documentType: string;
  documentLabel: string;
  documentNumber: string;
  documentDate: string;
  party: string | null;
  reference: string | null;
  currency: string;
  amount: string;
  outstandingAmount: string | null;
  bankAccountName: string | null;
  action: "link" | "pay";
  linkable: boolean;
  blockedReason: string | null;
  matchLabel: MatchLabel | null;
  matchReason: string | null;
}

/** The bank line is reconciled against a payment that had already posted its cash (no journal of its own). */
export interface BankLineReconciliation {
  id: string;
  documentId: string;
  documentNumber: string;
  documentType: string;
  documentLabel: string;
  matchLabel: MatchLabel | null;
  matchReason: string | null;
}

/** Simplified match state for the Money In / Money Out UI. */
export type MatchStatus = "unmatched" | "proposed" | "partially_matched" | "matched" | "ignored";

export type BankTransactionAnomalyStatus = "anomaly" | "normal" | "insufficient_baseline";

export interface BankTransactionAnomaly {
  status: BankTransactionAnomalyStatus;
  isAnomaly: boolean;
  label: string;
  reason: string;
  amount: string;
  currency: string;
  baselineMedian: string | null;
  upperBound: string | null;
  baselineCount: number;
  anomalyScore: string | null;
}

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
  amount: string | null;
  allocatedAmount: string;
  remainingAmount: string;
  currency: string | null;
  status: BankTransactionStatus;
  matchStatus: MatchStatus;
  paymentPosted?: boolean;
  /** Matched to records whose payment is not in the ledger yet (any role sees it; a local admin posts it). */
  paymentPending?: boolean;
  canPostPayment?: boolean;
  bankAccountRef?: string | null;
  relatedRecordId?: string | null;
  relatedRecordCode?: string | null;
  relatedDocumentId?: string | null;
  relatedDocumentCode?: string | null;
  recordedDocumentId: string | null;
  recordedDocumentNumber: string | null;
  /** money-in/out recorded from the line, or the payment (voucher, receipt, refund) it is reconciled against. */
  recordedDocumentType: (typeof BANK_TYPES)[number] | "payment" | "refund" | "purchase-payment" | "purchase-refund" | null;
  reconciliation?: BankLineReconciliation | null;
  amountDelta?: string | null;
  createdAt: string | null;
  candidateId?: string | null;
  expectedRevision?: number | null;
  candidates?: BankReconciliationCandidate[];
  accountId?: string | null;
  costCentreId?: string | null;
  codingDecision?: string | null;
  codingReason?: string | null;
  anomaly?: BankTransactionAnomaly | null;
  /** The payable account the matched bill was posted to; the supplier payment must debit it. */
  billPayableAccountId?: string | null;
}

export interface BankMoneyTransactionDetail extends BankMoneyTransaction {
  importId?: string | null;
  sourceRow?: number | null;
  candidates?: BankReconciliationCandidate[];
  /** Posted payments that already recorded this line's cash, best first, each with its reason. */
  documentSuggestions?: BankDocumentTarget[];
}

export interface CashSummary {
  currencies: Array<{
    currency: string | null;
    moneyIn: string;
    moneyOut: string;
    verifiedIn: string;
    verifiedOut: string;
  }>;
}

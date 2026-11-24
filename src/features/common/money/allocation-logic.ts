import { amountInCents, decimalAmount, documentGroup, documentHref } from "@/features/common/erp/document-logic";
import { ApiError } from "@/lib/api/client";
import type { DocumentType } from "@/lib/api/erp.service";
import { createManualMatchCandidate, decideMatch, getMoneyTransactionDetail, matchBankRecords, type ManualMatchRecord } from "@/lib/api/money.service";
import type { User } from "@/types";
import type { BankDocumentTarget, BankMoneyTransaction, BankReconciliationCandidate, MatchLabel, MatchStatus } from "@/types/money";

export const MATCH_LIMIT = 50;

/** The short tag shown next to each suggestion; the sentence (matchReason) says the rest. */
export const MATCH_LABEL_TEXT: Record<MatchLabel, string> = {
  exact: "Exact match",
  reference: "Reference match",
  "amount+date": "Amount and date",
  memory: "Seen before",
  manual: "Chosen by reviewer",
};

export function matchLabelText(label?: MatchLabel | null) {
  return label ? MATCH_LABEL_TEXT[label] ?? null : null;
}

/** A posted payment can be reconciled against an open, unallocated line: it links both and posts nothing. */
export function canReconcileDocument(line: BankMoneyTransaction, target: Pick<BankDocumentTarget, "action" | "linkable">) {
  return target.action === "link" && target.linkable && canAllocateBankLine(line) && isUnallocated(line);
}

/** Where a typed document opens: payment vouchers under Purchases, receipts under Sales, money in/out under Bank. */
export function typedDocumentHref(base: string, type: string, id: string) {
  const group = documentGroup(type as DocumentType) ?? "bank-entries";
  return documentHref(base, group, type as DocumentType, id);
}

export function reconciledNotice(result: { documentLabel: string; documentNumber: string; idempotent?: boolean }) {
  return `${result.idempotent ? "Already reconciled" : "Reconciled"} with ${result.documentLabel} ${result.documentNumber}. ` +
    "It had already posted this payment, so no new journal was created.";
}

export function allocationCents(value: string) {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value.trim())) return null;
  return amountInCents(value);
}

export function allocationTotals(line: Pick<BankMoneyTransaction, "remainingAmount" | "allocatedAmount">, amounts: readonly string[]) {
  const draft = amounts.reduce((sum, amount) => sum + (allocationCents(amount) ?? 0n), 0n);
  const remaining = amountInCents(line.remainingAmount) - draft;
  return {
    allocated: decimalAmount(amountInCents(line.allocatedAmount) + draft),
    remaining: decimalAmount(remaining),
    exceedsAvailable: remaining < 0n,
  };
}

export const BANK_MATCH_LABELS: Record<MatchStatus, string> = {
  unmatched: "Unmatched",
  proposed: "Proposed",
  partially_matched: "Partially matched",
  matched: "Matched",
  ignored: "Ignored",
};

/** "Matched, not posted": the bank line is matched but its payment is not in the ledger yet. */
export const PAYMENT_NOT_POSTED = "Matched, not posted";
export const PAYMENT_WAITING_FOR_ADMIN = "Waiting for an admin to post";

export function bankPaymentNotPosted(line: Pick<BankMoneyTransaction, "status" | "matchStatus" | "paymentPending">) {
  const status = bankMatchStatus(line);
  return line.paymentPending === true && (status === "matched" || status === "partially_matched");
}

/** The status a bank line shows in lists: its match status, or "Matched, not posted" while the payment waits. */
export function bankLineStatusLabel(line: Pick<BankMoneyTransaction, "status" | "matchStatus" | "paymentPending">) {
  if (line.status === "needs_review") return "Needs review";
  return bankPaymentNotPosted(line) ? PAYMENT_NOT_POSTED : BANK_MATCH_LABELS[bankMatchStatus(line)];
}

export function bankMatchStatus(line: Pick<BankMoneyTransaction, "status" | "matchStatus">): MatchStatus {
  return line.status === "partially_matched" ? line.status : line.matchStatus;
}

export function canPostBankPayment(role: User["role"], line: Pick<BankMoneyTransaction, "status" | "canPostPayment">) {
  return role === "LOCAL_ADMIN" && line.canPostPayment === true &&
    (line.status === "matched" || line.status === "partially_matched");
}

export function needsBankAccountChoice(error: unknown) {
  return error instanceof ApiError && error.status === 422 &&
    error.message === "Choose the bank account for this statement line.";
}

export function initialBankCandidateId(line?: Pick<BankMoneyTransaction, "candidateId" | "candidates">) {
  const candidates = line?.candidates ?? [];
  return (candidates.find((candidate) => candidate.id === line?.candidateId && candidate.status === "proposed") ??
    candidates.find((candidate) => candidate.status === "proposed") ??
    candidates.find((candidate) => candidate.status === "confirmed") ?? candidates[0])?.id ?? "";
}

export function canReviewBankCandidate(
  line: Pick<BankMoneyTransaction, "status">,
  candidate?: Pick<BankReconciliationCandidate, "status">,
) {
  return candidate?.status === "proposed" && (line.status === "proposed" || line.status === "imported");
}

export function canAllocateBankLine(line: BankMoneyTransaction) {
  return line.status !== "matched" && line.status !== "ignored" &&
    !!line.currency && !line.recordedDocumentId && allocationCents(line.allocatedAmount ?? "") !== null &&
    (allocationCents(line.remainingAmount ?? "") ?? 0n) > 0n;
}

export function isUnallocated(line: BankMoneyTransaction) {
  return allocationCents(line.allocatedAmount ?? "") === 0n && bankMatchStatus(line) !== "partially_matched";
}

function isSingleBankMatch(line: BankMoneyTransaction, amounts: readonly string[]) {
  return isUnallocated(line) && amounts.length === 1 && !!line.amount &&
    allocationCents(amounts[0]) === amountInCents(line.amount);
}

export async function submitBankAllocations(user: User, line: BankMoneyTransaction, allocations: Array<{ recordId: string; amount: string }>) {
  if (!isSingleBankMatch(line, allocations.map(({ amount }) => amount))) {
    const result = await matchBankRecords(line.id, line.allocatedAmount, allocations);
    if (!result) throw new Error("The bank matching response was unavailable.");
    return result.remaining;
  }

  const [{ recordId }] = allocations;
  let candidate = line.candidates?.find((item) => item.recordId === recordId && item.status === "proposed");
  if (!candidate) {
    const created = await createManualMatchCandidate(line.id, recordId);
    const updated = await getMoneyTransactionDetail(user, line.id);
    candidate = updated?.candidates?.find((item) => item.id === created?.id && item.status === "proposed");
    if (!updated || !canAllocateBankLine(updated) || !isUnallocated(updated) || !candidate) {
      throw new Error("The selected candidate could not be confirmed. Check the latest bank line.");
    }
  }
  const result = await decideMatch(user, candidate.id, "confirm", candidate.revision);
  if (!result) throw new Error("The bank matching response was unavailable.");
  return "0.00";
}

export function canMatchRecord(line: Pick<BankMoneyTransaction, "direction" | "currency">, record: Pick<ManualMatchRecord, "category" | "currency">) {
  const category = line.direction === "money_out" ? "ACCOUNTS_PAYABLE" : "ACCOUNTS_RECEIVABLE";
  return !!line.currency && record.currency?.toUpperCase() === line.currency.toUpperCase() &&
    record.category.toUpperCase() === category;
}

export function needsBankMatchRefresh(error: unknown) {
  const status = error instanceof ApiError ? error.status : undefined;
  return status === undefined || status < 400 || status >= 500 || status === 408 || status === 409;
}

export function defaultAllocation(outstanding: string, remaining: string) {
  const owed = amountInCents(outstanding);
  const available = amountInCents(remaining);
  const smaller = owed < available ? owed : available;
  return decimalAmount(smaller > 0n ? smaller : 0n);
}

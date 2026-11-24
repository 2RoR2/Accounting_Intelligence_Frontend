import test from "node:test";
import assert from "node:assert/strict";
import {
  canConfirmBankCandidate, canMatchPaymentDocument, canReviewBankCandidate, candidateEvidence, paymentDocumentNoun,
  rankedBankSuggestions,
} from "../src/features/common/money/allocation-logic";
import { documentGroup, documentHref } from "../src/features/common/erp/document-logic";
import { matchBankPaymentDocument, unmatchBankPaymentDocument } from "../src/lib/api/money.service";
import type { BankMoneyTransaction, BankReconciliationCandidate, PaymentDocumentCandidate } from "../src/types/money";

function candidate(id: string, score: number, extra: Partial<BankReconciliationCandidate> = {}): BankReconciliationCandidate {
  return {
    id, recordId: `r-${id}`, recordCode: id, documentId: null, documentCode: null, revision: 1, category: "accounts_payable",
    reference: null, party: null, currency: "MYR", amount: "100.00", amountDelta: "0.00", dateDeltaDays: null,
    reasons: ["EXACT_AMOUNT"], evidence: {}, status: "proposed", score, explanation: ["Same amount (MYR 100.00)"], ...extra,
  };
}

function voucher(id: string, score: number): PaymentDocumentCandidate {
  return {
    kind: "payment_document", documentId: id, documentType: "purchase-payment", documentLabel: "Payment voucher",
    documentNumber: `PV-${id}`, contactName: "Triple Six", reference: null, documentDate: "2026-08-10", amount: "100.00",
    currency: "MYR", daysApart: 2, score, explanation: ["Same amount (MYR 100.00)", "2 days apart"],
  };
}

const openLine = {
  id: "line", status: "imported", matchStatus: "unmatched", allocatedAmount: "0.00", remainingAmount: "100.00",
  recordedDocumentId: null, currency: "MYR", amount: "100.00",
} as unknown as BankMoneyTransaction;

test("vouchers/receipts and bills are ranked together by score; a voucher wins a tie; decided records go last", () => {
  const ranked = rankedBankSuggestions({
    candidates: [candidate("decided", 99, { status: "superseded" }), candidate("bill", 77), candidate("weak", 20)],
    paymentCandidates: [voucher("tie", 77), voucher("best", 110)],
  });
  assert.deepEqual(ranked.map((item) => item.kind === "record" ? item.candidate.id : item.payment.documentId),
    ["best", "tie", "bill", "weak", "decided"]);
  // An older backend without the new fields still lists its candidates.
  assert.deepEqual(rankedBankSuggestions({ candidates: [candidate("old", 0, { score: undefined })] }).map((i) => i.kind), ["record"]);
});

test("a bill a voucher already paid can be rejected but not confirmed", () => {
  const settled = candidate("bill", 27, {
    settledBy: { documentId: "pv", documentType: "purchase-payment", documentNumber: "PV-00001",
      documentLabel: "Payment voucher", bankMatched: false },
  });
  assert.equal(canReviewBankCandidate(openLine, settled), true);
  assert.equal(canConfirmBankCandidate(openLine, settled), false);
  assert.equal(canConfirmBankCandidate(openLine, candidate("bill", 77)), true);
});

test("reasons are plain language when the backend sends them, rule codes otherwise", () => {
  assert.deepEqual(candidateEvidence(candidate("a", 1)), ["Same amount (MYR 100.00)"]);
  assert.deepEqual(candidateEvidence(candidate("b", 1, { explanation: undefined })), ["EXACT_AMOUNT"]);
});

test("a voucher can be matched only to an open, unallocated line not recorded by another document", () => {
  assert.equal(canMatchPaymentDocument(openLine), true);
  assert.equal(canMatchPaymentDocument({ ...openLine, status: "matched" }), false);
  assert.equal(canMatchPaymentDocument({ ...openLine, recordedDocumentId: "doc" }), false);
  assert.equal(canMatchPaymentDocument({ ...openLine, allocatedAmount: "40.00" }), false);
});

test("a matched line links to the voucher under purchases and the receipt under sales", () => {
  assert.equal(documentGroup("purchase-payment"), "purchases");
  assert.equal(documentGroup("payment"), "sales");
  assert.equal(documentGroup("money-out"), "bank-entries");
  assert.equal(documentHref("/company", "purchases", "purchase-payment", "pv 1"), "/company/purchases/pv%201?type=purchase-payment");
  assert.equal(paymentDocumentNoun("purchase-payment"), "payment voucher");
  assert.equal(paymentDocumentNoun("payment"), "official receipt");
});

test("match and unmatch call the bank line endpoints; unmatch sends the trimmed reason", async (t) => {
  const calls: Array<{ url: string; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(String(url).endsWith("/match-payment-document")
      ? { bankTransactionId: "line 1", documentId: "pv", documentType: "purchase-payment", documentNumber: "PV-00001",
          journalId: "j", bankTransactionStatus: "matched", postedJournal: false, alreadyMatched: true }
      : { bankTransactionId: "line 1", documentId: "pv", documentNumber: "PV-00001", bankTransactionStatus: "imported",
          reversedJournal: false }, { status: String(url).endsWith("/match-payment-document") ? 201 : 200 });
  });
  const matched = await matchBankPaymentDocument("line 1", "pv");
  const undone = await unmatchBankPaymentDocument("line 1", "  Wrong voucher ");
  assert.equal(matched.alreadyMatched, true);
  assert.equal(matched.postedJournal, false);
  assert.equal(undone.bankTransactionStatus, "imported");
  assert.ok(calls[0].url.endsWith("/api/bank/transactions/line%201/match-payment-document"));
  assert.deepEqual(calls[0].body, { documentId: "pv" });
  assert.ok(calls[1].url.endsWith("/api/bank/transactions/line%201/unmatch-payment-document"));
  assert.deepEqual(calls[1].body, { reason: "Wrong voucher" });
});

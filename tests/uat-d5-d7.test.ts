import test from "node:test";
import assert from "node:assert/strict";
import { BULK_LIMIT, bulkResultSummary, selectedIds, toggleSelection } from "../src/features/common/bulk-selection";
import {
  allocationCents, allocationTotals, bankMatchStatus, canAllocateBankLine, canMatchRecord,
  defaultAllocation, isUnallocated, needsBankMatchRefresh, submitBankAllocations,
} from "../src/features/common/money/allocation-logic";
import { resolveLineItemField } from "../src/features/common/documents/review/review-logic";
import { postingSelectionTotals, previewTotals } from "../src/features/common/records/posting-logic";
import { ApiError } from "../src/lib/api/client";
import { getScannedPostPreview, postScannedRecord } from "../src/lib/api/erp.service";
import type { BankMoneyTransaction, BankReconciliationCandidate, User } from "../src/types";

const user = { id: "accountant", role: "ACCOUNTANT" } as User;
const bankLine: BankMoneyTransaction = {
  id: "bank-line", tenantId: "company", direction: "money_out", postedDate: "2026-11-20",
  description: "Supplier payment", currency: "MYR", amount: "100.00",
  allocatedAmount: "0.00", remainingAmount: "100.00", createdAt: null,
  status: "imported", matchStatus: "unmatched",
  recordedDocumentId: null, recordedDocumentNumber: null, recordedDocumentType: null,
};
const partialLine: BankMoneyTransaction = {
  ...bankLine, allocatedAmount: "40.00", remainingAmount: "60.00", status: "partially_matched",
};
const proposedCandidate: BankReconciliationCandidate = {
  id: "candidate", recordId: "bill", recordCode: "BILL-1", revision: 7, status: "proposed",
  documentId: "document", documentCode: "DOC-1", category: "ACCOUNTS_PAYABLE",
  reference: null, party: null, currency: "MYR", amount: "100.00", amountDelta: "0.00",
  dateDeltaDays: null, reasons: [], evidence: {},
};

test("bulk selection keeps eligible rows, drops changed revisions and respects the request limit", () => {
  const selected = toggleSelection(["doc-1:2"], "doc-2:1");
  assert.deepEqual(selected, ["doc-1:2", "doc-2:1"]);
  assert.deepEqual(toggleSelection(selected, "doc-1:2"), ["doc-2:1"]);
  assert.deepEqual(selectedIds(selected, ["doc-1:3", "doc-3:1"]), []);
  assert.deepEqual(selectedIds(selected, ["doc-2:1", "doc-3:1"]), ["doc-2:1"]);

  const full = Array.from({ length: BULK_LIMIT }, (_, index) => String(index));
  assert.deepEqual(toggleSelection(full, "extra"), full);
  assert.equal(toggleSelection(full, "0").length, BULK_LIMIT - 1);
});

test("bulk summaries keep the count and each document number with its refusal reason", () => {
  const results = [
    { number: "BILL-1", ok: true },
    { number: "BILL-2", ok: false, reason: "The document changed." },
    { number: "BILL-3", ok: false, reason: "The period is closed." },
  ];
  assert.equal(bulkResultSummary("approved", results, (item) => item.number),
    "1 approved, 2 not: BILL-2: The document changed. · BILL-3: The period is closed.");
  assert.equal(bulkResultSummary("submitted", results.slice(0, 1), (item) => item.number), "1 submitted, 0 not");
  assert.equal(bulkResultSummary("posted", results.slice(1, 2), (item) => item.number),
    "0 posted, 1 not: BILL-2: The document changed.");
});

test("bank allocations use the persisted balance and compute remaining cents exactly", () => {
  assert.equal(defaultAllocation("35.40", "21.23"), "21.23");
  assert.equal(defaultAllocation("0.09", "21.23"), "0.09");
  assert.equal(defaultAllocation("1.00", "-0.01"), "0.00");
  assert.equal(defaultAllocation(bankLine.amount!, partialLine.remainingAmount), "60.00");
  assert.deepEqual(allocationTotals(partialLine, ["0.10", "0.20"]), {
    allocated: "40.30", remaining: "59.70", exceedsAvailable: false,
  });
  assert.deepEqual(allocationTotals(partialLine, ["60.01"]), {
    allocated: "100.01", remaining: "-0.01", exceedsAvailable: true,
  });
  assert.equal(bankMatchStatus(partialLine), "partially_matched");
  assert.equal(isUnallocated(partialLine), false);
  assert.equal(canAllocateBankLine(partialLine), true);
  assert.equal(canAllocateBankLine({ ...partialLine, status: "matched", remainingAmount: "0.00" }), false);
  assert.deepEqual(allocationTotals({ allocatedAmount: "0.00", remainingAmount: "10.30" }, ["0.10", "0.20"]), {
    allocated: "0.30", remaining: "10.00", exceedsAvailable: false,
  });
  assert.deepEqual(allocationTotals({ allocatedAmount: "0.00", remainingAmount: "0.30" }, ["0.10", "0.20"]), {
    allocated: "0.30", remaining: "0.00", exceedsAvailable: false,
  });
  assert.equal(allocationCents(".05"), 5n);
  for (const invalid of ["", "-0.01", "0.001", "1e2", "abc"]) {
    assert.equal(allocationCents(invalid), null);
  }
});

test("match-many sends the amount already allocated on the latest bank line read", async (t) => {
  const requests: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(url).endsWith("/api/bank/transactions/bank-line/match-many"));
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ remaining: "0.00" });
  });
  const split = [{ recordId: "first", amount: "40.00" }, { recordId: "second", amount: "60.00" }];
  assert.equal(await submitBankAllocations(user, bankLine, split), "0.00");
  const remainder = [{ recordId: "second", amount: "60.00" }];
  assert.equal(await submitBankAllocations(user, partialLine, remainder), "0.00");
  assert.deepEqual(requests, [
    { expectedAllocated: "0.00", allocations: split },
    { expectedAllocated: "40.00", allocations: remainder },
  ]);
});

test("one allocation covering the full bank line confirms an existing candidate", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(url).endsWith("/api/bank/reconciliation/candidates/candidate/decision"));
    assert.deepEqual(JSON.parse(String(init?.body)), {
      candidateId: "candidate", decision: "confirmed", expectedRevision: 7,
    });
    return Response.json({ settlementId: "settlement" });
  });
  const line = { ...bankLine, candidates: [proposedCandidate] };
  assert.equal(await submitBankAllocations(user, line, [{ recordId: "bill", amount: "100.00" }]), "0.00");
  assert.equal(fetch.mock.callCount(), 1);
});

test("an exact bank allocation creates a candidate when none exists and reads its revision before confirming", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    if (path.endsWith("/decision")) {
      assert.equal(JSON.parse(String(init?.body)).expectedRevision, 7);
      return Response.json({ settlementId: "settlement" });
    }
    if (path.endsWith("/candidates")) {
      assert.equal(JSON.parse(String(init?.body)).recordId, "bill");
      return Response.json({ id: proposedCandidate.id });
    }
    return Response.json({ ...bankLine, status: "proposed", candidates: [proposedCandidate] });
  });
  assert.equal(await submitBankAllocations(user, bankLine, [{ recordId: "bill", amount: "100.00" }]), "0.00");
  assert.deepEqual(paths, [
    "/api/bank/reconciliation/candidates", "/api/bank/transactions/bank-line",
    "/api/bank/reconciliation/candidates/candidate/decision",
  ]);
});

test("split matching accepts only eligible records in the bank line currency", () => {
  const same = { category: "accounts_payable", currency: "myr" };
  const foreign = { category: "ACCOUNTS_PAYABLE", currency: "USD" };
  const unknown = { category: "ACCOUNTS_PAYABLE", currency: null };
  const wrongDirection = { category: "ACCOUNTS_RECEIVABLE", currency: "MYR" };
  const results = [same, foreign, unknown, wrongDirection];
  assert.deepEqual(results.filter(record => canMatchRecord(bankLine, record)), [same]);
  assert.equal([same, foreign].every(record => canMatchRecord(bankLine, record)), false);
});

test("conflicts, timeouts, transport errors and server errors require a bank line reload", () => {
  for (const error of [new Error("Network unavailable"), new ApiError("Timeout", 408), new ApiError("Conflict", 409), new ApiError("Server error", 500)]) {
    assert.equal(needsBankMatchRefresh(error), true);
  }
  assert.equal(needsBankMatchRefresh(new ApiError("Invalid allocation", 422)), false);
});

test("suggested fixes resolve the zero-based line index and an editable field", () => {
  const lines = [{ id: "first" }, { id: "second" }, { id: null }];
  assert.deepEqual(resolveLineItemField("line_items.0.quantity", lines), { index: 0, key: "quantity", label: "Line 1 Quantity" });
  assert.deepEqual(resolveLineItemField("line_items.1.unit_price", lines), { index: 1, key: "unit_price", label: "Line 2 Unit price" });
  for (const field of ["line_items.0.total", "line_items.-1.amount", "line_items.2.amount", "line_items.3.amount", "quantity"]) {
    assert.equal(resolveLineItemField(field, lines), undefined);
  }
});

test("journal preview uses the reported totals and preserves the server balance decision", () => {
  assert.deepEqual(previewTotals({ totalDebit: "1234.5", totalCredit: "1234.50", balanced: true }), {
    debit: "1234.50", credit: "1234.50", balanced: true,
  });
  assert.deepEqual(previewTotals({ totalDebit: "10.01", totalCredit: "10.00", balanced: false }), {
    debit: "10.01", credit: "10.00", balanced: false,
  });
  assert.equal(previewTotals({ totalDebit: "0.00", totalCredit: "0.00", balanced: false }).balanced, false);
});

test("the scanned post request carries the hash from the preview", async (t) => {
  const planHash = "a".repeat(64);
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith("/post-preview")) return Response.json({ planHash, previouslyReversed: true });
    assert.ok(String(url).endsWith("/post"));
    assert.deepEqual(JSON.parse(String(init?.body)), { expectedPlanHash: planHash });
    return Response.json({ id: "new-journal", idempotent: false });
  });
  const preview = await getScannedPostPreview("record");
  assert.equal(preview.previouslyReversed, true);
  const posted = await postScannedRecord("record", { expectedPlanHash: preview.planHash });
  assert.equal(posted.idempotent, false);
});

test("posting count confirmation totals add exact cents and keep currencies separate", () => {
  assert.deepEqual(postingSelectionTotals([
    { amount: "1234.49", currency: "MYR" },
    { amount: "0.01" },
    { amount: "5.20", currency: "usd" },
    { amount: null },
  ]), { missing: 1, totals: [{ currency: "MYR", amount: "1234.50" }, { currency: "USD", amount: "5.20" }] });
});

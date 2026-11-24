import test from "node:test";
import assert from "node:assert/strict";
import {
  canReconcileDocument, matchLabelText, reconciledNotice, typedDocumentHref,
} from "../src/features/common/money/allocation-logic";
import {
  reconcileBankDocument, searchMatchTargets, undoBankDocumentReconciliation,
} from "../src/lib/api/money.service";
import type { BankMoneyTransaction } from "../src/types/money";

const openLine = {
  id: "line", status: "imported", matchStatus: "unmatched", currency: "MYR", amount: "462.00",
  allocatedAmount: "0.00", remainingAmount: "462.00", recordedDocumentId: null,
} as unknown as BankMoneyTransaction;

test("every suggestion label has a short tag; an unknown or missing label shows none", () => {
  assert.equal(matchLabelText("exact"), "Exact match");
  assert.equal(matchLabelText("reference"), "Reference match");
  assert.equal(matchLabelText("amount+date"), "Amount and date");
  assert.equal(matchLabelText("memory"), "Seen before");
  assert.equal(matchLabelText(null), null);
  assert.equal(matchLabelText(undefined), null);
});

test("only a linkable posted payment on an open, unallocated line can be reconciled", () => {
  const voucher = { action: "link", linkable: true } as const;
  assert.equal(canReconcileDocument(openLine, voucher), true);
  assert.equal(canReconcileDocument(openLine, { action: "link", linkable: false }), false);
  assert.equal(canReconcileDocument(openLine, { action: "pay", linkable: false }), false);
  assert.equal(canReconcileDocument({ ...openLine, status: "matched" }, voucher), false);
  assert.equal(canReconcileDocument({ ...openLine, allocatedAmount: "100.00", remainingAmount: "362.00" }, voucher), false);
  assert.equal(canReconcileDocument({ ...openLine, recordedDocumentId: "pv" }, voucher), false);
});

test("reconciled documents open in their own module, and the notice says nothing new was posted", () => {
  assert.equal(typedDocumentHref("/workspace", "purchase-payment", "pv"), "/workspace/purchases/pv?type=purchase-payment");
  assert.equal(typedDocumentHref("/company", "payment", "or"), "/company/sales/or?type=payment");
  assert.equal(typedDocumentHref("/company", "money-out", "mo"), "/company/bank-entries/mo?type=money-out");
  assert.equal(reconciledNotice({ documentLabel: "Payment voucher", documentNumber: "PV-2026-00001" }),
    "Reconciled with Payment voucher PV-2026-00001. It had already posted this payment, so no new journal was created.");
  assert.match(reconciledNotice({ documentLabel: "Payment voucher", documentNumber: "PV-1", idempotent: true }), /^Already reconciled/);
});

test("search, reconcile and undo call the bank line endpoints", async (t) => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url).includes("match-targets")) return Response.json({ records: [], documents: [{ documentNumber: "PV-1" }] });
    return Response.json({ documentNumber: "PV-1" }, { status: String(url).endsWith("/undo") ? 200 : 201 });
  });
  const found = await searchMatchTargets("line 1", "PV");
  assert.equal(found.documents[0].documentNumber, "PV-1");
  await reconcileBankDocument("line 1", "pv");
  await undoBankDocumentReconciliation("line 1");
  assert.deepEqual(calls.map(({ url, method, body }) => [url.replace(/^.*\/api/, "/api"), method, body]), [
    ["/api/bank/transactions/line%201/match-targets?q=PV", "GET", null],
    ["/api/bank/transactions/line%201/reconcile-document", "POST", { documentId: "pv" }],
    ["/api/bank/transactions/line%201/reconcile-document/undo", "POST", {}],
  ]);
});

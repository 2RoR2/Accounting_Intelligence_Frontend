import test from "node:test";
import assert from "node:assert/strict";
import { PURCHASE_TYPES, SALES_TYPES, SCANNED_LIST_TYPES } from "../src/lib/api/erp.service";
import { documentActions, documentListTitle, emptyListHint } from "../src/features/common/erp/document-logic";

test("list titles pluralise the type except for mass nouns", () => {
  assert.equal(documentListTitle("invoice"), "Invoices");
  assert.equal(documentListTitle("goods-received"), "Goods received");
  assert.equal(documentListTitle("purchase-payment"), "Supplier payments");
});

test("an empty list never promises captured documents for a type that only holds typed ones", () => {
  for (const type of [...SALES_TYPES, ...PURCHASE_TYPES]) {
    const hint = emptyListHint(type);
    assert.match(hint, /^No .+ yet\. /, type);
    assert.doesNotMatch(hint, /receiveds|ss yet/, type);
    assert.equal(/Captured documents/.test(hint), SCANNED_LIST_TYPES.has(type), `${type}: ${hint}`);
  }
  assert.equal(emptyListHint("goods-received"), "No goods received yet. Create one with New, or turn an earlier document into one.");
  assert.equal(emptyListHint("purchase-order"), "No purchase orders yet. Create one with New, or turn an earlier document into one.");
  assert.equal(emptyListHint("payment"), "No customer payments yet. Record one against an invoice with New.");
  assert.equal(emptyListHint("purchase-payment"), "No supplier payments yet. Record one against a bill with New.");
});

test("a settled invoice or bill no longer offers a payment, but still offers credit and debit notes", () => {
  const labels = (type: Parameters<typeof documentActions>[1], outstanding?: string | null) =>
    documentActions("ready", type, "LOCAL_ADMIN", outstanding).map(({ label }) => label);
  assert.ok(labels("invoice", "200.00").includes("Receive payment"));
  assert.ok(labels("invoice").includes("Receive payment"), "unknown outstanding keeps today's actions");
  assert.deepEqual(labels("invoice", "0.00"), ["Credit note", "Debit note", "Void", "Print", "Download PDF", "Duplicate"]);
  assert.ok(!labels("debit-note", "0.00").includes("Receive payment"));
  assert.ok(labels("bill", "0.00").includes("Turn into supplier credit note"));
  assert.ok(!labels("bill", "0.00").includes("Turn into supplier payment"));
  assert.ok(labels("bill", "12.50").includes("Turn into supplier payment"));
});

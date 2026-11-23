import test from "node:test";
import assert from "node:assert/strict";
import { recordHref, typeLabel } from "../src/features/common/trace/trace-links";
import { isAllowedWorkspaceRoute } from "../src/lib/constants/routes";

const ID = "6f1c9d3e-1111-4222-8333-444455556666";

test("typed documents open on their Sales, Purchases or Bank page", () => {
  assert.equal(recordHref("/company", { kind: "erp", type: "invoice", id: ID }), `/company/sales/${ID}?type=invoice`);
  assert.equal(recordHref("/company", { kind: "erp", type: "payment", id: ID }), `/company/sales/${ID}?type=payment`);
  assert.equal(recordHref("/workspace", { kind: "erp", type: "bill", id: ID }), `/workspace/purchases/${ID}?type=bill`);
  assert.equal(recordHref("/workspace", { kind: "erp", type: "purchase-payment", id: ID }), `/workspace/purchases/${ID}?type=purchase-payment`);
  assert.equal(recordHref("/company", { kind: "erp", type: "money-in", id: ID }), `/company/bank-entries/${ID}?type=money-in`);
});

test("every kind that has a page links to it and the rest do not", () => {
  assert.equal(recordHref("/company", { kind: "record", type: "bill", id: ID }), `/company/records/${ID}`);
  assert.equal(recordHref("/workspace", { kind: "upload", type: "bill", id: ID }), `/workspace/documents/${ID}`);
  assert.equal(recordHref("/company", { kind: "bank", type: "bank-transaction", id: ID, amount: "300.00" }), `/company/money-in?transaction=${ID}`);
  assert.equal(recordHref("/company", { kind: "bank", type: "bank-transaction", id: ID, amount: "-106.00" }), `/company/money-out?transaction=${ID}`);
  assert.equal(recordHref("/company", { kind: "journal", type: "journal", id: ID }), `/company/ledger?section=journals&q=${ID}`);
  assert.equal(recordHref("/company", { kind: "contact", type: "customer", id: ID }), `/company/contacts/${ID}`);
  assert.equal(recordHref("/company", { kind: "settlement", type: "settlement", id: ID }), null);
  assert.equal(recordHref("/company", { kind: "erp", type: "stock-transfer", id: ID }), null);
});

test("each link is a route the role may open", () => {
  for (const [base, role] of [["/company", "LOCAL_ADMIN"], ["/workspace", "ACCOUNTANT"]] as const) {
    const area = base.slice(1);
    for (const record of [
      { kind: "erp", type: "invoice" }, { kind: "erp", type: "bill" }, { kind: "erp", type: "money-out" }, { kind: "record", type: "bill" },
      { kind: "upload", type: "invoice" }, { kind: "bank", type: "bank-transaction", amount: "-1.00" }, { kind: "journal", type: "journal" },
      { kind: "contact", type: "supplier" },
    ]) {
      const href = recordHref(base, { ...record, id: ID });
      assert.ok(href, JSON.stringify(record));
      const [page, id] = href.split("?")[0].split("/").slice(2);
      assert.equal(isAllowedWorkspaceRoute([area, page, ...(id ? [id] : [])], role), true, href);
    }
  }
});

test("labels name the kind of record", () => {
  assert.equal(typeLabel("erp", "credit-note"), "Credit note");
  assert.equal(typeLabel("erp", "purchase-payment"), "Supplier payment");
  assert.equal(typeLabel("bank", "bank-transaction"), "Bank line");
  assert.equal(typeLabel("record", "bill"), "Scanned bill");
  assert.equal(typeLabel("upload", "credit_note"), "Uploaded credit note");
  assert.equal(typeLabel("journal", "reversal"), "Reversal journal");
});

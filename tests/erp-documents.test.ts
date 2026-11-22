import test from "node:test";
import assert from "node:assert/strict";
import { AMOUNT_ONLY_TYPES, BANK_TYPES, PURCHASE_TYPES, SALES_TYPES } from "../src/lib/api/erp.service";
import type { DocumentType, ErpDocument } from "../src/lib/api/erp.service";
import {
  allocationCandidates, documentActions, documentGroup, documentHref, documentTotals, resolveDocumentType,
} from "../src/features/common/erp/document-logic";

test("totals round each line half up before applying its discount and tax", () => {
  const totals = documentTotals("invoice", [
    { description: "A", quantity: "1", unitPrice: "1.005", discount: "0.01", tax: "0.06" },
    { description: "B", quantity: "0.333", unitPrice: "5", discount: "0.17", tax: "0.09" },
    { description: "C", quantity: "3", unitPrice: "0.3350" },
  ]);
  assert.deepEqual(totals, { subtotal: "3.51", tax: "0.15", total: "3.66" });
  assert.deepEqual(documentTotals("bill", []), { subtotal: "0.00", tax: "0.00", total: "0.00" });
  assert.equal(documentTotals("invoice", [{ description: "A", quantity: "1", unitPrice: "999999999999.995" }]).total, "1000000000000.00");
});

test("payments, refunds and bank transfers use their amount instead of lines", () => {
  for (const type of AMOUNT_ONLY_TYPES) {
    assert.deepEqual(documentTotals(type, [{ description: "Ignored", quantity: "2", unitPrice: "50", tax: "6" }], "19.995"),
      { subtotal: "20.00", tax: "0.00", total: "20.00" });
  }
});

test("accountants can edit and submit drafts but cannot make them ready or void them", () => {
  assert.deepEqual(documentActions("draft", "invoice", "ACCOUNTANT"), [
    { kind: "save", label: "Save" },
    { kind: "transition", label: "Submit for approval", status: "pending_approval" },
    { kind: "delete", label: "Delete" },
  ]);
  assert.deepEqual(documentActions("pending_approval", "invoice", "ACCOUNTANT"), [
    { kind: "save", label: "Save" },
    { kind: "transition", label: "Back to draft", status: "draft" },
  ]);
  assert.deepEqual(documentActions("ready", "invoice", "ACCOUNTANT"), [
    { kind: "duplicate", label: "Duplicate" },
    { kind: "transfer", label: "Turn into credit note", target: "credit-note" },
    { kind: "transfer", label: "Turn into customer payment", target: "payment" },
  ]);
  assert.deepEqual(documentActions("void", "invoice", "ACCOUNTANT"), [{ kind: "duplicate", label: "Duplicate" }]);
});

test("company admins can make posting and record-only documents ready and void ready documents", () => {
  for (const [type, draftLabel, pendingLabel] of [
    ["invoice", "Post to ledger", "Approve and post"],
    ["quotation", "Mark ready", "Approve"],
  ] as const) {
    for (const [status, label] of [["draft", draftLabel], ["pending_approval", pendingLabel]] as const) {
      const actions = documentActions(status, type, "LOCAL_ADMIN");
      assert.deepEqual(actions.filter((action) => action.kind === "transition" && action.status === "ready"), [
        { kind: "transition", label, status: "ready" },
      ]);
      assert.deepEqual(actions.filter((action) => action.kind !== "transition" || action.status !== "ready"),
        documentActions(status, type, "ACCOUNTANT"));
    }
  }
  assert.deepEqual(documentActions("ready", "bill", "LOCAL_ADMIN"), [
    { kind: "transition", label: "Void", status: "void" },
    { kind: "duplicate", label: "Duplicate" },
    { kind: "transfer", label: "Turn into supplier credit note", target: "purchase-credit-note" },
    { kind: "transfer", label: "Turn into supplier payment", target: "purchase-payment" },
  ]);
  assert.deepEqual(documentActions("ready", "refund", "LOCAL_ADMIN").map(({ label }) => label), ["Void", "Duplicate"]);
  assert.deepEqual(documentActions("void", "bill", "LOCAL_ADMIN"), [{ kind: "duplicate", label: "Duplicate" }]);
  assert.deepEqual(documentActions("draft", "bill", "SUPER_ADMIN"), []);
});

test("route groups use their defaults and only accept types belonging to that group", () => {
  for (const [group, defaultType, allowed] of [
    ["sales", "invoice", SALES_TYPES],
    ["purchases", "bill", PURCHASE_TYPES],
    ["bank-entries", "bank-transfer", BANK_TYPES],
  ] as const) {
    assert.equal(resolveDocumentType(group, null), defaultType);
    for (const type of allowed) {
      assert.equal(resolveDocumentType(group, type), type);
      assert.equal(documentGroup(type), group);
    }
    for (const type of ["", "unknown", "journal-entry", ...SALES_TYPES, ...PURCHASE_TYPES, ...BANK_TYPES]) {
      if (!(allowed as readonly string[]).includes(type)) assert.equal(resolveDocumentType(group, type), null);
    }
  }
  assert.equal(documentGroup("journal-entry"), undefined);
  assert.equal(documentHref("/company", "purchases", "purchase-payment", "a/b"), "/company/purchases/a%2Fb?type=purchase-payment");
});

test("only open typed documents for the chosen contact and matching scanned documents can be allocated", () => {
  const contact = { id: "contact-1", legalName: "Awan Sdn Bhd" };
  for (const [target, payment, credit] of [
    ["invoice", "payment", "credit-note"],
    ["bill", "purchase-payment", "purchase-credit-note"],
  ] as const) {
    const typed = { type: target, source: "typed", status: "ready", outstanding: "50.00", contactId: contact.id } as const;
    const scanned = { type: target, source: "scanned", status: "approved", outstanding: "25.00", contactName: "AWAN SDN BHD" } as const;
    const rows = [
      { ...typed, id: "open" }, { ...typed, id: "closed", outstanding: "0.00" },
      { ...typed, id: "draft", status: "draft" }, { ...typed, id: "other", contactId: "contact-2" },
      { ...typed, id: "wrong-type", type: "quotation" }, { ...typed, id: "unknown-balance", outstanding: undefined },
      { ...scanned, id: "approved-scan" }, { ...scanned, id: "posted-scan", status: "ready" },
      { ...scanned, id: "other-name", contactName: "Another Company" }, { ...scanned, id: "overpaid-scan", outstanding: "-1" },
    ] satisfies (Pick<ErpDocument, "source" | "status" | "outstanding" | "contactId" | "contactName"> & { id: string; type: DocumentType })[];
    assert.deepEqual(allocationCandidates(payment, contact, rows).map(({ id }) => id), ["open", "approved-scan", "posted-scan"]);
    assert.deepEqual(allocationCandidates(credit, contact, rows).map(({ id }) => id), ["open"]);
    assert.deepEqual(allocationCandidates("refund", contact, rows), []);
  }
});

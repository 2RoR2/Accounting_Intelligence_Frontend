import test from "node:test";
import assert from "node:assert/strict";
import {
  AMOUNT_ONLY_TYPES, BANK_TYPES, PURCHASE_TYPES, SALES_TYPES, documentFileUrl, documentPreviewUrl,
} from "../src/lib/api/erp.service";
import type { DocumentType, ErpDocument } from "../src/lib/api/erp.service";
import {
  ONLY_ADMIN_ISSUES, allocationCandidates, documentActions, documentGroup, documentHref, documentStatusLabel, documentTotals,
  formatFileSize, latestFile, noteTargetCandidates, resolveDocumentType, statusFilterOptions,
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
  assert.deepEqual(documentActions("draft", "bill", "ACCOUNTANT"), [
    { kind: "save", label: "Save" },
    { kind: "transition", label: "Submit for approval", status: "pending_approval" },
    { kind: "delete", label: "Delete" },
  ]);
  assert.deepEqual(documentActions("pending_approval", "bill", "ACCOUNTANT"), [
    { kind: "save", label: "Save" },
    { kind: "transition", label: "Back to draft", status: "draft" },
  ]);
  assert.deepEqual(documentActions("ready", "bill", "ACCOUNTANT"), [
    { kind: "duplicate", label: "Duplicate" },
    { kind: "transfer", label: "Turn into supplier credit note", target: "purchase-credit-note" },
    { kind: "transfer", label: "Turn into supplier debit note", target: "purchase-debit-note" },
    { kind: "transfer", label: "Turn into supplier payment", target: "purchase-payment" },
  ]);
  assert.deepEqual(documentActions("void", "bill", "ACCOUNTANT"), [{ kind: "duplicate", label: "Duplicate" }]);
});

test("company admins can make posting and record-only documents ready and void ready documents", () => {
  for (const [type, draftLabel, pendingLabel] of [
    ["bill", "Post to ledger", "Approve and post"],
    ["purchase-order", "Mark ready", "Approve"],
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
    { kind: "transfer", label: "Turn into supplier debit note", target: "purchase-debit-note" },
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
  for (const [target, payment, credit, debit] of [
    ["invoice", "payment", "credit-note", "debit-note"],
    ["bill", "purchase-payment", "purchase-credit-note", "purchase-debit-note"],
  ] as const) {
    const typed = { type: target, source: "typed", status: "ready", outstanding: "50.00", contactId: contact.id } as const;
    const scanned = { type: target, source: "scanned", status: "approved", outstanding: "25.00", contactName: "AWAN SDN BHD" } as const;
    const rows = [
      { ...typed, id: "open" }, { ...typed, id: "closed", outstanding: "0.00" },
      { ...typed, id: "draft", status: "draft" }, { ...typed, id: "other", contactId: "contact-2" },
      { ...typed, id: "wrong-type", type: "quotation" }, { ...typed, id: "unknown-balance", outstanding: undefined },
      { ...typed, id: "debit-note", type: debit }, { ...scanned, id: "scanned-debit-note", type: debit },
      { ...scanned, id: "approved-scan" }, { ...scanned, id: "posted-scan", status: "ready" },
      { ...scanned, id: "other-name", contactName: "Another Company" }, { ...scanned, id: "overpaid-scan", outstanding: "-1" },
    ] satisfies (Pick<ErpDocument, "source" | "status" | "outstanding" | "contactId" | "contactName"> & { id: string; type: DocumentType })[];
    assert.deepEqual(allocationCandidates(payment, contact, rows).map(({ id }) => id), ["open", "debit-note", "approved-scan", "posted-scan"]);
    assert.deepEqual(allocationCandidates(credit, contact, rows).map(({ id }) => id), ["open", "debit-note"]);
    assert.deepEqual(allocationCandidates("refund", contact, rows), []);
  }
});

test("printed sales documents: accountants draft, only the company admin issues, issued ones are read-only", () => {
  const accountant = documentActions("draft", "invoice", "ACCOUNTANT");
  assert.deepEqual(accountant, [
    { kind: "save", label: "Save" },
    { kind: "preview", label: "Preview PDF" },
    { kind: "transition", label: "Submit for approval", status: "pending_approval" },
    { kind: "transition", label: "Issue", status: "ready", disabledReason: ONLY_ADMIN_ISSUES },
    { kind: "delete", label: "Delete" },
  ]);
  assert.deepEqual(documentActions("draft", "invoice", "LOCAL_ADMIN").find(({ label }) => label === "Issue"),
    { kind: "transition", label: "Issue", status: "ready" });
  for (const type of ["invoice", "credit-note", "debit-note", "payment", "purchase-payment", "delivery-order"] as const) {
    for (const status of ["pending_approval", "ready", "void"] as const) {
      for (const role of ["ACCOUNTANT", "LOCAL_ADMIN"] as const) {
        assert.ok(!documentActions(status, type, role).some(({ kind }) => kind === "save"), `${type} ${status} is editable`);
      }
    }
  }
  const labels = (status: "ready" | "void", type: DocumentType, role: "ACCOUNTANT" | "LOCAL_ADMIN") =>
    documentActions(status, type, role).map(({ label }) => label);
  assert.deepEqual(labels("ready", "invoice", "LOCAL_ADMIN"),
    ["Receive payment", "Credit note", "Debit note", "Void", "Print", "Download PDF", "Duplicate"]);
  assert.deepEqual(labels("ready", "invoice", "ACCOUNTANT"),
    ["Receive payment", "Credit note", "Debit note", "Print", "Download PDF", "Duplicate"]);
  assert.deepEqual(labels("ready", "debit-note", "LOCAL_ADMIN"),
    ["Receive payment", "Credit note", "Void", "Print", "Download PDF", "Duplicate"]);
  for (const type of ["credit-note", "payment", "purchase-payment"] as const) {
    assert.deepEqual(labels("ready", type, "LOCAL_ADMIN"), ["Void", "Print", "Download PDF", "Duplicate"]);
    assert.deepEqual(labels("ready", type, "ACCOUNTANT"), ["Print", "Download PDF", "Duplicate"]);
  }
  assert.deepEqual(documentActions("ready", "invoice", "LOCAL_ADMIN").filter(({ kind }) => kind === "transfer"), [
    { kind: "transfer", label: "Receive payment", target: "payment" },
    { kind: "transfer", label: "Credit note", target: "credit-note" },
    { kind: "transfer", label: "Debit note", target: "debit-note" },
  ]);
  assert.deepEqual(labels("void", "invoice", "LOCAL_ADMIN"), ["Print", "Download PDF", "Duplicate"]);
  // Supplier debit notes are captured, not printed: they keep the ordinary flow.
  assert.deepEqual(labels("ready", "purchase-debit-note", "LOCAL_ADMIN"),
    ["Void", "Duplicate", "Turn into supplier credit note", "Turn into supplier payment"]);
});

test("quotations are sent, then accepted, expired or converted to an invoice by accountants and admins", () => {
  for (const role of ["ACCOUNTANT", "LOCAL_ADMIN"] as const) {
    assert.deepEqual(documentActions("draft", "quotation", role), [
      { kind: "save", label: "Save" },
      { kind: "preview", label: "Preview PDF" },
      { kind: "transition", label: "Send", status: "sent" },
      { kind: "delete", label: "Delete" },
    ]);
    assert.deepEqual(documentActions("sent", "quotation", role).filter(({ kind }) => kind === "transition" || kind === "transfer"), [
      { kind: "transition", label: "Mark accepted", status: "accepted" },
      { kind: "transition", label: "Mark expired", status: "expired" },
      { kind: "transfer", label: "Convert to invoice", target: "invoice" },
      { kind: "transition", label: "Void", status: "void" },
    ]);
    assert.deepEqual(documentActions("accepted", "quotation", role).map(({ label }) => label),
      ["Convert to invoice", "Void", "Print", "Download PDF", "Duplicate"]);
    assert.deepEqual(documentActions("expired", "quotation", role)[0], { kind: "transition", label: "Send again", status: "sent" });
  }
});

test("status labels and filters follow the document type", () => {
  assert.equal(documentStatusLabel("ready", "invoice"), "Issued");
  assert.equal(documentStatusLabel("ready", "bill"), "Ready");
  assert.equal(documentStatusLabel("sent", "quotation"), "Sent");
  assert.deepEqual(statusFilterOptions("quotation", false), ["draft", "sent", "accepted", "expired", "void"]);
  assert.deepEqual(statusFilterOptions("invoice", true), ["draft", "pending_approval", "ready", "void", "approved"]);
  assert.deepEqual(statusFilterOptions("debit-note", false), ["draft", "pending_approval", "ready", "void"]);
});

test("credit and debit notes correct an issued typed invoice or bill of the same contact", () => {
  const base = { source: "typed", status: "ready", contactId: "c1" } as const;
  const rows = [
    { ...base, id: "iv", type: "invoice" }, { ...base, id: "dn", type: "debit-note" },
    { ...base, id: "draft", type: "invoice", status: "draft" }, { ...base, id: "other", type: "invoice", contactId: "c2" },
    { ...base, id: "scan", type: "invoice", source: "scanned" }, { ...base, id: "bill", type: "bill" },
  ] satisfies (Pick<ErpDocument, "source" | "status" | "contactId"> & { id: string; type: DocumentType })[];
  assert.deepEqual(noteTargetCandidates("credit-note", "c1", rows).map(({ id }) => id), ["iv", "dn"]);
  assert.deepEqual(noteTargetCandidates("debit-note", "c1", rows).map(({ id }) => id), ["iv"]);
  assert.deepEqual(noteTargetCandidates("purchase-credit-note", "c1", rows).map(({ id }) => id), ["bill"]);
  assert.deepEqual(noteTargetCandidates("debit-note", "", rows), []);
  assert.deepEqual(noteTargetCandidates("invoice", "c1", rows), []);
});

test("printed copies open through same-origin API paths and the latest revision is printed", () => {
  assert.equal(documentPreviewUrl("invoice", "a/b"), "/api/erp/documents/invoice/a%2Fb/preview.pdf");
  assert.equal(documentFileUrl("invoice", "id1", 2), "/api/erp/documents/invoice/id1/files/2");
  assert.equal(documentFileUrl("credit-note", "id1", 1, true), "/api/erp/documents/credit-note/id1/files/1?inline=true");
  const file = (revision: number, reason: "issued" | "void") =>
    ({ revision, reason, fileName: `f${revision}.pdf`, byteSize: 10, sha256: "x", createdAt: "2026-11-23" });
  assert.equal(latestFile([file(1, "issued"), file(3, "void"), file(2, "issued")])?.revision, 3);
  assert.equal(latestFile([]), undefined);
  assert.equal(latestFile(undefined), undefined);
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2.0 KB");
  assert.equal(formatFileSize(3 * 1024 * 1024), "3.0 MB");
});

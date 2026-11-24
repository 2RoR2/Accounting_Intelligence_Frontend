import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentLine, ErpDocument } from "../src/lib/api/erp.service";
import {
  deliveryRecord, documentActions, documentStatusLabel, draftExplainer, issueChecklist, issueLabel, lastPrices, liveDuplicates,
  quotationValidity,
} from "../src/features/common/erp/document-logic";
import { formActions } from "../src/features/common/erp/form-actions";

// docs/SALES_DOCS_AND_DO_PLAN.md, next two weeks: Save draft vs Send / Confirm / Issue, quotation validity, sales orders and
// delivery orders, the duplicate warning while typing, the last price per customer and the confirm-step reminders.

const labels = (actions: { label: string }[]) => actions.map(({ label }) => label);

test("sales orders are confirmed by the admin, then delivered and invoiced; delivery orders become invoices", () => {
  assert.equal(issueLabel("quotation"), "Send");
  assert.equal(issueLabel("sales-order"), "Confirm");
  assert.equal(issueLabel("delivery-order"), "Issue");
  assert.deepEqual(labels(documentActions("draft", "sales-order", "ACCOUNTANT")),
    ["Save draft", "Preview PDF", "Submit for approval", "Confirm", "Delete"]);
  assert.equal(documentActions("draft", "sales-order", "ACCOUNTANT").find(({ label }) => label === "Confirm")?.kind, "transition");
  assert.ok(documentActions("draft", "sales-order", "ACCOUNTANT").some((action) => action.kind === "transition"
    && action.label === "Confirm" && !!action.disabledReason));
  assert.deepEqual(labels(documentActions("ready", "sales-order", "LOCAL_ADMIN")),
    ["Create delivery order", "Create invoice", "Void", "Print", "Download PDF", "Duplicate"]);
  assert.deepEqual(labels(documentActions("ready", "delivery-order", "ACCOUNTANT")),
    ["Create invoice", "Print", "Download PDF", "Duplicate"]);
  assert.equal(documentStatusLabel("ready", "sales-order"), "Confirmed");
  assert.equal(documentStatusLabel("ready", "delivery-order"), "Issued");
  // A quotation already turned into a sales order is not offered that again; the other conversions stay.
  assert.deepEqual(labels(formActions(documentActions("accepted", "quotation", "ACCOUNTANT"), { convertedTo: ["sales-order"] })),
    ["Convert to delivery order", "Convert to invoice", "Void", "Print", "Download PDF", "Duplicate"]);
});

test("the draft line says what Save draft and the freezing step do", () => {
  assert.match(draftExplainer("quotation", false), /Save draft keeps it editable.*Send freezes it.*never posts/);
  assert.doesNotMatch(draftExplainer("quotation", false), /company admin/);
  assert.match(draftExplainer("invoice", false), /Issue freezes it.*posts it to the ledger\..*Only the company admin can issue/);
  assert.match(draftExplainer("sales-order", true), /Confirm freezes it.*never posts/);
  assert.doesNotMatch(draftExplainer("invoice", true), /Only the company admin/);
});

test("a sent quotation warns near and after its valid-until date, and only then", () => {
  assert.equal(quotationValidity("2026-12-25", "sent", "2026-11-25"), null);
  assert.deepEqual(quotationValidity("2026-11-27", "sent", "2026-11-25"), { tone: "warning", label: "Expires in 2 days" });
  assert.deepEqual(quotationValidity("2026-11-26", "sent", "2026-11-25"), { tone: "warning", label: "Expires in 1 day" });
  assert.deepEqual(quotationValidity("2026-11-25", "sent", "2026-11-25"), { tone: "warning", label: "Expires today" });
  assert.deepEqual(quotationValidity("2026-11-20", "sent", "2026-11-25"), { tone: "danger", label: "Past its valid-until date" });
  assert.equal(quotationValidity("2026-11-20", "accepted", "2026-11-25"), null);
  assert.equal(quotationValidity(null, "sent", "2026-11-25"), null);
});

test("a delivery order's delivery record is read from its fields", () => {
  assert.equal(deliveryRecord({}), null);
  assert.equal(deliveryRecord({ delivered: "yes" }), null);
  assert.deepEqual(deliveryRecord({ delivered: { receivedBy: "Lim Siew Ling", receivedOn: "2026-11-26", note: "2 bags short" } }),
    { receivedBy: "Lim Siew Ling", receivedOn: "2026-11-26", note: "2 bags short" });
});

const row = (id: string, extra: Partial<ErpDocument> = {}) => ({
  id, number: id.toUpperCase(), status: "sent", source: "typed", referenceNo: null, documentDate: "2026-11-20", amount: "100.00", ...extra,
}) as ErpDocument;

test("the duplicate warning while typing follows the server rule", () => {
  const rows = [row("qt-1", { referenceNo: "BMS-PO-22" }), row("qt-2", { amount: "250.00" }), row("qt-3", { amount: "250.00", status: "void" }),
    row("qt-4", { amount: "250.00", documentDate: "2026-11-21" })];
  assert.deepEqual(liveDuplicates(rows, { id: null, referenceNo: " bms-po-22 ", documentDate: "2026-11-25", total: "1.00" }),
    [{ id: "qt-1", number: "QT-1", reason: "same reference" }]);
  assert.deepEqual(liveDuplicates(rows, { id: null, referenceNo: "", documentDate: "2026-11-20", total: "250.00" }),
    [{ id: "qt-2", number: "QT-2", reason: "same amount and date" }]);
  assert.deepEqual(liveDuplicates(rows, { id: "qt-2", referenceNo: "", documentDate: "2026-11-20", total: "250.00" }), []);
  assert.deepEqual(liveDuplicates(rows, { id: null, referenceNo: "", documentDate: "2026-11-20", total: "0.00" }), []);
});

test("the last price per product comes from the customer's newest issued document", () => {
  const line = (itemId: string, unitPrice: string): DocumentLine => ({ itemId, description: itemId, quantity: "1", unitPrice });
  const rows = [
    row("iv-31", { status: "ready", documentDate: "2026-10-07", lines: [line("TMB", "20.00"), line("PLY", "60.00")] } as Partial<ErpDocument>),
    row("iv-43", { status: "ready", documentDate: "2026-11-13", lines: [line("TMB", "21.00")] } as Partial<ErpDocument>),
    row("qt-50", { status: "draft", documentDate: "2026-11-24", lines: [line("TMB", "1.00")] } as Partial<ErpDocument>),
    row("iv-44", { status: "void", documentDate: "2026-11-20", lines: [line("PLY", "1.00")] } as Partial<ErpDocument>),
  ];
  const prices = lastPrices(rows, null);
  assert.deepEqual(prices.get("TMB"), { unitPrice: "21.00", number: "IV-43", documentDate: "2026-11-13" });
  assert.deepEqual(prices.get("PLY"), { unitPrice: "60.00", number: "IV-31", documentDate: "2026-10-07" });
  assert.equal(lastPrices(rows, "iv-43").get("TMB")?.number, "IV-31");
});

test("the confirm step lists what is missing without blocking", () => {
  const lines: DocumentLine[] = [{ description: "Plywood", quantity: "2", unitPrice: "62.00", taxCode: "SST-10", tax: "" }];
  assert.deepEqual(issueChecklist("quotation", { contactId: "", lines: [], dueDate: "", attention: "", deliveryAddress: "" }), [
    "No customer is chosen.", "There are no lines.", "No valid-until date: the customer will not see how long the prices hold.",
    "No attention person.",
  ]);
  assert.deepEqual(issueChecklist("delivery-order", { contactId: "c", lines, dueDate: "", attention: "Encik Rosli", deliveryAddress: "" }), [
    "No delivery address: the billing address will print.",
    "A line has a tax code but no tax amount. Type it as printed; nothing is calculated.",
  ]);
  assert.deepEqual(issueChecklist("invoice", { contactId: "c", lines: [{ ...lines[0], tax: "12.40" }], dueDate: "2026-12-25",
    attention: "Lim", deliveryAddress: "" }), []);
});

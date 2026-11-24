import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_TAB_KEYS, documentTabCounts, documentTabEmptyMessage, documentTabHref, documentTabOf, documentTabTitle,
  documentTabs, filterDocumentsByTab, laneFromParam, laneTitle, resolveDocumentTab, reviewTabs,
} from "../src/features/common/documents/document-tabs";

let n = 0;
const doc = (type: string, category?: string, extra: Record<string, string> = {}) =>
  ({ name: `file-${++n}.pdf`, type, category, ...extra });

const SAMPLE = [
  doc("BILL", "ACCOUNTS_PAYABLE"),
  doc("BILL", "ACCOUNTS_PAYABLE"),
  doc("INVOICE", "ACCOUNTS_PAYABLE"), // a supplier invoice is a bill
  doc("INVOICE", "ACCOUNTS_RECEIVABLE"),
  doc("RECEIPT", "ACCOUNTS_PAYABLE"),
  doc("CREDIT_NOTE", "ACCOUNTS_PAYABLE"),
  doc("CREDIT_NOTE", "ACCOUNTS_RECEIVABLE"),
  doc("DEBIT_NOTE", "ACCOUNTS_PAYABLE"),
  doc("DEBIT_NOTE", "accounts_receivable"),
  doc("AUTO"),
  doc("CREDIT_NOTE"), // side unknown, cannot be placed
];

test("each document lands in exactly one type tab", () => {
  assert.deepEqual(SAMPLE.map(documentTabOf), [
    "purchase-bills", "purchase-bills", "purchase-bills", "sales-invoices", "receipts",
    "supplier-credit-notes", "sales-credit-notes", "supplier-debit-notes", "sales-debit-notes", "other", "other",
  ]);
});

test("the side falls back to the direction the backend read when there is no category", () => {
  assert.equal(documentTabOf(doc("INVOICE", undefined, { direction: "purchase" })), "purchase-bills");
  assert.equal(documentTabOf(doc("INVOICE", undefined, { direction: "sales" })), "sales-invoices");
  assert.equal(documentTabOf(doc("DEBIT_NOTE", undefined, { direction: "purchase" })), "supplier-debit-notes");
  assert.equal(documentTabOf(doc("INVOICE")), "sales-invoices");
});

test("each tab filters the same list and the counts add up to All", () => {
  const counts = documentTabCounts(SAMPLE);
  assert.deepEqual(counts, {
    all: 11, "purchase-bills": 3, receipts: 1, "supplier-credit-notes": 1, "supplier-debit-notes": 1,
    "sales-invoices": 1, "sales-credit-notes": 1, "sales-debit-notes": 1, other: 2,
  });
  for (const key of DOCUMENT_TAB_KEYS) {
    assert.equal(filterDocumentsByTab(SAMPLE, key).length, counts[key], key);
  }
  const typed = DOCUMENT_TAB_KEYS.filter((key) => key !== "all").reduce((sum, key) => sum + counts[key], 0);
  assert.equal(typed, counts.all);
});

test("All lists every status and kind but leaves out the .json side files", () => {
  const withJson = [...SAMPLE, { name: "extraction.JSON", type: "INVOICE", category: "ACCOUNTS_PAYABLE" }];
  assert.equal(filterDocumentsByTab(withJson, "all").length, SAMPLE.length);
  assert.equal(documentTabCounts(withJson).all, SAMPLE.length);
  assert.equal(documentTabCounts(withJson)["purchase-bills"], 3);
});

test("a tab opens from its own query string; unknown values show All", () => {
  for (const key of DOCUMENT_TAB_KEYS) assert.equal(resolveDocumentTab(key), key);
  assert.equal(resolveDocumentTab(null), "all");
  assert.equal(resolveDocumentTab(""), "all");
  assert.equal(resolveDocumentTab("credit-notes"), "all");
  assert.equal(resolveDocumentTab("<script>"), "all");
});

test("tab URLs: All is the bare list, every other tab has ?tab=", () => {
  assert.equal(documentTabHref("/company", "all"), "/company/documents");
  assert.equal(documentTabHref("/workspace", "purchase-bills"), "/workspace/documents?tab=purchase-bills");
  assert.equal(documentTabHref("/workspace", "receipts"), "/workspace/documents?tab=receipts");
  for (const key of DOCUMENT_TAB_KEYS) assert.equal(resolveDocumentTab(new URL(documentTabHref("/x", key), "http://h").searchParams.get("tab")), key);
});

test("the tab bar shows the names asked for, in order, with counts, and hides an empty Other", () => {
  const counts = documentTabCounts(SAMPLE.slice(0, 9));
  const bar = documentTabs("/workspace", counts, "all");
  assert.deepEqual(bar.map((tab) => tab.label), [
    "All", "Bills", "Expense receipts", "Supplier credit notes", "Supplier debit notes",
    "Sales invoices", "Sales credit notes", "Sales debit notes",
  ]);
  assert.deepEqual(bar.map((tab) => tab.count), [9, 3, 1, 1, 1, 1, 1, 1]);
  assert.equal(bar[0].href, "/workspace/documents");
  assert.equal(bar[1].href, "/workspace/documents?tab=purchase-bills");
  assert.equal(new Set(bar.map((tab) => tab.href)).size, bar.length);
  // Other shows when something is in it, or when it is the open tab.
  assert.equal(documentTabs("/workspace", documentTabCounts(SAMPLE), "all").at(-1)?.label, "Other");
  assert.equal(documentTabs("/workspace", counts, "other").at(-1)?.label, "Other");
});

test("titles and empty messages follow the tab", () => {
  assert.equal(documentTabTitle("all"), "All documents");
  assert.equal(documentTabTitle("receipts"), "Expense receipts");
  assert.equal(documentTabEmptyMessage("all"), "No documents yet. Add one in Upload & capture.");
  assert.match(documentTabEmptyMessage("supplier-credit-notes"), /^No supplier credit notes yet/);
});

test("To review tabs: To review, Ready to submit and Sent for approval map to the backend lanes", () => {
  const accountant = reviewTabs("/workspace", "ACCOUNTANT", { lane: "ready" });
  assert.deepEqual(accountant.map((tab) => [tab.label, tab.href, tab.current]), [
    ["To review", "/workspace/documents?lane=to-review", false],
    ["Ready to submit", "/workspace/documents?lane=ready", true],
    ["Sent for approval", "/workspace/documents?lane=waiting-approval", false],
  ]);
  assert.equal(reviewTabs("/workspace", "ACCOUNTANT", { lane: "to-review" })[0].current, true);
  assert.equal(reviewTabs("/workspace", "ACCOUNTANT", { lane: "waiting-approval" })[2].current, true);
});

test("an admin's third tab is the Approval queue, which is also where that page shows the same bar", () => {
  const onLane = reviewTabs("/company", "LOCAL_ADMIN", { lane: "to-review" });
  // An admin approves, so only their list says "approve"; an accountant submits.
  assert.deepEqual(onLane.map((tab) => tab.label), ["To review", "Ready to approve", "Approval queue"]);
  assert.equal(onLane[2].href, "/company/approvals");
  const onQueue = reviewTabs("/company", "LOCAL_ADMIN", { page: "approvals" });
  assert.deepEqual(onQueue.map((tab) => tab.current), [false, false, true]);
});

test("Needs fixing is not a tab, except while it is the open lane", () => {
  assert.equal(reviewTabs("/workspace", "ACCOUNTANT", { lane: "ready" }).some((tab) => tab.key === "needs-fixing"), false);
  const open = reviewTabs("/workspace", "ACCOUNTANT", { lane: "needs-fixing" });
  assert.equal(open.at(-1)?.label, "Needs fixing");
  assert.equal(open.at(-1)?.current, true);
});

test("lane parameters", () => {
  assert.equal(laneFromParam("ready"), "ready");
  assert.equal(laneFromParam("bogus"), "");
  assert.equal(laneFromParam(null), "");
  assert.equal(laneTitle("to-review"), "To review");
  assert.equal(laneTitle("waiting-approval"), "Sent for approval");
  assert.equal(laneTitle("ready", "ACCOUNTANT"), "Ready to submit");
  assert.equal(laneTitle("ready"), "Ready to submit");
  assert.equal(laneTitle("ready", "LOCAL_ADMIN"), "Ready to approve");
});

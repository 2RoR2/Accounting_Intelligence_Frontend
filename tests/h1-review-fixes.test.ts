/** Horizon 1 review fixes for the 24 Nov demo bugs a–d: payment terms and due date, admin approval, credit notes,
 *  and "Nothing to check" while a check blocks. Pure logic, no DOM. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Document, User } from "../src/types";
import type { DocumentReviews } from "../src/lib/api/workflow.service";
import { sourceKind } from "../src/lib/api/document-contract";
import { approvalBlockedReason, canDecideReview } from "../src/lib/permissions/document-review";
import { addableFields, blockingChecks, blockingFields } from "../src/features/common/documents/review/review-logic";
import { jobNavigation, navLeaves } from "../src/components/common/layout/navigation";
import { isAllowedWorkspaceRoute } from "../src/lib/constants/routes";
import { typePendingCheck } from "../src/lib/glossary";

const tenant = "11111111-1111-4111-8111-111111111111";
const accountant = { id: "33333333-3333-4333-8333-333333333333", role: "ACCOUNTANT", tenantId: tenant } as User;
const admin = { id: "55555555-5555-4555-8555-555555555555", role: "LOCAL_ADMIN", tenantId: tenant } as User;
const pending = { id: "44444444-4444-4444-8444-444444444444", tenantId: tenant, ownerId: accountant.id, assignedTo: null,
  contentRevision: 2, status: "IN_REVIEW" } as Document;
const submitted: DocumentReviews = { submissions: [{ id: "s", submittedBy: accountant.id, decision: "SUBMITTED", note: "", createdAt: "2026-11-24T00:00:00Z" }], decisions: [] };
const pass = { validationStatus: "PASS", coverageComplete: true, failed: 0 };

/* ---------- Bug c: credit and debit notes read by the AI ---------- */

test("a credit or debit note the reader recognised is its own type, not Unknown", () => {
  for (const [value, kind] of [["credit_note", "CREDIT_NOTE"], ["CREDIT-NOTE", "CREDIT_NOTE"], ["debit_note", "DEBIT_NOTE"]]) {
    assert.equal(sourceKind({ classification: { value, status: "classified" } }), kind);
  }
  assert.equal(sourceKind({ classification: { value: "statement", status: "classified" } }), "UNKNOWN");
  assert.equal(sourceKind({ classification: { value: "credit_note" }, kindDecision: { value: "bill", status: "classified", reason: "CHOSEN_BY_REVIEWER" } }), "BILL");
});

/* ---------- Bug b: the admin sees why Approve is unavailable ---------- */

test("Approve is available exactly when the old rule allowed it, and otherwise says why", () => {
  assert.equal(approvalBlockedReason(admin, pending, submitted, pass), null);
  assert.equal(canDecideReview(admin, pending, submitted), true);
  assert.match(approvalBlockedReason(accountant, pending, submitted, pass) ?? "", /Only a local admin/);
  assert.match(approvalBlockedReason({ ...admin, id: accountant.id }, pending, submitted, pass) ?? "", /different local admin/);
  assert.match(approvalBlockedReason(admin, { ...pending, status: "EXTRACTED" } as Document, submitted, pass) ?? "", /not waiting/);
  assert.match(approvalBlockedReason(admin, pending, { submissions: [], decisions: [] }, pass) ?? "", /not been submitted/);
  assert.match(approvalBlockedReason(admin, pending, submitted, { validationStatus: "FAIL", failed: 2 }) ?? "", /2 checks fail/);
  assert.match(approvalBlockedReason(admin, pending, submitted, { validationStatus: "PASS", coverageComplete: false }) ?? "", /could not run/);
  assert.match(approvalBlockedReason(admin, pending, submitted, null) ?? "", /not loaded/);
});

test("the local admin's sidebar has Approvals; the accountant's menu is unchanged", () => {
  const adminMenu = jobNavigation("LOCAL_ADMIN");
  const adminPages = navLeaves(adminMenu).map(item => item.page);
  for (const page of ["approvals", "records", "users", "validation-rules", "audit"]) {
    assert.ok(adminPages.includes(page), page);
    assert.ok(isAllowedWorkspaceRoute(["company", page], "LOCAL_ADMIN"), page);
  }
  assert.ok(!navLeaves(jobNavigation("ACCOUNTANT")).some(item => item.page === "approvals"));
  assert.deepEqual(jobNavigation("ACCOUNTANT"), jobNavigation());
});

/* ---------- Bug d: never "Nothing to check" while a check blocks ---------- */

test("a blocking check that could not run still names its field and is listed", () => {
  const results = [
    { rule: "RECEIPT-TOTAL", result: "WARNING", checkStatus: "NOT_CHECKED", field: "total", preventsApproval: true, message: "Explicit subtotal, tax and total are required" },
    { rule: "RECEIPT-TAX_PLAUSIBLE", result: "FAIL", field: "tax", message: "The printed tax 206.00 is larger than the printed total 20.60." },
    { rule: "EX-007", result: "WARNING", checkStatus: "NOT_CHECKED", preventsApproval: true, message: "Duplicate check could not run" },
    { rule: "RECEIPT-FIELDS", result: "PASS", field: "supplier" },
    { rule: "UNKNOWN_REQUIRED_FIELDS", result: "FAIL", field: "supplier" },
  ];
  assert.deepEqual(blockingFields(results, typePendingCheck), ["total", "tax"]);
  assert.deepEqual(blockingChecks(results, typePendingCheck).map(item => item.rule), ["RECEIPT-TOTAL", "RECEIPT-TAX_PLAUSIBLE", "EX-007"]);
  assert.deepEqual(blockingChecks([{ rule: "RECEIPT-FIELDS", result: "PASS" }]), []);
});

/* ---------- Bug a: payment terms and due date on every bill, invoice and note ---------- */

test("due date and payment terms are offered when the reader stored none", () => {
  assert.deepEqual(addableFields("BILL", { supplier: {}, total: {} }).map(([key]) => key), ["due", "payment_terms"]);
  assert.deepEqual(addableFields("INVOICE", { due: {}, payment_terms: {} }), []);
  assert.deepEqual(addableFields("CREDIT_NOTE", { due_date: {} }).map(([key]) => key), ["payment_terms"]);
  assert.deepEqual(addableFields("RECEIPT", {}), []);
  assert.deepEqual(addableFields("UNKNOWN", {}), []);
});

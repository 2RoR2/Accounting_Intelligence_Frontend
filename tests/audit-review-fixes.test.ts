/** 24 Nov demo audit fixes on the review page and approvals (bugs a, b, c, d). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceKind } from "../src/lib/api/document-contract";
import { ruleSentence } from "../src/lib/glossary";
import {
  addableFields, addedValueProblem, approvalBlockers, blockingChecks, blockingFields, dueSuggestion, keyFieldsPresent, termDaysFromText,
} from "../src/features/common/documents/review/key-fields";
import type { ValidationResult } from "../src/types";

const result = (rule: string, extra: Partial<ValidationResult> = {}): ValidationResult => ({ rule, result: "PASS", message: rule, ...extra });

test("bug c: a credit or debit note read by the AI is its own type, not Unknown", () => {
  for (const kind of ["CREDIT_NOTE", "DEBIT_NOTE", "credit_note"]) {
    assert.equal(sourceKind({ classification: { value: kind, status: "classified" } } as never), kind.toUpperCase());
  }
  assert.equal(sourceKind({ classification: { value: "STATEMENT", status: "classified" } } as never), "UNKNOWN");
});

test("bug d: a blocking check that names no field, or is only a warning, is still listed", () => {
  const results = [
    result("RECEIPT-TOTAL", { result: "WARNING", checkStatus: "NOT_CHECKED", preventsApproval: true }),
    result("EX-007", { result: "WARNING", preventsApproval: true }),
    result("AMOUNT-PLAUSIBLE", { result: "FAIL", field: "tax" }),
    result("EX-004"),
  ];
  assert.deepEqual(blockingChecks(results, () => false).map((item) => item.rule), ["RECEIPT-TOTAL", "EX-007", "AMOUNT-PLAUSIBLE"]);
  // A field already shown as "Please check" is not listed twice.
  assert.deepEqual(blockingChecks(results, (field) => field === "tax").map((item) => item.rule), ["RECEIPT-TOTAL", "EX-007"]);
  assert.deepEqual(blockingFields([...results, result("TAX-STATUS", { result: "WARNING", field: "tax", preventsApproval: true })]),
    ["tax", "tax"]);
  assert.match(ruleSentence("AMOUNT-PLAUSIBLE"), /Amounts do not fit together/);
});

test("bug a: key fields stay on screen and missing terms or a due date can be added", () => {
  assert.deepEqual(keyFieldsPresent({ supplier: {}, total: {}, currency: {}, due: {} }), ["supplier", "due", "total"]);
  assert.deepEqual(addableFields("BILL", ["supplier", "date", "total", "bill_number"]).slice(0, 3), ["due", "payment_terms", "purchase_order_number"]);
  assert.ok(!addableFields("INVOICE", ["due_date"]).includes("due"), "an alias that is stored blocks a second due date");
  assert.equal(addedValueProblem("due", "03/12/2026"), "Use a date (YYYY-MM-DD).");
  assert.equal(addedValueProblem("due", "2026-12-03"), null);
  assert.equal(addedValueProblem("discount", "RM5"), "Type the amount as a number, without RM.");
});

test("due date from printed terms, else the supplier's terms; a printed due date is kept", () => {
  assert.equal(termDaysFromText("NET 30"), 30);
  assert.equal(termDaysFromText("30 days"), 30);
  assert.equal(termDaysFromText("COD"), 0);
  assert.equal(termDaysFromText("Payment on account"), null);
  assert.deepEqual(dueSuggestion({ documentDate: "2026-11-03", due: null, printedTerms: null, contactDays: 30, contactKind: "supplier" }),
    { due: "2026-12-03", days: 30, source: "supplier terms" });
  assert.equal(dueSuggestion({ documentDate: "2026-11-03", due: "2026-11-20", printedTerms: null, contactDays: 30, contactKind: "supplier" }), null);
  assert.deepEqual(dueSuggestion({ documentDate: "2026-11-03", due: "2026-11-20", printedTerms: "NET 14", contactDays: 30, contactKind: "supplier" }),
    { due: "2026-11-17", days: 14, source: "printed terms" });
  assert.equal(dueSuggestion({ documentDate: "2026-11-03", due: "2026-11-17", printedTerms: "NET 14", contactDays: null, contactKind: "supplier" }), null);
});

test("bug b: the admin is told why Approve is unavailable", () => {
  assert.deepEqual(approvalBlockers({ canDecide: true, ownSubmission: false, blocking: 0, report: { validationStatus: "PASS", coverageComplete: true } }), []);
  assert.match(approvalBlockers({ canDecide: false, ownSubmission: true, blocking: 0, report: { validationStatus: "PASS" } })[0], /Another local admin/);
  assert.match(approvalBlockers({ canDecide: true, ownSubmission: false, blocking: 2, report: { validationStatus: "FAIL" } })[0], /2 checks block approval/);
  assert.match(approvalBlockers({ canDecide: true, ownSubmission: false, blocking: 0, report: { validationStatus: "PASS", coverageComplete: false } })[0], /could not run/);
  assert.match(approvalBlockers({ canDecide: true, ownSubmission: false, blocking: 0, report: null })[0], /have not run/);
});

test("Return expects the status the backend sends (EXCEPTION), so it no longer reports a failure", () => {
  const source = readFileSync(new URL("../src/lib/api/workflow.service.ts", import.meta.url), "utf8");
  assert.match(source, /returned: "EXCEPTION"/);
});

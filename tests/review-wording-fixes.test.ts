/** 25 Nov review findings: duplicate-check wording, field notes that agree, one "Add missing information", other company. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSentence, duplicateState, ruleSentence, sentenceIsMessage } from "../src/lib/glossary";
import { correctionBy, evidenceCaption, shortDay } from "../src/features/common/documents/review/review-logic";
import { documentLevelChecks, reviewNoticeChecks } from "../src/features/common/documents/review/key-fields";
import { addableHint, checkShortcut } from "../src/features/common/documents/review/review-extras";
import type { ValidationResult } from "../src/types";

const result = (patch: Partial<ValidationResult>): ValidationResult => ({ rule: "EX-007", result: "WARNING", message: "", ...patch });
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

/* ---------- 1. The duplicate check's three states ---------- */

test("a duplicate check that could not run says what to fill, never 'possible duplicate'", () => {
  const notRun = result({ checkStatus: "NOT_CHECKED", field: "invoice_number", preventsApproval: true,
    message: "Duplicate check can't run yet: fill the invoice number." });
  assert.equal(duplicateState(notRun), "not-run");
  assert.equal(checkSentence(notRun), "Duplicate check can't run yet: fill the invoice number.");
  assert.doesNotMatch(checkSentence(notRun), /possible duplicate/i);
  assert.equal(checkShortcut(notRun), "fill");
});

test("a result stored before the fix gets the new wording, not the duplicate title", () => {
  const legacy = result({ checkStatus: "NOT_CHECKED", message: "A duplicate check needs both a supplier and an invoice number." });
  assert.equal(checkSentence(legacy), "Duplicate check can't run yet: fill the supplier and invoice number.");
  assert.doesNotMatch(checkSentence(legacy), /possible duplicate|compare it with the earlier/i);
});

test("a duplicate found names the other document and links to it", () => {
  const found = result({ result: "FAIL", field: "invoice_number", duplicate_of: "doc-9",
    message: "Possible duplicate of PI-2611-04 (INVOICE_100003, record 10012, 20 Nov 2026). Compare the two before approving." });
  assert.equal(duplicateState(found), "found");
  assert.equal(checkSentence(found), found.message);
  assert.ok(sentenceIsMessage(found), "the box does not repeat the message under the sentence");
  assert.equal(checkShortcut(found), "open-duplicate");
  // A duplicate without a link target still reads as a finding; there is just no button.
  assert.equal(checkShortcut({ ...found, duplicate_of: undefined }), null);
});

test("a passed duplicate check says so plainly and is not listed in the review box", () => {
  const passed = result({ result: "PASS", checkStatus: "CHECKED", message: "Checked against 4 other invoices for this company; no match." });
  assert.equal(duplicateState(passed), "passed");
  assert.match(checkSentence(passed), /^No duplicate/);
  assert.deepEqual(documentLevelChecks([passed]), []);
  assert.deepEqual(reviewNoticeChecks([passed], () => false), []);
});

test("the review box lists the not-run check even while its field is on screen saying 'Please check'", () => {
  const notRun = result({ checkStatus: "NOT_CHECKED", field: "invoice_number", preventsApproval: true,
    message: "Duplicate check can't run yet: fill the invoice number." });
  const other = result({ rule: "EX-005", result: "FAIL", field: "total_amount", message: "x", preventsApproval: true });
  // Both fields are on screen and flagged: the total needs no line in the box, the duplicate check does (it says why).
  assert.deepEqual(reviewNoticeChecks([notRun, other], () => true), [notRun]);
  // Each finding once, even when it would be listed anyway.
  assert.deepEqual(reviewNoticeChecks([notRun], () => false), [notRun]);
});

test("the page uses the check sentence in the box and the Checks table, and a Fix jump for the not-run check", () => {
  const page = source("features/common/documents/document-review.tsx");
  assert.match(page, /reviewNoticeChecks\(validation/);
  assert.match(page, /<strong>\{checkSentence\(v\)\}<\/strong>/);
  assert.match(page, /duplicateState\(v\) === "not-run"\) && v\.field \? fieldForCheck/);
  assert.doesNotMatch(page, /Possible duplicate document:/, "a same-number match is not called a duplicate");
});

/* ---------- 2. Field notes agree with the correction ---------- */

test("a correction says who and when, in Malaysia time", () => {
  assert.equal(correctionBy({ by: "u1", byName: "Jonathan", at: "2026-11-25 10:22:33.120+08:00" }), "Jonathan, 25 Nov");
  // 23:30 UTC on 24 Nov is already 25 Nov in Kuala Lumpur.
  assert.equal(shortDay("2026-11-24T23:30:00Z"), "25 Nov");
  assert.equal(correctionBy({ by: "u1", byName: null, at: null }), "a reviewer");
  assert.equal(correctionBy({ by: null }), "");
  assert.equal(shortDay("not a date"), null);
});

test("the line above the original says a typed field was typed, not 'where it was read is not recorded'", () => {
  const correction = { by: "u1", byName: "Jonathan", at: "2026-11-25T02:00:00Z" };
  assert.equal(evidenceCaption({ label: "Invoice number", evidence: [], correction }, false),
    "Invoice number: typed by Jonathan, 25 Nov. It was not read from the document.");
  assert.equal(evidenceCaption({ label: "Total", evidence: [{ page: 1, text: "212.00" }], correction }, true),
    'Total: corrected by Jonathan, 25 Nov. The reading was on page 1, "212.00".');
  // Unchanged for a field nobody corrected.
  assert.equal(evidenceCaption({ label: "Total", evidence: [], correction: null }, false), "Total: where it was read is not recorded.");
});

test("a corrected field shows the reading's notes only as history in Details", () => {
  const page = source("features/common/documents/document-review.tsx");
  assert.match(page, /const history = field\.correctedBy \? notes : \[\];/);
  assert.match(page, /const current = field\.correctedBy \? \[\] : notes;/);
  assert.match(page, /<dt>Before the correction<\/dt>/);
  assert.match(page, /`Corrected by \$\{corrector\}`/);
  assert.doesNotMatch(page, /"Corrected by a reviewer"/);
  assert.doesNotMatch(page, /warning\.reviewed \? "Reviewed"/, "no 'Reviewed: the source does not support…' beside a correction");
  // Line items use the same field component, so they carry the name too.
  assert.match(page, /correctedByName: correction\?\.corrected_by_name/);
});

/* ---------- 3. One "Add missing information" entry point ---------- */

test("the field menu item names the first fields it offers", () => {
  assert.equal(addableHint(["payment_terms", "purchase_order_number", "received_date"]), "terms, PO number, …");
  assert.equal(addableHint([]), "");
});

test("the field and line forms sit behind one button; the reading notes moved into the status details", () => {
  const page = source("features/common/documents/document-review.tsx");
  assert.match(page, /<AddMissingInfo /);
  assert.doesNotMatch(page, /<AddFieldControl /);
  assert.equal((page.match(/<MissingLineForm /g) ?? []).length, 1);
  assert.match(page, /<MissingLineForm embedded /);
  const details = page.slice(page.indexOf('className="review-field-group review-status-details"'), page.indexOf("<ProcessingPanel"));
  assert.match(details, /aria-label="Reading notes"/);
  const extras = source("features/common/documents/review/review-extras.tsx");
  assert.match(extras, />Add missing information</);
  assert.ok(extras.includes('role="menuitem" onClick={() => pick("field")}>A field <small>'));
  assert.ok(extras.includes('role="menuitem" onClick={() => pick("line")}>A line item <small>'));
});

/* ---------- 4. Not addressed to this company ---------- */

test("another company's document reads as such, with a Set aside shortcut", () => {
  const finding = result({ rule: "BUYER-NOT-COMPANY", result: "FAIL", field: "customer", preventsApproval: true,
    message: "This document is addressed to Puncak Tanjung Catering, not Ketapang Nibong Trading Sdn. Bhd. If it isn't yours, set it aside." });
  assert.equal(checkSentence(finding), finding.message);
  assert.equal(checkShortcut(finding), "set-aside");
  assert.deepEqual(reviewNoticeChecks([finding], () => true), [finding]);
  // KNT's own bill: the passed row says so, not "Not addressed to this company" beside OK.
  const own = result({ rule: "BUYER-NOT-COMPANY", result: "PASS", field: "customer", message: "Addressed to this company." });
  assert.equal(checkSentence(own), "Addressed to this company.");
  assert.equal(checkShortcut(own), null);
  assert.deepEqual(reviewNoticeChecks([own], () => false), []);
  // The exceptions list uses the rule title, which must not leak the code.
  assert.equal(ruleSentence("VALIDATION:BUYER-NOT-COMPANY"), "Not addressed to this company: if it isn't yours, set it aside.");
});

test("a supplier check skipped for another company's document does not say 'New supplier: add it to Contacts'", () => {
  const skipped = result({ rule: "EX-008", result: "NOT_APPLICABLE", checkStatus: "NOT_APPLICABLE",
    message: "Supplier matching is skipped: this document is addressed to another company." });
  assert.equal(checkSentence(skipped), skipped.message);
  assert.doesNotMatch(checkSentence(skipped), /add it to Contacts/);
  // A real "new supplier" finding keeps its instruction.
  assert.equal(checkSentence(result({ rule: "EX-008", result: "FAIL", field: "supplier", message: "Supplier matching requires review." })),
    "New supplier: add it to Contacts.");
});

test("Set aside… reuses the page's SetAsideControl, and set-aside.tsx is not changed", () => {
  const page = source("features/common/documents/document-review.tsx");
  assert.match(page, /<span ref=\{setAsideRef\} className="review-set-aside-holder"><SetAsideControl /);
  assert.match(page, /onSetAside=\{canSetAside \? openSetAside : undefined\}/);
  assert.match(source("features/common/documents/set-aside.tsx"), /export function SetAsideControl\(\{ documentId, busy, onDone \}/);
});

test("a set-aside document is read-only: no edits, type choice, submit, approve or save to records", () => {
  const page = source("features/common/documents/document-review.tsx");
  assert.match(page, /const setAside = !!data\.doc\.excludedAt;/);
  assert.match(page, /const readonly = sourceReadonly \|\| setAside \|\|/);
  assert.match(page, /const canRevalidate = !setAside &&/);
  assert.match(page, /const canChooseType = !setAside &&/);
  assert.match(page, /const canStandardise = !setAside &&/);
  // The review actions (save, submit, approve, set aside) give way to a note; the banner keeps Restore for local admins.
  assert.match(page, /\{setAside \? <p className="notice warning review-set-aside-readonly"/);
  assert.match(page, /<SetAsideBanner excludedAt=\{data\.doc\.excludedAt\}/);
  // Anything that saves still checks readonly / canRevalidate, so the keyboard path (Ctrl+Enter) is refused too.
  assert.match(page, /if \(readonly \|\| !canRevalidate\) \{ setFailure/);
});

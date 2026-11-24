import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKEND_RULE_CODES, documentStatusLabel, evidenceLabel, extractionStateLabel, isKnownRule, readyLabel, reviewSignalLabel,
  ruleCode, ruleSentence, ruleTitle, statusLabel, statusTone,
} from "../src/lib/glossary";

// Copied by hand from the backend (validation/documents/*.py) on 2026-11-14, so this list is an
// independent check of the glossary, not a copy of its own keys.
const EMITTED_BY_BACKEND = [
  "EX-001", "EX-002", "EX-003", "EX-004", "EX-005", "EX-006", "EX-007", "EX-008", "EX-009", "EX-010",
  "BR-CO-10", "BR-CO-13", "BR-CO-14", "BR-CO-15", "BR-CO-16", "BR-CO-17",
  "PROFILE-001", "PROFILE-REQUIRED", "RCP-TRANSACTION-TIME", "RCP-PAYMENT-METHOD", "RCP-005",
  "AP-RECEIVED-DATE", "AP-009", "NOTE-LINK", "TAX-STATUS", "MODEL-DISAGREEMENT", "AMOUNT-PLAUSIBLE",
  ...["BILL", "RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"].flatMap((kind) =>
    ["FORMAT", "REQUIRED", "DATES", "LINE_MATH", "SUBTOTAL", "AMOUNT_DUE", "SIGN", "TOTAL"].map((rule) => `${kind}-${rule}`)),
];
const FALLBACK = ruleSentence("NOT-A-REAL-CODE");

test("every rule code the backend can emit has its own plain sentence", () => {
  for (const code of EMITTED_BY_BACKEND) {
    assert.ok(isKnownRule(code), `${code} has no glossary entry`);
    const sentence = ruleSentence(code);
    assert.notEqual(sentence, FALLBACK, `${code} falls back to the generic sentence`);
    assert.match(sentence, /^[A-Z][^:]+: [a-z].+\.$/, `${code}: "${sentence}" is not "Title: action."`);
    assert.doesNotMatch(sentence, /EX-|BR-|PROFILE|OCR|Docling|model|JSON/i, `${code} leaks a system term`);
  }
  for (const code of BACKEND_RULE_CODES) assert.ok(EMITTED_BY_BACKEND.includes(code), `${code} is not emitted by the backend list`);
});

test("unknown, empty and prefixed codes never give a blank sentence", () => {
  for (const code of ["", null, undefined, "XYZ-999", "BILL-SOMETHING_NEW", "   "]) {
    const sentence = ruleSentence(code);
    assert.ok(sentence.trim().length > 0);
    assert.equal(sentence, FALLBACK);
    assert.equal(ruleTitle(code), "Needs a check");
  }
  assert.equal(ruleCode("VALIDATION:ex-008"), "EX-008");
  assert.equal(ruleSentence("VALIDATION:EX-008"), "New supplier: add it to Contacts.");
});

test("a new counterparty says supplier or customer by the field", () => {
  assert.equal(ruleSentence("EX-008", "supplier"), "New supplier: add it to Contacts.");
  assert.equal(ruleSentence("EX-008", "customer"), "New customer: add it to Contacts.");
  assert.equal(ruleSentence("RECEIPT-REQUIRED"), "Missing detail: fill it in from the receipt.");
});

test("a document that passed every check says it is ready, in the word of the person who acts next", () => {
  assert.equal(readyLabel("ACCOUNTANT"), "Ready to submit");
  assert.equal(readyLabel("LOCAL_ADMIN"), "Ready to approve");
  // Same predicate as the ready lane: only a document still waiting for the accountant, and only when the backend says so.
  assert.equal(documentStatusLabel("EXTRACTED", true, "ACCOUNTANT"), "Ready to submit");
  assert.equal(documentStatusLabel("CORRECTED", true, "ACCOUNTANT"), "Ready to submit");
  assert.equal(documentStatusLabel("EXTRACTED", true, "LOCAL_ADMIN"), "Ready to approve");
  assert.equal(documentStatusLabel("EXTRACTED", false, "ACCOUNTANT"), "Read, to check");
  assert.equal(documentStatusLabel("EXTRACTED", undefined, "ACCOUNTANT"), "Read, to check");
  assert.equal(documentStatusLabel("EXCEPTION", true, "ACCOUNTANT"), "Needs fixing", "an exception is never ready");
  assert.equal(documentStatusLabel("IN_REVIEW", true, "ACCOUNTANT"), "In review");
  assert.equal(documentStatusLabel("COMPLETED", true, "ACCOUNTANT"), "Saved to records");
});

test("statuses read as accountant words and keep their colour", () => {
  assert.equal(statusLabel("EXTRACTED"), "Read, to check");
  assert.equal(statusLabel("EXCEPTION"), "Needs fixing");
  assert.equal(statusLabel("PROCESSING"), "Reading document");
  assert.equal(statusLabel("COMPLETED"), "Saved to records");
  assert.equal(statusLabel("needs_review"), "Please check");
  assert.equal(statusLabel("SOMETHING_ELSE"), "Something else");
  assert.equal(statusLabel(""), "Unknown");
  assert.equal(statusTone("FAILED"), "red");
  assert.equal(statusTone("EXCEPTION"), "amber");
  assert.equal(statusTone("COMPLETED"), "green");
  assert.equal(statusTone("UNMATCHED"), "neutral");
});

test("review signals and extraction states use the plan's words", () => {
  assert.equal(reviewSignalLabel("verified"), "Read from document");
  assert.equal(reviewSignalLabel("check"), "Please check");
  assert.equal(reviewSignalLabel("suggestion"), "Suggested");
  assert.equal(reviewSignalLabel("missing"), "Not found");
  assert.equal(reviewSignalLabel("new-signal"), "Please check");
  assert.equal(reviewSignalLabel(undefined), "Please check");
  assert.equal(evidenceLabel("source_backed"), "Read from document");
  assert.equal(evidenceLabel("nope"), "Please check");
  assert.equal(extractionStateLabel("ambiguous"), "Unclear, choose a value");
  assert.equal(extractionStateLabel(null), "Please check");
});

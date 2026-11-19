import test from "node:test";
import assert from "node:assert/strict";
import {
  CHOOSABLE_DOCUMENT_KINDS, documentKindLabel, formatChosenBy, readingFacts, readingReason, ruleSentence, ruleTitle,
  typePendingCheck, typeWasLookedFor,
} from "../src/lib/glossary";
import { mapExtraction, sourceKind, validationSummary } from "../src/lib/api/document-contract";
import type { ValidationResult } from "../src/types";

// Shapes copied from the seeded local E1 company (read with AI_EXTRACTION off), 2026-11-19.
const PDF_NOT_READ = {
  provenance: { ai: { mode: "off", image_sent: false } },
  issues: [{ code: "OCR_REQUIRES_REVIEW", detail: "Values are read from the document and require source review." }],
  document_type: { value: "unknown", status: "unknown", method: "none", reason: "NO_AUTOMATIC_MAPPING", candidates: [] },
};
const PHOTO_NOT_A_RECEIPT = {
  provenance: { ai: { mode: "off", image_sent: false } },
  issues: [{ code: "OCR_REQUIRES_REVIEW" }],
  document_type: { value: "unknown", status: "unknown", method: "ocr_receipt_heading_rules", reason: "RECEIPT_REQUIRES_REVIEW" },
};
const MODEL_DOWN = {
  provenance: { ai: { mode: "text", image_sent: false, error: "PROVIDER_TIMEOUT" } },
  issues: [{ code: "AI_UNAVAILABLE", detail: "The text model could not be used (PROVIDER_TIMEOUT)." }],
  document_type: { value: "unknown", status: "unknown", method: "none", reason: "NO_AUTOMATIC_MAPPING" },
};

test("EX-002 on the document type asks for the type, not for a date or amount", () => {
  assert.equal(ruleSentence("EX-002", "document_type"), "Type not certain: choose the document type.");
  assert.equal(ruleSentence("VALIDATION:EX-002", "document_type"), "Type not certain: choose the document type.");
  assert.equal(ruleTitle("EX-002", "document_type"), "Type not certain");
  // Other EX-002 findings keep the value wording.
  assert.equal(ruleSentence("EX-002", "date"), "Unclear value: correct the date, amount or number so it matches the document.");
  assert.equal(ruleSentence("EX-002"), "Unclear value: correct the date, amount or number so it matches the document.");
});

test("checks that exist only because the type is unknown wait for the type", () => {
  for (const rule of ["UNKNOWN_REQUIRED_FIELDS", "UNKNOWN_FINANCIAL_MATH", "NONE_FINANCIAL_MATH", "unknown_required_fields"]) {
    assert.ok(typePendingCheck(rule), rule);
    assert.equal(ruleSentence(rule), "Runs after the type is chosen: choose the document type first.");
  }
  for (const rule of ["BILL-REQUIRED", "STATEMENT_REQUIRED_FIELDS", "EX-002", "UNKNOWN_TOTAL"]) assert.equal(typePendingCheck(rule), false, rule);
});

test("type-pending checks do not count as problems to fix, the type finding still does", () => {
  const results: ValidationResult[] = [
    { rule: "EX-002", field: "document_type", result: "FAIL", message: "kind unknown", preventsApproval: true },
    { rule: "UNKNOWN_REQUIRED_FIELDS", result: "WARNING", checkStatus: "NOT_CHECKED", message: "policy", preventsApproval: true },
    { rule: "UNKNOWN_FINANCIAL_MATH", result: "WARNING", checkStatus: "NOT_CHECKED", message: "policy", preventsApproval: true },
  ];
  const summary = validationSummary(results);
  assert.equal(summary.blocking, 1);
  assert.equal(summary.notChecked, 2);
  assert.equal(validationSummary(results.slice(1)).blocking, 0);
});

test("the reason says reading was switched off, not that no heading names the type", () => {
  const facts = readingFacts(PDF_NOT_READ, "application/pdf");
  assert.deepEqual(facts, { aiMode: "off", aiError: null, issueCodes: ["OCR_REQUIRES_REVIEW"], typeStatus: "unknown",
    typeReason: "NO_AUTOMATIC_MAPPING", typeMethod: "none", isPdf: true });
  assert.equal(typeWasLookedFor(facts), false);
  const reason = readingReason(facts)!;
  assert.match(reason, /^Automatic reading is switched off on this installation, so this PDF was not read\. Choose the type and enter the details/);
  assert.doesNotMatch(reason, /heading|Read again/);
  assert.match(readingReason(facts, { typeChosen: true })!, /not read\. Enter the details from the document\./);
});

test("each reading outcome gets its own honest reason", () => {
  const photo = readingReason(readingFacts(PHOTO_NOT_A_RECEIPT, "image/jpeg"))!;
  assert.match(photo, /switched off.*basic receipt rules.*could not confirm it is a receipt/);
  assert.equal(typeWasLookedFor(readingFacts(PHOTO_NOT_A_RECEIPT)), true);
  assert.match(readingReason(readingFacts(MODEL_DOWN, "application/pdf"))!, /could not be reached \(PROVIDER_TIMEOUT\), so this PDF was only read with the basic rules/);
  assert.match(readingReason({ aiMode: "text", aiError: "AI_RESULT_REJECTED_BY_CONTRACT", typeStatus: "unknown" })!, /did not fit the accounting fields/);
  assert.match(readingReason({ issueCodes: ["OCR_NO_TEXT"], isPdf: true })!, /^No text could be found in this PDF/);
  assert.match(readingReason({ aiMode: "text", typeStatus: "unknown", typeMethod: "explicit_heading_rules", typeReason: "NO_SUPPORTED_DOCUMENT_HEADING" })!,
    /^No heading on the document names its type\./);
  assert.equal(readingReason({ aiMode: "off", typeStatus: "classified", typeReason: "CORROBORATED_OCR_INVOICE", typeMethod: "native_ocr_heading_rules" }), null);
  assert.equal(readingReason(readingFacts(undefined)), "This document was not read automatically. Choose the type and enter the details from the document.");
});

test("a person's type choice settles the kind the page works with, notes included", () => {
  const extraction = mapExtraction({ documentId: "d", contentRevision: 3, raw: PDF_NOT_READ, classification: PDF_NOT_READ.document_type,
    kindDecision: { value: "credit_note", status: "classified", reason: "CHOSEN_BY_REVIEWER", chosenBy: "Aina", chosenAt: "2026-11-19T03:00:00+00:00" } });
  assert.equal(extraction.kindDecision?.value, "credit_note");
  assert.equal(extraction.classification?.reason, "NO_AUTOMATIC_MAPPING");
  assert.equal(sourceKind(extraction, "CREDIT_NOTE"), "CREDIT_NOTE");
  assert.equal(sourceKind({ classification: extraction.classification, kindDecision: null }, "INVOICE"), "UNKNOWN");
  assert.equal(mapExtraction({ documentId: "d" }).kindDecision, null);
  assert.equal(formatChosenBy(extraction.kindDecision!), "Chosen by Aina on 2026-11-19.");
  assert.equal(formatChosenBy({}), "Chosen by a reviewer.");
});

test("the type menu offers the five kinds in plain words", () => {
  assert.deepEqual(CHOOSABLE_DOCUMENT_KINDS.map(documentKindLabel), ["Invoice", "Bill", "Receipt", "Credit note", "Debit note"]);
});

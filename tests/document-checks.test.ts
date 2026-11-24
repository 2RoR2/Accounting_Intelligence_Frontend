import test from "node:test";
import assert from "node:assert/strict";
import {
  applySuggestion, canApply, checkTarget, draftStorageKey, findingKey, flaggedTargets, forgetDraft, keepDraft, leavesPage,
  openWarnings, partitionFindings, readDraft, sentLineKeys, summaryLabel, CHECKED_TYPES,
} from "../src/features/common/erp/checks-logic";
import type { CheckFinding } from "../src/lib/api/checks.service";
import type { DocumentLine } from "../src/lib/api/erp.service";

const finding = (over: Partial<CheckFinding>): CheckFinding => ({
  code: "PRICE_LIST_DIFFERS", severity: "warn", field: "unitPrice", lineIndex: 0, message: "m", howToFix: "h", ...over,
});
const line = (over: Partial<DocumentLine> = {}): DocumentLine => ({ description: "Cement", quantity: "1", unitPrice: "10", ...over });
const isBlank = (value: DocumentLine) => !value.description.trim() && !value.unitPrice;

test("findings sort most severe first and ignored ones move aside", () => {
  const note = finding({ code: "SOURCE_LINE_ADDED", severity: "info", field: "description", lineIndex: 2 });
  const block = finding({ code: "CONTACT_MISSING", severity: "block", field: "contactId", lineIndex: undefined });
  const warn = finding({});
  const { open, ignored } = partitionFindings([note, warn, block], new Set([findingKey(note)]));
  assert.deepEqual(open.map((f) => f.code), ["CONTACT_MISSING", "PRICE_LIST_DIFFERS"]);
  assert.deepEqual(ignored.map((f) => f.code), ["SOURCE_LINE_ADDED"]);
  // The confirm step lists open blocks and warnings only.
  assert.deepEqual(openWarnings([note, warn, block], new Set([findingKey(warn)])).map((f) => f.code), ["CONTACT_MISSING"]);
});

test("the summary counts what is open", () => {
  assert.equal(summaryLabel([]), "No issues found");
  assert.equal(summaryLabel([finding({}), finding({ lineIndex: 1 }), finding({ severity: "info" })]), "2 warnings · 1 note");
  assert.equal(summaryLabel([finding({ severity: "block" })]), "1 to fix before saving");
});

test("each finding points at its line or field, and highlights the worst open severity", () => {
  assert.equal(checkTarget({ field: "unitPrice", lineIndex: 3 }), "check-line-3");
  assert.equal(checkTarget({ field: "dueDate" }), "check-field-dueDate");
  const flags = flaggedTargets([
    finding({}), finding({ code: "DISCOUNT_TOO_LARGE", severity: "block", field: "discount" }),
    finding({ code: "SOURCE_LINE_ADDED", severity: "info", field: "description", lineIndex: 1 }),
    finding({ code: "VALID_UNTIL_PAST", field: "dueDate", lineIndex: undefined }),
  ], new Set());
  assert.equal(flags.get("check-line-0"), "block");
  assert.equal(flags.get("check-line-0:unitPrice"), "warn");
  assert.equal(flags.get("check-field-dueDate"), "warn");
  assert.equal(flags.has("check-line-1"), false, "notes are not highlighted");
});

test("apply maps the server's line index past blank lines to the form line, and only on known fields", () => {
  const lines = [{ key: 7, value: line({ description: "", unitPrice: "" }) }, { key: 9, value: line() }, { key: 12, value: line() }];
  assert.deepEqual(sentLineKeys(lines, isBlank), [9, 12]);
  assert.deepEqual(applySuggestion({ field: "unitPrice", value: "100.00", label: "Use 100.00", lineIndex: 1 }, lines, isBlank),
    { kind: "line", key: 12, changes: { unitPrice: "100.00" } });
  assert.deepEqual(applySuggestion({ field: "dueDate", value: "2026-12-25", label: "x" }, lines, isBlank),
    { kind: "header", changes: { dueDate: "2026-12-25", dueDateAuto: false } });
  // A printed line amount is not a form field: shown, never applied.
  assert.equal(canApply({ field: "amount", value: "99.01", label: "Line amount 99.01", lineIndex: 0 }), false);
  assert.equal(applySuggestion({ field: "amount", value: "99.01", label: "x", lineIndex: 0 }, lines, isBlank), null);
  assert.equal(applySuggestion({ field: "unitPrice", value: "1", label: "x", lineIndex: 5 }, lines, isBlank), null, "line gone");
});

test("unsaved drafts are kept per type and id and survive blocked storage", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k) };
  const key = draftStorageKey("quotation", "abc");
  assert.equal(key, "accordai:unsaved:quotation:abc");
  assert.equal(draftStorageKey("invoice", null), "accordai:unsaved:invoice:new");
  assert.equal(keepDraft(storage, key, { lines: [] }, "2026-11-25T01:00:00Z", new Date("2026-11-25T02:00:00Z")), true);
  assert.deepEqual(readDraft(storage, key), { savedAt: "2026-11-25T02:00:00.000Z", baseUpdatedAt: "2026-11-25T01:00:00Z", draft: { lines: [] } });
  forgetDraft(storage, key);
  assert.equal(readDraft(storage, key), null);
  const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("denied"); } };
  assert.equal(keepDraft(blocked, key, {}, null), false);
  assert.equal(readDraft(blocked, key), null);
  assert.doesNotThrow(() => forgetDraft(blocked, key));
  store.set(key, "{not json");
  assert.equal(readDraft(storage, key), null);
});

test("only in-app links to another page ask before leaving", () => {
  const here = { origin: "http://localhost:3000", pathname: "/workspace/sales/abc", search: "?type=invoice" };
  assert.equal(leavesPage({ href: "http://localhost:3000/workspace/sales?type=invoice" }, here), true);
  assert.equal(leavesPage({ href: "http://localhost:3000/workspace/sales/abc?type=invoice" }, here), false);
  assert.equal(leavesPage({ href: "http://localhost:3000/x", target: "_blank" }, here), false);
  assert.equal(leavesPage({ href: "https://example.com/" }, here), false);
  assert.equal(leavesPage({ href: "http://localhost:3000/file.pdf", download: true }, here), false);
});

test("the checked types are the typed sales documents and supplier bills", () => {
  for (const type of ["quotation", "sales-order", "invoice", "credit-note", "debit-note", "bill"] as const) assert.ok(CHECKED_TYPES.has(type));
  assert.equal(CHECKED_TYPES.has("payment"), false);
});

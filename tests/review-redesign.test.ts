/** 25 Nov review redesign: the status strip, the per-field second reading and the "Change type" popover. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TYPE_POPOVER_CLOSED, canAskSecondReading, secondReadingFor, secondReadingOn, secondReadingsElsewhere, statusCounts, statusStrip,
  typeButton, typePopover,
} from "../src/features/common/documents/review/review-status";
import type { ReviewEntry } from "../src/features/common/documents/review/review-logic";
import type { AiAssistState } from "../src/types";

const entries = (signals: Record<string, ReviewEntry["signal"]>): ReviewEntry[] => Object.entries(signals).map(([key, signal]) => ({ key, signal }));

/* ---------- Status strip ---------- */

test("the strip counts fields by signal; 'to check' matches the 'Only fields to check' filter", () => {
  const counts = statusCounts(entries({ total: "check", tax: "check", date: "suggestion", supplier: "verified", po: "missing", due: "missing" }));
  assert.deepEqual(counts, { check: 2, suggestion: 1, read: 1, missing: 2 });
  const parts = statusStrip(counts, { passed: 8, failed: 1, notChecked: 2, blocking: 1 }, 6);
  assert.deepEqual(parts.map(part => part.text), ["3 to check", "1 read", "2 not found", "Checks: 8 passed, 1 failed, 2 not run"]);
  assert.deepEqual(parts.map(part => part.id), ["to-check", "read", "not-found", "checks"]);
  assert.deepEqual(parts.map(part => part.tone), ["warning", "neutral", "danger", "danger"]);
  assert.match(parts[0].title, /2 fields say "Please check"; 1 field has a suggested value/);
  assert.match(parts[3].title, /1 check blocks approval/);
});

test("a clean document reads like the example in the brief", () => {
  const parts = statusStrip({ check: 0, suggestion: 0, read: 13, missing: 0 }, { passed: 8, failed: 0, notChecked: 2, blocking: 0 }, 13);
  assert.equal(parts.map(part => part.text).join(" · "), "0 to check · 13 read · 0 not found · Checks: 8 passed, 2 not run");
  assert.deepEqual(parts.map(part => part.tone), ["ok", "neutral", "neutral", "ok"]);
});

test("without fields only the checks show; without a report the checks are left out", () => {
  assert.deepEqual(statusStrip({ check: 0, suggestion: 0, read: 0, missing: 0 }, { passed: 0, failed: 1, notChecked: 2, blocking: 1 }, 0).map(part => part.text),
    ["Checks: 0 passed, 1 failed, 2 not run"]);
  assert.deepEqual(statusStrip({ check: 1, suggestion: 0, read: 0, missing: 0 }, null, 1).map(part => part.id), ["to-check", "read", "not-found"]);
  assert.deepEqual(statusStrip({ check: 0, suggestion: 0, read: 0, missing: 0 }, null, 0), []);
  // A failed check that does not block approval is a warning, not a danger.
  assert.equal(statusStrip({ check: 0, suggestion: 0, read: 1, missing: 0 }, { passed: 1, failed: 1, notChecked: 0, blocking: 0 }, 1)[3].tone, "warning");
});

/* ---------- Second reading ---------- */

const row = (stored_key: string) => ({ field: stored_key, stored_key, outcome: "UNVERIFIED_MODEL_SUGGESTION" as const, candidate: "1.00", explanation: "" });
const assist = (patch: Partial<AiAssistState> = {}): AiAssistState => ({
  available: true, supportedFields: [{ field: "total_amount", storedKey: "total" }, { field: "invoice_date", storedKey: "date" }],
  latest: { status: "done", attempt_id: "a1", fields: [row("total"), row("tax")] }, decisions: [], ...patch,
});

test("the second reading is hidden entirely when it is not switched on", () => {
  const off = assist({ available: false });
  assert.equal(secondReadingOn(off), false);
  assert.equal(secondReadingOn(null), false);
  assert.equal(canAskSecondReading(off, "total", false), false);
  // Even an earlier result is not shown while it is off.
  assert.equal(secondReadingFor(off, "total"), null);
  assert.deepEqual(secondReadingsElsewhere(off, new Set()), []);
});

test("when on, 'Ask AI to re-read' shows beside supported fields only, and never on a read-only document", () => {
  const on = assist();
  assert.equal(secondReadingOn(on), true);
  assert.equal(canAskSecondReading(on, "total", false), true);
  assert.equal(canAskSecondReading(on, "date", false), true);
  assert.equal(canAskSecondReading(on, "supplier", false), false);
  assert.equal(canAskSecondReading(on, "total", true), false);
});

test("each result shows under its own field; results for fields not on screen are listed apart", () => {
  const on = assist();
  assert.equal(secondReadingFor(on, "total")?.candidate, "1.00");
  assert.equal(secondReadingFor(on, "date"), null);
  assert.deepEqual(secondReadingsElsewhere(on, new Set(["total"])).map(item => item.stored_key), ["tax"]);
  assert.deepEqual(secondReadingsElsewhere(assist({ latest: null }), new Set()), []);
});

test("the old second-reading panel above the fields is gone and nothing applies before Accept", () => {
  const page = readFileSync("src/features/common/documents/document-review.tsx", "utf8");
  const field = readFileSync("src/features/common/documents/review/second-reading.tsx", "utf8");
  assert.doesNotMatch(page, /AiAssistPanel|The second reading is not switched on/);
  assert.match(field, /Ask AI to re-read/);
  assert.match(field, /no value changes until you accept it/);
  // The only write is inside decide(), behind accept.
  assert.match(field, /if \(accept\) await updateExtractedField/);
});

/* ---------- "Change type" popover ---------- */

test("the type popover opens, closes on Escape or 'Keep this type' with focus returned, and closes after saving", () => {
  let state = TYPE_POPOVER_CLOSED;
  state = typePopover(state, "toggle");
  assert.deepEqual(state, { open: true, restoreFocus: false });
  assert.deepEqual(typePopover(state, "escape"), { open: false, restoreFocus: true });
  assert.deepEqual(typePopover(state, "keep"), { open: false, restoreFocus: true });
  assert.deepEqual(typePopover(state, "toggle"), { open: false, restoreFocus: true });
  assert.deepEqual(typePopover(state, "saved"), TYPE_POPOVER_CLOSED);
  // Escape while closed changes nothing (focus is not pulled back to the button).
  assert.equal(typePopover(TYPE_POPOVER_CLOSED, "escape"), TYPE_POPOVER_CLOSED);
});

test("the button says 'Choose type' while the type is not certain and 'Change type' otherwise; none without permission", () => {
  assert.deepEqual(typeButton({ canChoose: true, needsType: true }), { label: "Choose type", close: "Not now", heading: "Choose the document type" });
  assert.deepEqual(typeButton({ canChoose: true, needsType: false }), { label: "Change type", close: "Keep this type", heading: "Change the document type" });
  assert.equal(typeButton({ canChoose: false, needsType: true }), null);
});

test("the review page opens the type picker beside the button, not in the notice at the top of the page", () => {
  const page = readFileSync("src/features/common/documents/document-review.tsx", "utf8");
  assert.doesNotMatch(page, /changingType/);
  assert.match(page, /<DocumentTypeNotice [^>]*needsType=\{needsType\}/);
  assert.match(page, /<TypePicker /);
  const view = readFileSync("src/features/common/documents/review/review-status-view.tsx", "utf8");
  assert.match(view, /role="dialog"/);
  assert.match(view, /event\.key !== "Escape"/);
});

/* ---------- Header name ---------- */

test("the header and the source panel use the list's display name; Open original still serves the stored file", () => {
  const page = readFileSync("src/features/common/documents/document-review.tsx", "utf8");
  assert.match(page, /const displayName = documentDisplayName\(data\.doc, data\.doc\.name\)/);
  assert.match(page, /title=\{displayName\}/);
  assert.match(page, /<ReviewSource documentId=\{documentId\} name=\{displayName\}/);
  const source = readFileSync("src/features/common/documents/review/source-pages.tsx", "utf8");
  assert.match(source, /Open original/);
});

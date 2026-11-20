import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNAL_TEXT, evidenceBox, fieldSignal, isToCheck, laneQueue, neighbourDocument, nextAfterSubmit, notFoundEntries, reviewOrder,
  reviewShortcut, stepField, suggestedValue, visibleEntries, revisionToSubmit, settleDraft, stableOrder, enterAction, findLane, laneIds, unsavedOutside, documentTarget, evidenceCaption,
} from "../src/features/common/documents/review/review-logic";
import { loadReviewQueue, reloadReviewQueue } from "../src/features/common/documents/review/use-review-queue";
import type { ExtractedField, SourceEvidence } from "../src/types";

const field = (patch: Partial<ExtractedField> = {}): ExtractedField => ({ label: "x", value: "1", original: "1", confidence: null, ...patch });

/* ---------- Signal mapping ---------- */

test("each review signal is shown in plain words", () => {
  assert.deepEqual(SIGNAL_TEXT, { verified: "Read from the document", check: "Please check", suggestion: "Suggested", missing: "Not found" });
});

test("the backend signal is used as is", () => {
  for (const signal of ["verified", "check", "suggestion", "missing"] as const) assert.equal(fieldSignal("total", field({ reviewSignal: signal })), signal);
});

test("a person's correction settles a field, and a failed check always asks for a check", () => {
  assert.equal(fieldSignal("total", field({ reviewSignal: "check", correctedBy: "Aina" })), "verified");
  assert.equal(fieldSignal("total", field({ reviewSignal: "verified" }), ["total"]), "check");
  // Validation names some fields differently from the extraction (invoice_number -> invoice).
  assert.equal(fieldSignal("invoice", field({ reviewSignal: "verified" }), ["invoice_number"]), "check");
  assert.equal(fieldSignal("date", field({ reviewSignal: "verified" }), ["total"]), "verified");
});

test("older results without a signal fall back to evidence status, then extraction state", () => {
  assert.equal(fieldSignal("a", field({ evidenceStatus: "source_backed" })), "verified");
  assert.equal(fieldSignal("a", field({ evidenceStatus: "model_suggested" })), "suggestion");
  assert.equal(fieldSignal("a", field({ evidenceStatus: "missing" })), "missing");
  assert.equal(fieldSignal("a", field({ evidenceStatus: "conflicting" })), "check");
  assert.equal(fieldSignal("a", field({ state: "resolved" })), "verified");
  assert.equal(fieldSignal("a", field({ state: "missing" })), "missing");
  assert.equal(fieldSignal("a", field()), "check");
  assert.equal(fieldSignal("a", field({ reviewSignal: "bogus" as never, evidenceStatus: "source_backed" })), "verified");
});

/* ---------- Order and the "Only fields to check" filter ---------- */

const fields = {
  supplier: field({ reviewSignal: "verified" }),
  date: field({ reviewSignal: "check" }),
  total: field({ reviewSignal: "suggestion" }),
  due: field({ reviewSignal: "missing" }),
  invoice: field({ reviewSignal: "check" }),
  currency: field({ reviewSignal: "verified" }),
};

test("fields to check come first, then suggestions, not found, and read fields, in document order within each", () => {
  assert.deepEqual(reviewOrder(fields).map(e => e.key), ["date", "invoice", "total", "due", "supplier", "currency"]);
});

test("the filter shows check and suggested fields, lists not-found ones apart, and keeps fields that needed a check", () => {
  const order = reviewOrder(fields);
  assert.deepEqual(visibleEntries(order, true).map(e => e.key), ["date", "invoice", "total"]);
  assert.deepEqual(notFoundEntries(order, true).map(e => e.key), ["due"]);
  assert.deepEqual(visibleEntries(order, false).map(e => e.key), order.map(e => e.key));
  assert.deepEqual(notFoundEntries(order, false), []);
  const corrected = reviewOrder({ ...fields, date: field({ reviewSignal: "check", correctedBy: "Aina" }) });
  assert.deepEqual(visibleEntries(corrected, true).map(e => e.key), ["invoice", "total"]);
  assert.deepEqual(visibleEntries(corrected, true, new Set(["date"])).map(e => e.key), ["invoice", "total", "date"]);
  // A missing value a failed check needs is "Please check", so it is in the list, not the not-found group.
  const failing = reviewOrder({ total: field({ reviewSignal: "missing", value: null }) }, ["total"]);
  assert.deepEqual(visibleEntries(failing, true).map(e => e.key), ["total"]);
  assert.equal(isToCheck("missing"), false);
  assert.equal(isToCheck("suggestion"), true);
});

/* ---------- Keyboard ---------- */

test("Tab and Shift+Tab step through the fields to check and stop at either end", () => {
  const keys = ["date", "invoice", "total"];
  assert.equal(stepField(keys, undefined, 1), "date");
  assert.equal(stepField(keys, undefined, -1), "total");
  assert.equal(stepField(keys, "date", 1), "invoice");
  assert.equal(stepField(keys, "invoice", -1), "date");
  assert.equal(stepField(keys, "total", 1), null);
  assert.equal(stepField(keys, "date", -1), null);
  assert.equal(stepField(keys, "supplier", 1), "date");
  assert.equal(stepField([], undefined, 1), null);
});

test("shortcuts: Ctrl+Enter submits, Alt+arrows change document, Tab and Enter act only inside a field", () => {
  assert.equal(reviewShortcut({ key: "Enter", ctrlKey: true }), "submit");
  assert.equal(reviewShortcut({ key: "Enter", metaKey: true }, true), "submit");
  assert.equal(reviewShortcut({ key: "ArrowRight", altKey: true }), "next-document");
  assert.equal(reviewShortcut({ key: "ArrowLeft", altKey: true }), "previous-document");
  assert.equal(reviewShortcut({ key: "ArrowLeft", altKey: true, shiftKey: true }), null);
  assert.equal(reviewShortcut({ key: "Tab" }), null);
  assert.equal(reviewShortcut({ key: "Tab" }, true), "next-field");
  assert.equal(reviewShortcut({ key: "Tab", shiftKey: true }, true), "previous-field");
  assert.equal(reviewShortcut({ key: "Enter" }, true), "accept");
  assert.equal(reviewShortcut({ key: "Enter" }), null);
  assert.equal(reviewShortcut({ key: "Enter", shiftKey: true }, true), null);
  assert.equal(reviewShortcut({ key: "a" }, true), null);
});

test("Enter accepts a value printed on the document before a suggested one, and never the current value", () => {
  assert.equal(suggestedValue({ source: [{ value: "12.00" }], model: [{ value: "13.00" }] }, null), "12.00");
  assert.equal(suggestedValue({ source: [{ value: "12.00" }], model: [{ value: "13.00" }] }, "12.00"), "13.00");
  assert.equal(suggestedValue({ source: [{ value: null }], model: [] }, null), null);
});

/* ---------- Evidence boxes ---------- */

const evidence: SourceEvidence = { page: 1, coordinate_units: "pixels", page_size: { width: 1000, height: 1400 },
  bbox: { l: 100, t: 280, r: 600, b: 420, coord_origin: "TOPLEFT" } };

test("a pixel box scales to the drawn page, whatever size it is drawn at", () => {
  const expected = { left: 10, top: 20, width: 50, height: 10 };
  assert.deepEqual(evidenceBox(evidence, 1, { width: 1000, height: 1400 }, "image"), expected);
  assert.deepEqual(evidenceBox(evidence, 1, { width: 500, height: 700 }, "image"), expected);
  // A PDF page drawn from points (595 x 833) has the same shape as the 1000 x 1400 rendering the reader used.
  assert.deepEqual(evidenceBox(evidence, 1, { width: 595, height: 833 }, "pdf"), expected);
});

test("boxes appear only on their own page, and page 2 evidence draws on page 2", () => {
  assert.equal(evidenceBox(evidence, 2, { width: 1000, height: 1400 }, "pdf"), null);
  assert.deepEqual(evidenceBox({ ...evidence, page: 2 }, 2, { width: 1000, height: 1400 }, "pdf"), { left: 10, top: 20, width: 50, height: 10 });
});

test("unknown origin, units, shape or out-of-page boxes are not drawn", () => {
  const page = { width: 1000, height: 1400 };
  for (const item of [
    { ...evidence, bbox: { ...evidence.bbox!, coord_origin: "BOTTOMLEFT" } },
    { ...evidence, coordinate_units: "inches" },
    { ...evidence, coordinate_units: "document_points", page_size: null },
    { ...evidence, bbox: null },
    ...[{ l: -1 }, { r: 1100 }, { t: NaN }, { b: 200 }, { r: 50 }].map(change => ({ ...evidence, bbox: { ...evidence.bbox!, ...change } })),
  ]) for (const source of ["pdf", "image"] as const) assert.equal(evidenceBox(item, 1, page, source), null);
  assert.equal(evidenceBox(evidence, 1, { width: 1400, height: 1000 }, "pdf"), null);
  assert.equal(evidenceBox(evidence, 1, { width: 0, height: 0 }, "image"), null);
  // Pixel evidence with no page size uses an image's own size.
  assert.deepEqual(evidenceBox({ ...evidence, page_size: undefined }, 1, page, "image"), { left: 10, top: 20, width: 50, height: 10 });
});

test("P2: evidence missing its page, origin or units is never drawn with guessed defaults", () => {
  const page = { width: 1000, height: 1400 };
  for (const source of ["pdf", "image"] as const) {
    assert.equal(evidenceBox({ ...evidence, page: undefined }, 1, page, source), null, "no page");
    assert.equal(evidenceBox({ ...evidence, bbox: { l: 100, t: 280, r: 600, b: 420 } }, 1, page, source), null, "no origin");
    assert.equal(evidenceBox({ ...evidence, coordinate_units: undefined }, 1, page, source), null, "no units");
  }
  // A PDF page is drawn from points: pixel boxes need the size of the page image they were measured on.
  assert.equal(evidenceBox({ ...evidence, page_size: undefined }, 1, page, "pdf"), null);
});

/* ---------- Next document ---------- */

test("the queue is the lane that holds the current document", () => {
  const lanes = { lanes: { ready: [{ id: "r1" }], to_check: [{ id: "a" }, { id: "b" }, { id: "c" }], exceptions: [{ id: "x" }] } };
  assert.deepEqual(laneQueue(lanes, "b"), ["a", "b", "c"]);
  assert.deepEqual(laneQueue(lanes, "r1"), ["r1"]);
  assert.deepEqual(laneQueue(lanes, "zzz"), []);
  assert.deepEqual(laneQueue(null, "a"), []);
});

test("Alt+arrows move to the neighbouring document and stop at the ends", () => {
  const queue = ["a", "b", "c"];
  assert.equal(neighbourDocument(queue, "b", 1), "c");
  assert.equal(neighbourDocument(queue, "b", -1), "a");
  assert.equal(neighbourDocument(queue, "c", 1), null);
  assert.equal(neighbourDocument(queue, "a", -1), null);
  assert.equal(neighbourDocument(queue, "z", 1), "a");
});

test("after a submit the next waiting document in the same lane opens", () => {
  assert.equal(nextAfterSubmit(["a", "b", "c"], ["a", "c"], "b"), "c");
  // b was already done in another tab: skip it.
  assert.equal(nextAfterSubmit(["a", "b", "c", "d"], ["d"], "a"), "d");
  // At the end of the lane, go back to the first document still waiting.
  assert.equal(nextAfterSubmit(["a", "b", "c"], ["a"], "c"), "a");
  // The current document came from elsewhere: the first waiting one.
  assert.equal(nextAfterSubmit([], ["p", "q"], "c"), "p");
  assert.equal(nextAfterSubmit(["a", "b"], ["b"], "b"), null);
  assert.equal(nextAfterSubmit(["a"], [], "a"), null);
});

/* ---------- Codex review fixes (PR #8) ---------- */

test("P1: the submit uses the reviewed revision, moved on only by the accountant's own saves", () => {
  assert.equal(revisionToSubmit(4, []), 4);
  assert.equal(revisionToSubmit(4, [5, 6]), 6);
});

test("P2: a draft is cleared only when stored, or when it is exactly the draft the page saved", () => {
  assert.equal(settleDraft("12.00", "12.00", undefined, undefined).settled, true);
  assert.equal(settleDraft("12.00", "11.00", undefined, undefined).settled, false, "old stored value: still unsaved");
  const note = { value: "1,200.00", id: 1 };
  assert.deepEqual(settleDraft("1,200.00", "1200.00", note, undefined), { settled: true, usedId: 1 }, "the backend normalised the saved draft");
  assert.deepEqual(settleDraft("1,250.00", "1200.00", note, undefined), { settled: false, usedId: 1 }, "typed after the save: stays unsaved");
});

test("P2 (round 2): a save note is used once, so repeating an old saved value later stays unsaved", () => {
  const note = { value: "1,200.00", id: 7 };
  const first = settleDraft("1,200.00", "1200.00", note, undefined);
  assert.equal(first.settled, true);
  // Checks failed; the accountant edits again and types the same text as before. The old note must not clear it.
  assert.deepEqual(settleDraft("1,200.00", "1200.00", note, first.usedId), { settled: false, usedId: 7 });
  // A new save of that draft brings a new note, which settles it once more.
  assert.equal(settleDraft("1,200.00", "1200.00", { value: "1,200.00", id: 8 }, first.usedId).settled, true);
});

test("P1 (round 2): Enter never puts a machine candidate over a person's correction or a filled value", () => {
  assert.equal(enterAction({ dirty: false, value: "Kedai Aina", suggestion: "KEDAI AINA SDN BHD", signal: "verified", corrected: true }), "move");
  assert.equal(enterAction({ dirty: false, value: "Kedai Aina", suggestion: "KEDAI AINA SDN BHD", signal: "check", corrected: true }), "move");
  // A filled "Please check" field with a different candidate: Enter confirms what is shown, never swaps it.
  assert.deepEqual(enterAction({ dirty: false, value: "INV-1", suggestion: "INV-7", signal: "check", corrected: false }), { save: "INV-1" });
  // An empty field takes the candidate; a typed change always wins.
  assert.deepEqual(enterAction({ dirty: false, value: "", suggestion: "INV-7", signal: "missing", corrected: false }), { save: "INV-7" });
  assert.deepEqual(enterAction({ dirty: true, value: "INV-9", suggestion: "INV-7", signal: "check", corrected: true }), { save: "INV-9" });
});

test("P1 (round 2): a line item changed during save and submit stops the submit", () => {
  const headerLabels = new Map([["invoice", "Invoice number"], ["total", "Total"]]);
  const sent = new Map([["invoice", "INV-7"]]);
  // Header drafts this submit saved are excluded; a line edited meanwhile is not.
  assert.deepEqual(unsavedOutside({ unsavedLabels: ["Invoice number", "Line 2 Amount"], headerLabels, pending: new Map([["invoice", "INV-7"]]), sent }), ["Line 2 Amount"]);
  assert.deepEqual(unsavedOutside({ unsavedLabels: ["Invoice number"], headerLabels, pending: new Map([["invoice", "INV-7"]]), sent }), []);
  assert.deepEqual(unsavedOutside({ unsavedLabels: [], headerLabels, pending: new Map(), sent: new Map() }), []);
});

test("P2 (round 3): a field that was sent but now holds a newer value still stops the submit", () => {
  const headerLabels = new Map([["invoice", "Invoice number"], ["total", "Total"]]);
  const sent = new Map([["invoice", "INV-7"]]);
  assert.deepEqual(unsavedOutside({ unsavedLabels: ["Invoice number"], headerLabels, pending: new Map([["invoice", "INV-8"]]), sent }), ["Invoice number"]);
  // A header field that was never sent is caught too.
  assert.deepEqual(unsavedOutside({ unsavedLabels: ["Total"], headerLabels, pending: new Map([["total", "99.00"]]), sent }), ["Total"]);
});

test("P2 (round 3): no other document opens while a save or submit runs", () => {
  const queue = ["a", "b", "c"];
  assert.equal(documentTarget(queue, "b", 1, false), "c");
  assert.equal(documentTarget(queue, "b", -1, false), "a");
  assert.equal(documentTarget(queue, "b", 1, true), null);
  assert.equal(documentTarget(queue, "b", -1, true), null);
});

test("P2 (round 3): the caption says when the page is not recorded, never assumes page 1", () => {
  assert.equal(evidenceCaption({ label: "Total", evidence: [{ page: 2, text: "444.54" }] }, true), 'Total: read on page 2, "444.54".');
  assert.equal(evidenceCaption({ label: "Total", evidence: [{ text: "444.54" }] }, false),
    'Total: read on the document (page not recorded), "444.54". Its place on the page is not recorded.');
  assert.equal(evidenceCaption({ label: "Total", evidence: [] }, false), "Total: where it was read is not recorded.");
  assert.equal(evidenceCaption(undefined, false), "Select a field to see where it was read.");
});

test("P2: the keyboard order stays as opened, so Enter after the last field goes to submit", () => {
  const opening = reviewOrder(fields).map(e => e.key);
  const keys = (map: typeof fields, keep: Set<string>) => stableOrder(visibleEntries(reviewOrder(map), true, keep), opening).map(e => e.key);
  const keep = new Set(["date", "invoice", "total"]);
  // The accountant confirms date, then invoice: both become read fields but keep their places.
  const afterTwo = { ...fields, date: field({ reviewSignal: "check", correctedBy: "Aina" }), invoice: field({ reviewSignal: "check", correctedBy: "Aina" }) };
  assert.deepEqual(keys(afterTwo, keep), ["date", "invoice", "total"]);
  assert.equal(stepField(keys(afterTwo, keep), "total", 1), null, "after the last field: submit, not back to the first");
  assert.equal(stepField(keys(afterTwo, keep), "date", 1), "invoice");
});

test("P2: Enter on a filled 'Please check' field saves it as a confirmation", () => {
  assert.deepEqual(enterAction({ dirty: true, value: "9", suggestion: "8", signal: "check", corrected: false }), { save: "9" });
  assert.deepEqual(enterAction({ dirty: false, value: "9", suggestion: "8", signal: "suggestion", corrected: false }), { save: "8" });
  assert.deepEqual(enterAction({ dirty: false, value: "INV-1", suggestion: null, signal: "check", corrected: false }), { save: "INV-1" });
  assert.equal(enterAction({ dirty: false, value: "INV-1", suggestion: null, signal: "check", corrected: true }), "move", "already confirmed");
  assert.equal(enterAction({ dirty: false, value: "INV-1", suggestion: null, signal: "verified", corrected: false }), "move");
  assert.equal(enterAction({ dirty: false, value: " ", suggestion: null, signal: "check", corrected: false }), "move", "nothing to confirm");
  // The API refuses control characters, so a multi-line printed address cannot be saved unchanged: move on instead of a 422.
  assert.equal(enterAction({ dirty: false, value: "No. 80, Jalan Belatuk\nTaman Cempedak", suggestion: null, signal: "check", corrected: false }), "move");
});

test("P2: after a submit the next document comes from the lane the page opened in", async () => {
  const lanes = [
    { lanes: { ready: [{ id: "r1" }, { id: "r2" }], to_check: [{ id: "a" }, { id: "b" }], exceptions: [] } },
    // After "a" was submitted it left its lane; the other lanes are unchanged.
    { lanes: { ready: [{ id: "r1" }, { id: "r2" }], to_check: [{ id: "b" }], exceptions: [] } },
  ];
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify(lanes[Math.min(call++, 1)]), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const opened = await loadReviewQueue("a");
    assert.deepEqual(opened, { source: { kind: "lanes", lane: "to_check" }, ids: ["a", "b"] });
    const fresh = await reloadReviewQueue(opened.source);
    assert.deepEqual(fresh, ["b"]);
    assert.equal(nextAfterSubmit(opened.ids, fresh, "a"), "b", "stays in to_check, never jumps to ready");
    assert.deepEqual(findLane(lanes[0], "r2"), { lane: "ready", ids: ["r1", "r2"] });
    assert.deepEqual(laneIds(lanes[1], "exceptions"), []);
  } finally {
    globalThis.fetch = original;
  }
});

/** Roadmap P10 (posting preview) and P1-lite (risk order, spot check): the pure parts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { laneEntry, findLane } from "../src/features/common/documents/review/review-logic";
import { loadReviewQueue } from "../src/features/common/documents/review/use-review-queue";
import { previewSummary, type PostingPreview } from "../src/features/common/documents/review/posting-preview";

const lanes = { lanes: {
  ready: [{ id: "spot", spotCheck: true, risk: { score: 0, level: "low", why: [] } }],
  to_check: [{ id: "a", risk: { score: 70, level: "high", why: ["A check failed."] } }, { id: "b" }],
} };

test("the lanes entry carries the document's risk and spot-check pick; older responses without them still work", () => {
  assert.equal(laneEntry(lanes, "spot")?.spotCheck, true);
  assert.deepEqual(laneEntry(lanes, "a")?.risk?.why, ["A check failed."]);
  assert.equal(laneEntry(lanes, "b")?.risk, undefined);
  assert.equal(laneEntry(lanes, "missing"), null);
  assert.deepEqual(findLane(lanes, "b"), { lane: "to_check", ids: ["a", "b"] }); // the server's order is kept
});

test("opening a document reads its lanes entry with the queue", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(lanes), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const opened = await loadReviewQueue("a");
    assert.deepEqual(opened.ids, ["a", "b"]);
    assert.equal(opened.entry?.risk?.level, "high");
  } finally { globalThis.fetch = previous; }
});

const preview = (patch: Partial<PostingPreview> = {}): PostingPreview => ({
  documentId: "d", contentRevision: 3, basis: "Proposed from the values on this version. Nothing is posted.", problem: null,
  lines: [], sentences: ["Debit 5000 Purchases RM 100.00", "Debit 1140 SST input tax RM 6.00", "Credit 2000 Accounts payable RM 106.00"],
  ...patch,
});

test("the posting preview reads as one sentence per line, or says why there is none", () => {
  assert.equal(previewSummary(preview()).lines.length, 3);
  assert.match(previewSummary(preview()).note, /Nothing is posted/);
  assert.deepEqual(previewSummary(preview({ problem: "No payable account is set up." })), { lines: [], note: "No payable account is set up." });
  assert.match(previewSummary(null).note, /could not be loaded/);
});

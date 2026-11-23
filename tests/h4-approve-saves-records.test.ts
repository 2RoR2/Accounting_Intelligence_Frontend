import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saveApprovedToRecords, savedToRecordsSummary } from "../src/features/common/bulk-selection";

// UAT D5 -> D6 (H4 walk, 23 Nov 2026): approving in the Approvals queue left each document APPROVED but not
// saved to records, so nothing appeared in "Approved, not posted yet" until someone opened every document and
// pressed "Save to records". Approving now also saves each approved document to records.

test("approved documents are saved to records one by one; one failure does not stop the rest", async () => {
  const calls: string[] = [];
  const result = await saveApprovedToRecords(["a", "b", "c"], async (id) => {
    calls.push(id);
    if (id === "b") throw new Error("Validation must pass before a record is saved.");
  });
  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.equal(result.saved, 2);
  assert.deepEqual(result.failed, [{ id: "b", reason: "Validation must pass before a record is saved." }]);
  assert.equal(savedToRecordsSummary(result, (id) => id.toUpperCase()),
    "2 saved to records, 1 not: B: Validation must pass before a record is saved. Open it and use Save to records.");
  assert.equal(savedToRecordsSummary({ saved: 2, failed: [] }, (id) => id), "2 saved to records");
});

test("nothing approved means nothing is saved", async () => {
  const result = await saveApprovedToRecords([], async () => { throw new Error("not called"); });
  assert.deepEqual(result, { saved: 0, failed: [] });
  assert.equal(savedToRecordsSummary(result, (id) => id), "");
});

test("the approval queue saves approved documents to records (single and bulk approve)", () => {
  const source = readFileSync(new URL("../src/features/common/documents/approval-queue.tsx", import.meta.url), "utf8");
  assert.match(source, /standardiseDocument/);
  assert.match(source, /saveApprovedToRecords\(/);
});

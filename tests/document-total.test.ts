import test from "node:test";
import assert from "node:assert/strict";
import { listedTotal, READ_TOTAL_HINT } from "../src/features/common/documents/document-total";

test("a saved record's total is shown as it is, not marked", () => {
  assert.deepEqual(listedTotal({ totalAmount: 500, totalSource: "record" }), { text: "500.00", read: false });
  assert.deepEqual(listedTotal({ totalAmount: "1250.5", totalSource: "record" }), { text: "1,250.50", read: false });
});

test("a total the AI read before approval is shown and marked as read", () => {
  assert.deepEqual(listedTotal({ totalAmount: 1250.5, totalSource: "read" }), { text: "1,250.50", read: true });
  assert.match(READ_TOTAL_HINT, /not yet approved/i);
});

test("a document with no total says so rather than showing zero", () => {
  assert.deepEqual(listedTotal({ totalAmount: null, totalSource: null }), { text: "—", read: false });
  assert.deepEqual(listedTotal({}), { text: "—", read: false });
  assert.deepEqual(listedTotal({ totalAmount: "" }), { text: "—", read: false });
  // A real zero is a total.
  assert.deepEqual(listedTotal({ totalAmount: 0, totalSource: "read" }), { text: "0.00", read: true });
});

test("an older backend without totalSource is treated as a saved total", () => {
  assert.deepEqual(listedTotal({ totalAmount: 99 }), { text: "99.00", read: false });
});

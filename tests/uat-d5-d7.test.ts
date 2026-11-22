import test from "node:test";
import assert from "node:assert/strict";
import { BULK_LIMIT, bulkResultSummary, selectedIds, toggleSelection } from "../src/features/common/bulk-selection";
import { allocationCents, allocationTotals, defaultAllocation } from "../src/features/common/money/allocation-logic";
import { postingSelectionTotals, previewTotals } from "../src/features/common/records/posting-logic";

test("bulk selection keeps eligible rows, drops changed revisions and respects the request limit", () => {
  const selected = toggleSelection(["doc-1:2"], "doc-2:1");
  assert.deepEqual(selected, ["doc-1:2", "doc-2:1"]);
  assert.deepEqual(toggleSelection(selected, "doc-1:2"), ["doc-2:1"]);
  assert.deepEqual(selectedIds(selected, ["doc-1:3", "doc-3:1"]), []);
  assert.deepEqual(selectedIds(selected, ["doc-2:1", "doc-3:1"]), ["doc-2:1"]);

  const full = Array.from({ length: BULK_LIMIT }, (_, index) => String(index));
  assert.deepEqual(toggleSelection(full, "extra"), full);
  assert.equal(toggleSelection(full, "0").length, BULK_LIMIT - 1);
});

test("bulk summaries keep the count and each document number with its refusal reason", () => {
  const results = [
    { number: "BILL-1", ok: true },
    { number: "BILL-2", ok: false, reason: "The document changed." },
    { number: "BILL-3", ok: false, reason: "The period is closed." },
  ];
  assert.equal(bulkResultSummary("approved", results, (item) => item.number),
    "1 approved, 2 not: BILL-2: The document changed. · BILL-3: The period is closed.");
  assert.equal(bulkResultSummary("submitted", results.slice(0, 1), (item) => item.number), "1 submitted, 0 not");
  assert.equal(bulkResultSummary("posted", results.slice(1, 2), (item) => item.number),
    "0 posted, 1 not: BILL-2: The document changed.");
});

test("bank allocations default to the smaller balance and compute remaining cents exactly", () => {
  assert.equal(defaultAllocation("35.40", "21.23"), "21.23");
  assert.equal(defaultAllocation("0.09", "21.23"), "0.09");
  assert.equal(defaultAllocation("1.00", "-0.01"), "0.00");
  assert.deepEqual(allocationTotals("10.30", ["0.10", "0.20"]), {
    allocated: "0.30", remaining: "10.00", exceedsAvailable: false,
  });
  assert.deepEqual(allocationTotals("0.30", ["0.10", "0.20"]), {
    allocated: "0.30", remaining: "0.00", exceedsAvailable: false,
  });
  assert.deepEqual(allocationTotals("0.30", ["0.10", "0.21"]), {
    allocated: "0.31", remaining: "-0.01", exceedsAvailable: true,
  });
  assert.equal(allocationCents(".05"), 5n);
  for (const invalid of ["", "-0.01", "0.001", "1e2", "abc"]) {
    assert.equal(allocationCents(invalid), null);
  }
});

test("journal preview uses the reported totals and preserves the server balance decision", () => {
  assert.deepEqual(previewTotals({ totalDebit: "1234.5", totalCredit: "1234.50", balanced: true }), {
    debit: "1234.50", credit: "1234.50", balanced: true,
  });
  assert.deepEqual(previewTotals({ totalDebit: "10.01", totalCredit: "10.00", balanced: false }), {
    debit: "10.01", credit: "10.00", balanced: false,
  });
  assert.equal(previewTotals({ totalDebit: "0.00", totalCredit: "0.00", balanced: false }).balanced, false);
});

test("posting count confirmation totals add exact cents and keep currencies separate", () => {
  assert.deepEqual(postingSelectionTotals([
    { amount: "1234.49", currency: "MYR" },
    { amount: "0.01" },
    { amount: "5.20", currency: "usd" },
    { amount: null },
  ]), { missing: 1, totals: [{ currency: "MYR", amount: "1234.50" }, { currency: "USD", amount: "5.20" }] });
});

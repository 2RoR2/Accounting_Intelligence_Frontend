import assert from "node:assert/strict";
import test from "node:test";
import { periodFromMonth } from "../src/features/common/ledger/period-month";

test("periods use the first and last day of the selected calendar month", () => {
  for (const [month, lastDay] of [["2026-01", 31], ["2026-04", 30], ["2026-12", 31], ["0001-01", 31], ["9999-12", 31]] as const) {
    assert.deepEqual(periodFromMonth(month), {
      periodCode: month,
      startsOn: `${month}-01`,
      endsOn: `${month}-${lastDay}`,
    });
  }
});

test("February uses Gregorian leap-year rules", () => {
  assert.equal(periodFromMonth("2024-02")?.endsOn, "2024-02-29");
  assert.equal(periodFromMonth("2026-02")?.endsOn, "2026-02-28");
  assert.equal(periodFromMonth("1900-02")?.endsOn, "1900-02-28");
  assert.equal(periodFromMonth("2000-02")?.endsOn, "2000-02-29");
});

test("a period requires a valid month in YYYY-MM format", () => {
  for (const month of ["", "2026", "2026-1", "2026-00", "2026-13", "2026-01-01", "0000-03", "10000-01"]) {
    assert.equal(periodFromMonth(month), null, month);
  }
});

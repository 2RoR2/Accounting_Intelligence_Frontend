import test from "node:test";
import assert from "node:assert/strict";
import { effectiveRate, normaliseRate, validateRatePeriods, type RatePeriod } from "../src/features/common/erp/currency-rates";

const november: RatePeriod = { startDate: "2026-11-01", endDate: "2026-11-30", rate: "4.470000" };

test("a covering period wins over the default rate, including both boundary dates", () => {
  const data = { rate: "4.40", customRates: [november] };
  for (const date of ["2026-11-01", "2026-11-15", "2026-11-30"]) {
    assert.equal(effectiveRate(data, date), "4.470000");
  }
});

test("an open-ended period covers dates from its start onward", () => {
  const open = { startDate: "2026-12-01", endDate: null, rate: "4.48" };
  const data = { customRates: [open] };
  assert.equal(effectiveRate(data, "2026-11-30"), null);
  assert.equal(effectiveRate(data, "2026-12-01"), "4.48");
  assert.equal(effectiveRate(data, "2027-08-15"), "4.48");
  assert.equal(validateRatePeriods([open, november]), null);
});

test("a gap uses the default rate and a missing default returns null", () => {
  const customRates = [november, { startDate: "2027-01-01", endDate: null, rate: "4.49" }];
  assert.equal(effectiveRate({ customRates, rate: "4.40" }, "2026-12-15"), "4.40");
  assert.equal(effectiveRate({ customRates }, "2026-12-15"), null);
  assert.equal(effectiveRate({ rate: "4.40" }, "2026-12-15"), "4.40");
});

test("overlap is rejected for unsorted periods, including shared dates and open ends", () => {
  assert.match(validateRatePeriods([{ ...november, startDate: "2026-11-30", endDate: "2026-12-02" }, november]) ?? "", /overlap/);
  assert.match(validateRatePeriods([{ ...november, startDate: "2026-12-01", endDate: null }, { ...november, endDate: null }]) ?? "", /overlap/);
});

test("an end before the start is rejected and a one-day period is allowed", () => {
  assert.match(validateRatePeriods([{ ...november, endDate: "2026-10-31" }]) ?? "", /ends before it starts/);
  assert.equal(validateRatePeriods([{ ...november, endDate: november.startDate }]), null);
});

test("dates must be real calendar dates in YYYY-MM-DD format", () => {
  assert.match(validateRatePeriods([{ ...november, startDate: "" }]) ?? "", /start date/);
  assert.match(validateRatePeriods([{ ...november, startDate: "0000-11-01" }]) ?? "", /start date/);
  assert.match(validateRatePeriods([{ ...november, endDate: "2026-11-31" }]) ?? "", /end date/);
});

test("rates must be positive decimal strings with at most six decimal places", () => {
  for (const rate of ["", "0.000000", "-1", "1e3", "4,47", "4.4700001"]) {
    assert.match(validateRatePeriods([{ ...november, rate }]) ?? "", /positive rate/);
  }
  assert.equal(normaliseRate(4.47), null);
  assert.equal(normaliseRate(" .000001 "), "0.000001");
  assert.equal(normaliseRate("0004.470000"), "4.470000");
  assert.equal(normaliseRate("12345678901234567890.123456"), "12345678901234567890.123456");
});

test("a currency can have up to fifty rate periods", () => {
  const periods = Array.from({ length: 50 }, (_, index) => {
    const date = `${2000 + index}-01-01`;
    return { ...november, startDate: date, endDate: date };
  });
  assert.equal(validateRatePeriods(periods), null);
  assert.match(validateRatePeriods([...periods, november]) ?? "", /at most 50/);
});

test("today's date in Kuala Lumpur is built as YYYY-MM-DD", async () => {
  const { isoDateIn } = await import("../src/features/common/erp/currency-rates");
  // 2026-11-21 17:30 UTC is already 22 Nov in Kuala Lumpur (UTC+8).
  assert.equal(isoDateIn("Asia/Kuala_Lumpur", new Date(Date.UTC(2026, 10, 21, 17, 30))), "2026-11-22");
  assert.equal(isoDateIn("UTC", new Date(Date.UTC(2026, 0, 5))), "2026-01-05");
});

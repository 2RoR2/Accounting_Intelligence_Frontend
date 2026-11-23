import test from "node:test";
import assert from "node:assert/strict";
import { businessSummaryPath, type BusinessSummary } from "../src/lib/api/business-summary";
import { monthLabel, overdueLabel, shareOfTotal, trendScale } from "../src/lib/business-summary";

const trend = (rows: Array<[string, string, string]>): BusinessSummary["trend"] =>
  rows.map(([sales, expenses, netProfit], index) => ({
    month: `2026-0${index + 1}`, fromDate: `2026-0${index + 1}-01`, toDate: `2026-0${index + 1}-28`, sales, expenses, netProfit,
  }));

test("the request carries only the chosen month", () => {
  assert.equal(businessSummaryPath(), "/api/reports/business-summary");
  assert.equal(businessSummaryPath("2026-09"), "/api/reports/business-summary?month=2026-09");
  assert.equal(businessSummaryPath("2026-09&date=2999-01-01"), "/api/reports/business-summary?month=2026-09%26date%3D2999-01-01");
});

test("the trend scale keeps sales, expenses and a loss on one axis", () => {
  const scale = trendScale(trend([["4000.00", "1500.00", "2500.00"], ["1000.00", "1800.00", "-800.00"]]));
  assert.equal(scale.high, 4000);
  assert.equal(scale.low, -800);
  assert.equal(scale.share(-800), 0);
  assert.equal(scale.share(4000), 1);
  assert.ok(scale.share(0) > 0 && scale.share(0) < 1);
});

test("a trend with no activity does not divide by zero", () => {
  const scale = trendScale(trend([["0.00", "0.00", "0.00"]]));
  assert.equal(scale.span, 1);
  assert.equal(scale.share(0), 0);
});

test("a share bar is clamped between nothing and the whole", () => {
  assert.equal(shareOfTotal("2850.00", "4170.00").toFixed(3), "0.683");
  assert.equal(shareOfTotal("5000.00", "4170.00"), 1);
  assert.equal(shareOfTotal("-50.00", "4170.00"), 0);
  assert.equal(shareOfTotal("10.00", "0.00"), 0);
});

test("month and overdue labels read plainly", () => {
  assert.match(monthLabel("2026-11"), /Nov/);
  assert.equal(monthLabel("not-a-month"), "not-a-month");
  assert.equal(overdueLabel(1), "1 day overdue");
  assert.equal(overdueLabel(37), "37 days overdue");
});

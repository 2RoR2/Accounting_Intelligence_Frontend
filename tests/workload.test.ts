import test from "node:test";
import assert from "node:assert/strict";
import { workloadReportPath } from "../src/lib/api/workload";
import { NOT_MEASURED, countLabel, rateLabel, sc2Label, statsLabel } from "../src/lib/workload";

test("the request carries only the dates that were chosen", () => {
  assert.equal(workloadReportPath(), "/api/reports/workload");
  assert.equal(workloadReportPath("2026-11-01"), "/api/reports/workload?fromDate=2026-11-01");
  assert.equal(workloadReportPath("2026-11-01", "2026-11-30"), "/api/reports/workload?fromDate=2026-11-01&toDate=2026-11-30");
  assert.equal(workloadReportPath(undefined, "2026-11-30&x=1"), "/api/reports/workload?toDate=2026-11-30%26x%3D1");
});

test("a median always shows its range and n", () => {
  assert.equal(statsLabel({ n: 14, median: 2, min: 0, max: 2 }), "2 median (range 0–2, n = 14)");
  assert.equal(statsLabel({ n: 1, median: 42.5, min: 42.5, max: 42.5 }, "s"), "42.5 s median (range 42.5–42.5, n = 1)");
});

test("counts read in the singular or plural", () => {
  assert.equal(countLabel(1, "field edit"), "1 field edit");
  assert.equal(countLabel(0, "decision"), "0 decisions");
  assert.equal(countLabel(22, "decision"), "22 decisions");
});

test("nothing recorded reads as not measured, never as zero", () => {
  assert.equal(statsLabel({ n: 0, median: null, min: null, max: null }), NOT_MEASURED);
  assert.equal(rateLabel(0, 0, null), NOT_MEASURED);
  assert.equal(rateLabel(1, 14, 7.1), "1 of 14 (7.1%)");
  assert.equal(rateLabel(0, 11, 0), "0 of 11 (0%)");
});

test("SC2 is reported only from a valid effort study", () => {
  assert.match(sc2Label({ status: "NOT MEASURED", valid: false, reduction: null, pairedParticipants: 1 }),
    /^Not measured yet: 1 paired participant so far; at least 2 covering both orders are needed\.$/);
  assert.equal(sc2Label({ status: "MET", valid: true, reduction: 74.2, pairedParticipants: 2 }),
    "Met: 74.2% less active time across 2 paired participants (target 70%).");
  assert.match(sc2Label({ status: "NOT MET", valid: true, reduction: 41, pairedParticipants: 3 }), /^Not met: 41%/);
});

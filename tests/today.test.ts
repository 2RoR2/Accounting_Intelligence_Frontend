import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_LANES, NOT_AVAILABLE, bankLineToMatch, formatRm, linkHref, monthEndView, recordFilterLabel, tileView, todayTiles,
  type HomeSummary,
} from "../src/lib/today";
import { ruleSentence, ruleTitle } from "../src/lib/glossary";

/** Shaped like backend GET /api/home/summary (services/routes/home/routes.py, backend PR #6). */
function summary(overrides: Partial<HomeSummary["tiles"]> = {}, monthEnd?: HomeSummary["monthEnd"]): HomeSummary {
  return {
    asOf: "2026-11-16",
    currency: "MYR",
    role: "ACCOUNTANT",
    tiles: {
      toReview: { available: true, scope: "yours", count: 4, link: { page: "documents", query: "lane=to-review" } },
      readyToApprove: { available: true, scope: "yours", count: 2, link: { page: "documents", query: "lane=ready" } },
      needsFixing: { available: true, scope: "yours", count: 2, topReasons: [{ code: "EX-008", documents: 2 }, { code: "TOTAL", documents: 1 }],
        link: { page: "documents", query: "lane=needs-fixing" } },
      waitingApproval: { available: true, scope: "yours", count: 1, link: { page: "documents", query: "lane=waiting-approval" } },
      bankToMatch: { available: true, scope: "company", count: 2, moneyIn: 1, moneyOut: 1, link: { page: "reconciliation", query: "status=unmatched" } },
      billsDueSoon: { available: true, scope: "company", count: 2, amount: "300.00", currency: "MYR", otherCurrencyCount: 1, days: 7, noDueDate: 1,
        link: { page: "records", query: "category=ACCOUNTS_PAYABLE&due=next-7-days&asOf=2026-11-16" } },
      billsOverdue: { available: true, scope: "company", count: 1, amount: "800.25", currency: "MYR", otherCurrencyCount: 0, noDueDate: 0,
        link: { page: "records", query: "category=ACCOUNTS_PAYABLE&due=overdue&asOf=2026-11-16" } },
      invoicesOverdue: { available: true, scope: "company", count: 0, amount: "0.00", currency: "MYR", otherCurrencyCount: 0, noDueDate: 0,
        link: { page: "records", query: "category=ACCOUNTS_RECEIVABLE&due=overdue&asOf=2026-11-16" } },
      journalsToPost: { available: true, scope: "company", count: 8, draftJournals: 1, link: { page: "records", query: "posting=to-post" } },
      ...overrides,
    },
    monthEnd: monthEnd ?? {
      available: true, scope: "company",
      period: { code: "FY26-11", startsOn: "2026-11-01", endsOn: "2026-11-30", status: "open", source: "accounting_period" },
      steps: [
        { key: "reviewed", available: true, done: 10, total: 15, basis: "Documents uploaded in this period that were checked.", link: { page: "documents", query: "lane=to-review" } },
        { key: "matched", available: true, done: 3, total: 3, basis: "Bank lines dated in this period.", link: { page: "reconciliation", query: "status=unmatched" } },
        { key: "posted", available: true, done: 0, total: 0, basis: "Approved records dated in this period.", link: { page: "records", query: "posting=to-post" } },
        { key: "reconciled", available: false, reason: "No bank reconciliation period covers this month yet. Start one on the Reconcile page.", link: { page: "reconciliation", query: null } },
      ],
    },
  };
}

test("tiles follow the daily routine and open the list they count, under the role's area", () => {
  const tiles = todayTiles(summary(), "ACCOUNTANT");
  assert.deepEqual(tiles.map((t) => t.id), ["toReview", "needsFixing", "readyToApprove", "waitingApproval", "bankToMatch",
    "billsDueSoon", "billsOverdue", "invoicesOverdue", "journalsToPost"]);
  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
  assert.equal(byId.toReview.href, "/workspace/documents?lane=to-review");
  assert.equal(byId.billsDueSoon.href, "/workspace/records?category=ACCOUNTS_PAYABLE&due=next-7-days&asOf=2026-11-16");
  assert.equal(byId.needsFixing.href, "/workspace/documents?lane=needs-fixing");
  assert.equal(todayTiles(summary(), "LOCAL_ADMIN")[0].href, "/company/documents?lane=to-review");
  assert.equal(linkHref("LOCAL_ADMIN", { page: "approvals", query: null }), "/company/approvals");
  assert.equal(linkHref("ACCOUNTANT", null), null);
});

test("counts and RM amounts read as accounting words", () => {
  const byId = Object.fromEntries(todayTiles(summary(), "ACCOUNTANT").map((t) => [t.id, t]));
  assert.equal(byId.toReview.value, "4");
  assert.equal(byId.toReview.caption, "4 documents waiting for your check");
  assert.equal(byId.waitingApproval.title, "Sent for approval");
  assert.equal(todayTiles(summary(), "LOCAL_ADMIN")[3].title, "Waiting for your approval");
  assert.equal(byId.billsDueSoon.value, formatRm("300.00"));
  assert.match(byId.billsDueSoon.value, /^RM\s?300\.00$/);
  assert.equal(byId.billsOverdue.caption, "1 bill past the due date");
  assert.equal(byId.bankToMatch.caption, "1 line money in, 1 line money out");
  assert.equal(byId.toReview.tone, "attention");
  assert.equal(byId.readyToApprove.tone, "neutral");
});

test("needs fixing shows the top reasons through the glossary, never raw codes", () => {
  const tile = todayTiles(summary(), "ACCOUNTANT").find((t) => t.id === "needsFixing")!;
  assert.equal(tile.caption, `Mostly: ${ruleTitle("EX-008")} (2), ${ruleTitle("TOTAL")} (1)`);
  assert.ok(!tile.caption.includes("EX-008"));
  assert.deepEqual(tile.details, [`${ruleSentence("EX-008")} (2 documents)`, `${ruleSentence("TOTAL")} (1 document)`]);
});

test("open-item tiles explain what the amount includes and leaves out under Details", () => {
  const tile = todayTiles(summary(), "ACCOUNTANT").find((t) => t.id === "billsDueSoon")!;
  assert.equal(tile.details.length, 3);
  assert.match(tile.details[1], /1 bill in another currency counted but not included in the RM total/);
  assert.match(tile.details[2], /1 unpaid bill without a due date/);
});

test("a figure the backend cannot give shows 'Not available yet' with the reason in Details", () => {
  const reason = "The ledger is not set up on this server yet, so nothing can be posted.";
  const tile = tileView("journalsToPost", { available: false, reason, link: { page: "records", query: "posting=to-post" } }, "ACCOUNTANT");
  assert.equal(tile.value, NOT_AVAILABLE);
  assert.equal(tile.value, "Not available yet");
  assert.deepEqual(tile.details, [reason]);
  assert.equal(tile.tone, "unavailable");
  assert.equal(tile.caption, "");
  assert.equal(tile.nextStep, null);
  assert.ok(!/\d/.test(tile.value), "never a number");
});

test("an empty tile says what to do next instead of a bare zero", () => {
  const empty = summary({
    toReview: { available: true, scope: "yours", count: 0, link: { page: "documents", query: "lane=to-review" } },
  });
  const byId = Object.fromEntries(todayTiles(empty, "ACCOUNTANT").map((t) => [t.id, t]));
  assert.equal(byId.toReview.tone, "clear");
  assert.equal(byId.toReview.caption, "");
  assert.match(byId.toReview.nextStep ?? "", /Upload new bills/);
  assert.equal(byId.toReview.nextHref, "/workspace/upload");
  assert.equal(byId.invoicesOverdue.nextStep, "No customer invoice is overdue.");
  assert.equal(byId.invoicesOverdue.value, formatRm("0.00"));
  assert.deepEqual(byId.invoicesOverdue.details, [], "nothing counted, nothing left out");
  for (const tile of todayTiles(empty, "LOCAL_ADMIN")) {
    if (tile.tone === "clear") assert.ok(tile.nextStep, `${tile.id} has no next step`);
  }
});

test("month-end checklist: progress, nothing yet, and not available with the reason", () => {
  const view = monthEndView(summary(), "LOCAL_ADMIN");
  assert.equal(view.title, "Month-end: November 2026 (FY26-11)");
  const steps = Object.fromEntries(view.steps.map((s) => [s.key, s]));
  assert.deepEqual([steps.reviewed.value, steps.reviewed.percent, steps.reviewed.complete], ["10 of 15", 67, false]);
  assert.deepEqual([steps.matched.value, steps.matched.complete], ["3 of 3", true]);
  assert.deepEqual([steps.posted.value, steps.posted.percent], ["Nothing this month yet", null]);
  assert.equal(steps.reconciled.value, NOT_AVAILABLE);
  assert.match(steps.reconciled.details[0], /No bank reconciliation period/);
  assert.equal(steps.reconciled.href, "/company/reconciliation");
  const calendar = monthEndView(summary({}, { available: true, scope: "company", steps: [],
    period: { code: "2026-02", startsOn: "2026-02-01", endsOn: "2026-02-28", status: null, source: "calendar_month" } }), "ACCOUNTANT");
  assert.equal(calendar.title, "Month-end: February 2026");
  const missing = monthEndView(summary({}, { available: false, reason: "Not set up.", link: null }), "ACCOUNTANT");
  assert.deepEqual([missing.available, missing.details], [false, ["Not set up."]]);
});

test("the Reconcile list opened from Today hides matched, ignored and classified lines, like the tile", () => {
  assert.equal(bankLineToMatch({ status: "imported" }), true);
  assert.equal(bankLineToMatch({ status: "proposed", codingDecision: null }), true);
  assert.equal(bankLineToMatch({ status: "needs_review" }), true);
  assert.equal(bankLineToMatch({ status: "matched" }), false);
  assert.equal(bankLineToMatch({ status: "ignored" }), false);
  assert.equal(bankLineToMatch({ status: "imported", codingDecision: "manual" }), false, "a classified bank fee is explained");
  assert.equal(bankLineToMatch({ status: "imported", codingDecision: "accepted" }), false);
  assert.equal(bankLineToMatch({ status: "imported", codingDecision: "cleared" }), true, "a cleared classification is to match again");
});

test("lists opened from Today know the backend's list names", () => {
  // Hand-copied from backend services/routes/home/lanes.py DOCUMENT_LANES and DUE_WINDOWS.
  assert.deepEqual(Object.keys(DOCUMENT_LANES).sort(), ["needs-fixing", "ready", "to-review", "waiting-approval"]);
  for (const tile of todayTiles(summary(), "ACCOUNTANT")) {
    const lane = new URLSearchParams(tile.href?.split("?")[1] ?? "").get("lane");
    if (lane) assert.ok(lane in DOCUMENT_LANES, lane);
  }
  assert.equal(recordFilterLabel("ACCOUNTS_PAYABLE", "overdue", null), "Unpaid supplier bills overdue");
  assert.equal(recordFilterLabel("ACCOUNTS_RECEIVABLE", "next-7-days", null), "Unpaid customer invoices due in the next 7 days");
  assert.equal(recordFilterLabel(null, null, "to-post"), "Approved records not posted yet");
  assert.equal(recordFilterLabel("ACCOUNTS_PAYABLE", "someday", null), null);
});

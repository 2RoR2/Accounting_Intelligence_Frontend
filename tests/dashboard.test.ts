import test from "node:test";
import assert from "node:assert/strict";
import { dashboardView, firstName, greetingFor, pollWhileVisible } from "../src/lib/dashboard";
import type { HomeSummary } from "../src/lib/today";

/** Shaped like backend GET /api/home/summary (backend PR #6); counts set per test. */
function summary(counts: Partial<Record<keyof HomeSummary["tiles"], number>> = {}): HomeSummary {
  const n = (id: keyof HomeSummary["tiles"]) => counts[id] ?? 0;
  const money = (id: "billsDueSoon" | "billsOverdue" | "invoicesOverdue", query: string) => ({
    available: true as const, scope: "company" as const, count: n(id), amount: `${n(id) * 100}.00`, currency: "MYR",
    otherCurrencyCount: 0, noDueDate: 0, link: { page: "records", query } });
  return {
    asOf: "2026-11-18", currency: "MYR", role: "ACCOUNTANT",
    tiles: {
      toReview: { available: true, scope: "yours", count: n("toReview"), link: { page: "documents", query: "lane=to-review" } },
      readyToApprove: { available: true, scope: "yours", count: n("readyToApprove"), link: { page: "documents", query: "lane=ready" } },
      needsFixing: { available: true, scope: "yours", count: n("needsFixing"), topReasons: [], link: { page: "documents", query: "lane=needs-fixing" } },
      waitingApproval: { available: true, scope: "yours", count: n("waitingApproval"), link: { page: "documents", query: "lane=waiting-approval" } },
      bankToMatch: { available: true, scope: "company", count: n("bankToMatch"), moneyIn: 0, moneyOut: n("bankToMatch"), link: { page: "reconciliation", query: "status=unmatched" } },
      billsDueSoon: money("billsDueSoon", "due=next-7-days"),
      billsOverdue: money("billsOverdue", "due=overdue"),
      invoicesOverdue: money("invoicesOverdue", "category=ACCOUNTS_RECEIVABLE&due=overdue"),
      journalsToPost: { available: true, scope: "company", count: n("journalsToPost"), draftJournals: 0, link: { page: "records", query: "posting=to-post" } },
    },
    monthEnd: { available: false, reason: "No period yet.", link: null },
  };
}

test("the four counts that used to sit in cards live in Attention needed, each with its number", () => {
  const counts = { toReview: 3, needsFixing: 2, readyToApprove: 1, bankToMatch: 4 };
  const accountant = dashboardView(summary(counts), "ACCOUNTANT");
  assert.equal("kpis" in accountant, false, "the headline cards are gone");
  const byId = (view: ReturnType<typeof dashboardView>) => Object.fromEntries(view.attention.map((tile) => [tile.id, [tile.title, tile.value]]));
  assert.deepEqual(byId(accountant).toReview, ["Documents to check", "3"]);
  assert.deepEqual(byId(accountant).needsFixing, ["Needs fixing", "2"]);
  // The accountant submits; the tile says so. A company admin is the one who approves.
  assert.deepEqual(byId(accountant).readyToApprove, ["Ready to submit", "1"]);
  assert.deepEqual(byId(dashboardView(summary(counts), "LOCAL_ADMIN")).readyToApprove, ["Ready to approve", "1"]);
  assert.deepEqual(byId(accountant).bankToMatch, ["Bank lines to match", "4"]);
  assert.deepEqual(accountant.attention.map((tile) => tile.id), ["toReview", "needsFixing", "readyToApprove", "bankToMatch"]);
  const admin = dashboardView(summary({ toReview: 3, needsFixing: 2, waitingApproval: 5, bankToMatch: 4 }), "LOCAL_ADMIN");
  assert.deepEqual(admin.attention.map((tile) => tile.id), ["toReview", "needsFixing", "waitingApproval", "bankToMatch"]);
});

test("attention lists only work with something to do, in working order, and links each to its list", () => {
  const view = dashboardView(summary({ needsFixing: 64, bankToMatch: 58, journalsToPost: 2 }), "ACCOUNTANT");
  assert.deepEqual(view.attention.map((tile) => tile.id), ["needsFixing", "bankToMatch", "journalsToPost"]);
  assert.equal(view.attention[0].value, "64");
  assert.equal(view.attention[0].href, "/workspace/documents?lane=needs-fixing");
  assert.equal(view.headline, "3 things need you today. Start at the top of \"Attention needed\".");
});

test("overdue money counts as something to do; money due soon does not", () => {
  const view = dashboardView(summary({ billsDueSoon: 2, billsOverdue: 1 }), "ACCOUNTANT");
  assert.deepEqual(view.money.map((tile) => tile.id), ["billsDueSoon", "billsOverdue", "invoicesOverdue"]);
  assert.match(view.money[1].value, /^RM\s100\.00$/); // Intl puts a non-breaking space after RM
  assert.equal(view.attention.length, 0);
  assert.equal(view.headline, "1 thing needs you today. Start at the top of \"Attention needed\".");
});

test("nothing to do says so", () => {
  const view = dashboardView(summary(), "ACCOUNTANT");
  assert.equal(view.attention.length, 0);
  assert.equal(view.allClear, true);
  assert.match(view.headline, /^You are all caught up/);
});

test("an unavailable figure stays visible with its reason and is never called all clear", () => {
  const data = summary();
  data.tiles.journalsToPost = { available: false, reason: "Journals are not set up for this company yet.", link: null };
  const view = dashboardView(data, "ACCOUNTANT");
  assert.deepEqual(view.attention.map((tile) => [tile.id, tile.tone, tile.details[0]]),
    [["journalsToPost", "unavailable", "Journals are not set up for this company yet."]]);
  assert.equal(view.allClear, false);
  assert.match(view.headline, /^Some figures are not available yet/);
  data.tiles.needsFixing = { ...data.tiles.needsFixing, count: 2 } as typeof data.tiles.needsFixing;
  assert.equal(dashboardView(data, "ACCOUNTANT").headline,
    "1 thing needs you today. Start at the top of \"Attention needed\". Some figures are not available yet.");
});

test("an open Dashboard refreshes on a timer only while visible, and when it becomes visible again", () => {
  const listeners: Array<() => void> = [];
  const doc = { visibilityState: "visible",
    addEventListener: (_: "visibilitychange", listener: () => void) => { listeners.push(listener); },
    removeEventListener: (_: "visibilitychange", listener: () => void) => { listeners.splice(listeners.indexOf(listener), 1); } };
  let tick: () => void = () => {};
  let cleared = false;
  let calls = 0;
  const stop = pollWhileVisible(() => { calls += 1; }, 30_000, doc,
    { set: (run, ms) => { assert.equal(ms, 30_000); tick = run; return 1; }, clear: () => { cleared = true; } });
  tick();
  assert.equal(calls, 1);
  doc.visibilityState = "hidden";
  tick();
  listeners.forEach((listener) => listener());
  assert.equal(calls, 1, "a hidden tab makes no requests");
  doc.visibilityState = "visible";
  listeners.forEach((listener) => listener());
  assert.equal(calls, 2, "returning to the tab refreshes at once");
  stop();
  assert.equal(cleared, true);
  assert.equal(listeners.length, 0);
});

test("greeting follows the Malaysian hour and uses the first name", () => {
  assert.deepEqual([3, 9, 13, 18, 22].map(greetingFor), ["Good night", "Good morning", "Good afternoon", "Good evening", "Good night"]);
  assert.equal(firstName("Angeline Tan"), "Angeline");
  assert.equal(firstName("  "), "there");
});

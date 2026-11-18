import test from "node:test";
import assert from "node:assert/strict";
import { dashboardView, firstName, greetingFor } from "../src/lib/dashboard";
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

test("headline numbers: check, fix, approve or waiting, bank", () => {
  assert.deepEqual(dashboardView(summary(), "ACCOUNTANT").kpis.map((tile) => tile.id),
    ["toReview", "needsFixing", "readyToApprove", "bankToMatch"]);
  assert.deepEqual(dashboardView(summary(), "LOCAL_ADMIN").kpis.map((tile) => tile.id),
    ["toReview", "needsFixing", "waitingApproval", "bankToMatch"]);
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
  assert.match(view.headline, /^You are all caught up/);
});

test("greeting follows the Malaysian hour and uses the first name", () => {
  assert.deepEqual([3, 9, 13, 18, 22].map(greetingFor), ["Good night", "Good morning", "Good afternoon", "Good evening", "Good night"]);
  assert.equal(firstName("Angeline Tan"), "Angeline");
  assert.equal(firstName("  "), "there");
});

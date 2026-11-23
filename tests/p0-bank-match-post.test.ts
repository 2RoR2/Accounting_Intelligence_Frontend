import test from "node:test";
import assert from "node:assert/strict";
import {
  bankLineStatusLabel, bankPaymentNotPosted, PAYMENT_NOT_POSTED,
} from "../src/features/common/money/allocation-logic";
import { decideMatch, getBankPaymentPreview } from "../src/lib/api/money.service";
import { dashboardView } from "../src/lib/dashboard";
import { todayTiles, type HomeSummary } from "../src/lib/today";
import type { User } from "../src/types";

const user = { id: "admin", role: "LOCAL_ADMIN" } as User;

test("a matched line whose payment is not posted shows 'Matched, not posted' in lists", () => {
  const matched = { status: "matched", matchStatus: "matched", paymentPending: true } as const;
  assert.equal(bankLineStatusLabel(matched), PAYMENT_NOT_POSTED);
  assert.equal(bankLineStatusLabel({ ...matched, status: "partially_matched" }), PAYMENT_NOT_POSTED);
  assert.equal(bankLineStatusLabel({ ...matched, paymentPending: false }), "Matched");
  assert.equal(bankLineStatusLabel({ status: "proposed", matchStatus: "proposed", paymentPending: false }), "Proposed");
  assert.equal(bankLineStatusLabel({ status: "needs_review", matchStatus: "unmatched" }), "Needs review");
  // An older backend without the field never claims a payment is waiting.
  assert.equal(bankPaymentNotPosted({ status: "matched", matchStatus: "matched" }), false);
});

test("Confirm and post payment sends postPayment once; Confirm match only does not", async (t) => {
  const bodies: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(url).endsWith("/api/bank/reconciliation/candidates/candidate/decision"));
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ settlementId: "s", payment: { journalId: "j", lines: [], idempotent: false } }, { status: 201 });
  });
  const posted = await decideMatch(user, "candidate", "confirm", 3, undefined, { postPayment: true });
  await decideMatch(user, "candidate", "confirm", 3);
  assert.equal(posted.payment?.journalId, "j");
  assert.deepEqual(bodies, [
    { candidateId: "candidate", decision: "confirmed", expectedRevision: 3, postPayment: true },
    { candidateId: "candidate", decision: "confirmed", expectedRevision: 3 },
  ]);
});

test("the payment preview asks for the proposed candidate's journal", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    urls.push(String(url));
    return Response.json({ canPost: false, blockedReason: "closed", journalDate: null, periodCode: null, lines: [] });
  });
  const preview = await getBankPaymentPreview("line 1", "cand");
  await getBankPaymentPreview("line 1");
  assert.equal(preview.canPost, false);
  assert.ok(urls[0].endsWith("/api/bank/transactions/line%201/payment-preview?candidateId=cand"));
  assert.ok(urls[1].endsWith("/api/bank/transactions/line%201/payment-preview"));
});

function summary(paymentsToPost?: HomeSummary["tiles"]["paymentsToPost"]): HomeSummary {
  const none = { available: true as const, scope: "company" as const, count: 0, link: null };
  return {
    asOf: "2026-11-23", currency: "MYR", role: "LOCAL_ADMIN",
    tiles: {
      toReview: { ...none, scope: "yours" }, readyToApprove: { ...none, scope: "yours" },
      needsFixing: { ...none, scope: "yours", topReasons: [] }, waitingApproval: { ...none, scope: "yours" },
      bankToMatch: { ...none, moneyIn: 0, moneyOut: 0 },
      billsDueSoon: { ...none, amount: "0.00", currency: "MYR", otherCurrencyCount: 0, noDueDate: 0 },
      billsOverdue: { ...none, amount: "0.00", currency: "MYR", otherCurrencyCount: 0, noDueDate: 0 },
      invoicesOverdue: { ...none, amount: "0.00", currency: "MYR", otherCurrencyCount: 0, noDueDate: 0 },
      journalsToPost: { ...none, draftJournals: 0 },
      ...(paymentsToPost ? { paymentsToPost } : {}),
    },
    monthEnd: { available: false, reason: "n/a", link: null },
  };
}

test("bank payments to post appear in the admin's attention list and open the to-post bank lines", () => {
  const view = dashboardView(summary({ available: true, scope: "company", count: 2,
    link: { page: "reconciliation", query: "status=to-post" } }), "LOCAL_ADMIN");
  const tile = view.attention.find((item) => item.id === "paymentsToPost");
  assert.ok(tile);
  assert.equal(tile.title, "Bank payments to post");
  assert.equal(tile.value, "2");
  assert.equal(tile.href, "/company/reconciliation?status=to-post");
  assert.match(tile.caption, /2 matched bank lines/);
  assert.equal(view.allClear, false);
  const accountant = todayTiles(summary({ available: true, scope: "company", count: 1,
    link: { page: "reconciliation", query: "status=to-post" } }), "ACCOUNTANT").find((item) => item.id === "paymentsToPost");
  assert.equal(accountant?.caption, "1 matched bank line waiting for an admin to post");
  // An older backend without the tile still renders the other tiles.
  assert.equal(todayTiles(summary(), "LOCAL_ADMIN").some((item) => item.id === "paymentsToPost"), false);
});

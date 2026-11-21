import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalAmount, journalAttemptKey, journalPostFinished, settleJournalAttempt, type JournalAttemptContent, type KeyStore,
} from "../src/lib/api/journal-attempts";
import { currencyTotals } from "../src/lib/api/document-contract";

function store(): KeyStore {
  const map = new Map<string, string>();
  return { get: (name) => map.get(name) ?? null, set: (name, value) => { map.set(name, value); }, remove: (name) => { map.delete(name); } };
}
const entry: JournalAttemptContent = {
  periodId: "p1", journalDate: "2026-08-27", description: "Office supplies",
  lines: [{ accountId: "a1", debit: "10" }, { accountId: "a2", credit: "10" }],
};
let counter = 0;
const next = () => `key-${++counter}`;

test("a retry of the same entry reuses its key, even from a new form (Codex P1 on #9)", () => {
  const keys = store();
  const first = journalAttemptKey(entry, keys, next);
  // The form unmounted (tab switch) and the same entry is submitted again; "10.00" is the same amount as "10".
  const again = journalAttemptKey({ ...entry, lines: [{ accountId: "a1", debit: "10.00" }, { accountId: "a2", credit: "10.00" }] }, keys, next);
  assert.equal(again, first);
});

test("a post that finished after the form closed keeps its key, so a retry is answered 'already recorded' (Codex P1 round 2)", () => {
  const keys = store();
  const sent = journalAttemptKey(entry, keys, next);
  journalPostFinished(entry, false, keys); // the response arrived after a tab switch unmounted the form
  assert.equal(journalAttemptKey(entry, keys, next), sent);
  journalPostFinished(entry, true, keys); // shown to the person: the next identical entry is a new journal
  assert.notEqual(journalAttemptKey(entry, keys, next), sent);
});

test("amounts are compared as exact decimals, not floats (Codex P2 on #9)", () => {
  assert.equal(canonicalAmount("010.50"), "10.5");
  assert.equal(canonicalAmount("10.00"), "10");
  assert.notEqual(canonicalAmount("10.005"), canonicalAmount("10.01"));
  assert.notEqual(canonicalAmount("12345678901234567.01"), canonicalAmount("12345678901234567.02"));
});

test("an edited entry gets a new key, so it is not answered with the earlier journal", () => {
  const keys = store();
  const first = journalAttemptKey(entry, keys, next);
  const edited = journalAttemptKey({ ...entry, lines: [{ accountId: "a1", debit: "12" }, { accountId: "a2", credit: "12" }] }, keys, next);
  assert.notEqual(edited, first);
});

test("after a confirmed post the same content starts a new journal", () => {
  const keys = store();
  const first = journalAttemptKey(entry, keys, next);
  settleJournalAttempt(entry, keys);
  assert.notEqual(journalAttemptKey(entry, keys, next), first);
});

test("currencyTotals sums 20,000 settlements quickly and exactly", () => {
  const rows = Array.from({ length: 20000 }, (_, index) => ({ currency: "MYR", total: index % 2 ? "0.01" : "0.125" }));
  const started = performance.now();
  const [total] = currencyTotals(rows);
  assert.ok(performance.now() - started < 200);
  assert.deepEqual(total, { currency: "MYR", total: "1350.000", records: 20000 });
});

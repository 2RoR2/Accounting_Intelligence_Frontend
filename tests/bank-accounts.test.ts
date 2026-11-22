import assert from "node:assert/strict";
import test from "node:test";
import { matchesBankAccount, postedBankBalance, summarizeBankImports } from "../src/features/common/money/bank-accounts";
import type { BankMoneyTransaction } from "../src/types/money";

const account = {
  id: "operating",
  code: "OPS-01",
  name: "Operating account",
  data: { accountNumber: "0012-345 678" },
};

function bankLine(id: string, bankAccountRef: string | null, postedDate: string): BankMoneyTransaction {
  return {
    id,
    tenantId: "company",
    bankAccountRef,
    postedDate,
    direction: "money_in",
    description: "Statement line",
    amount: "10.00",
    allocatedAmount: "0.00",
    remainingAmount: "10.00",
    currency: "MYR",
    status: "imported",
    matchStatus: "unmatched",
    recordedDocumentId: null,
    recordedDocumentNumber: null,
    recordedDocumentType: null,
    createdAt: null,
  };
}

test("matches account numbers with spaces and dashes while preserving leading zeros", () => {
  assert.equal(matchesBankAccount(" 0012 345-678 ", account), true);
  assert.equal(matchesBankAccount("0012345678", account), true);
  assert.equal(matchesBankAccount("12345678", account), false);
});

test("matches trimmed, case-insensitive codes and names", () => {
  assert.equal(matchesBankAccount(" ops-01 ", account), true);
  assert.equal(matchesBankAccount("OPERATING ACCOUNT", account), true);
  assert.equal(matchesBankAccount("ops01", account), false);
  assert.equal(matchesBankAccount("Other account", account), false);
  assert.equal(matchesBankAccount(null, account), false);
  assert.equal(matchesBankAccount("   ", { ...account, code: null, data: {} }), false);
  assert.equal(matchesBankAccount("other", { ...account, data: { accountNumber: "---" } }), false);
});

test("counts matched lines, finds the latest date, and retains unmatched refs", () => {
  const savings = { id: "savings", code: "SAVE", name: "Savings", data: {} };
  const { linked, unlinked } = summarizeBankImports([account, savings], [
    bankLine("1", "0012 345-678", "2026-11-05"),
    bankLine("2", " ops-01 ", "2026-11-08"),
    { ...bankLine("3", "OPERATING ACCOUNT", "2026-10-30"), direction: "money_out" },
    bankLine("4", "Unregistered", "2026-11-10"),
    bankLine("5", " Unregistered ", "2026-11-12"),
    bankLine("6", null, "2026-11-01"),
  ]);

  assert.deepEqual(linked.get(account.id), { lines: 3, lastDate: "2026-11-08" });
  assert.equal(linked.has(savings.id), false);
  assert.deepEqual(unlinked.map(({ ref, lines, lastDate }) => ({ ref, lines, lastDate })), [
    { ref: "Account not stated", lines: 1, lastDate: "2026-11-01" },
    { ref: "Unregistered", lines: 2, lastDate: "2026-11-12" },
  ]);
});

test("calculates the posted balance as debits minus credits", () => {
  assert.equal(postedBankBalance({ totalDebit: "1234.51", totalCredit: "0.01" }), "1234.50");
  assert.equal(postedBankBalance({ totalDebit: "10.03", totalCredit: "20.31" }), "-10.28");
  assert.equal(postedBankBalance({ totalDebit: "0.005", totalCredit: "0.004" }), "0.001");
  assert.equal(postedBankBalance({ totalDebit: "10", totalCredit: "10.00" }), "0.00");
  assert.equal(postedBankBalance(), "0.00");
});

test("keeps letters in account numbers and leaves ambiguous references unlinked", () => {
  const card = { id: "card", code: null, name: "Card", data: { accountNumber: "AB-1234" } };
  assert.equal(matchesBankAccount("ab 1234", card), true);
  assert.equal(matchesBankAccount("CD1234", card), false);
  assert.equal(matchesBankAccount("Card ending 1234", { ...card, name: "Other", data: { accountNumber: "1234" } }), false);
  const first = { id: "a", code: "OPS", name: "First", data: {} };
  const second = { id: "b", code: "OPS", name: "Second", data: {} };
  const { linked, unlinked } = summarizeBankImports([first, second], [bankLine("9", "OPS", "2026-11-01")]);
  assert.equal(linked.size, 0);
  assert.deepEqual(unlinked.map((row) => row.ref), ["OPS"]);
});

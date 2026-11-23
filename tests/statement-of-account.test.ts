import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultStatementRange, StatementTable } from "../src/features/common/contacts/contact-statement";
import { contactStatementPath, statementFileName, type ContactStatement } from "../src/lib/api/statement.service";

const statement: ContactStatement = {
  contact: { id: "c-1", kind: "customer", name: "Kedai Runcit Maju", code: "KRM", registrationNumber: null, tin: null,
             address: "", phone: null, email: null },
  kind: "customer", fromDate: "2026-08-11", toDate: "2026-11-23", currency: "MYR", openingBalance: "1500.00",
  lines: [
    { date: "2026-08-12", type: "credit-note", label: "Credit note", number: "CN-00001", description: "Returned goods", dueDate: null,
      amount: "-200.00", source: "typed", debit: "0.00", credit: "200.00", balance: "1300.00" },
    { date: "2026-08-20", type: "payment", label: "Payment received", number: "PY-00001", description: "", dueDate: null,
      amount: "-300.00", source: "typed", debit: "0.00", credit: "300.00", balance: "1000.00" },
  ],
  totalDebit: "0.00", totalCredit: "500.00", closingBalance: "950.00", balanceLabel: "Amount owed by the customer",
  ageing: { asOf: "2026-11-23", buckets: ["current", "1-30", "31-60", "61-90", "90+"],
            totals: { current: "0.00", "1-30": "0.00", "31-60": "0.00", "61-90": "0.00", "90+": "1000.00" },
            openItems: "1000.00", unallocatedCredits: "50.00", balance: "950.00", reconciles: true, difference: "0.00", items: [] },
};

test("the statement uses the contact statement endpoint with from/to and the PDF format", () => {
  const range = { fromDate: "2026-08-01", toDate: "2026-08-31" };
  assert.equal(contactStatementPath("c-1", range), "/api/contacts/c-1/statement?from=2026-08-01&to=2026-08-31");
  assert.equal(contactStatementPath("a/b", range, "pdf"), "/api/contacts/a%2Fb/statement?from=2026-08-01&to=2026-08-31&format=pdf");
  assert.equal(statementFileName(statement), "statement-KRM-2026-08-11-to-2026-11-23.pdf");
  assert.equal(statementFileName({ ...statement, contact: { ...statement.contact, code: null, name: "Ali & Sons Sdn. Bhd." } }),
    "statement-Ali-Sons-Sdn-Bhd-2026-08-11-to-2026-11-23.pdf");
});

test("the default range is the start of the Malaysian year to today", () => {
  // 31 Dec 2026 20:00 UTC is already 1 Jan 2027 in Kuala Lumpur.
  assert.deepEqual(defaultStatementRange(new Date("2026-12-31T20:00:00Z")), { fromDate: "2027-01-01", toDate: "2027-01-01" });
  assert.deepEqual(defaultStatementRange(new Date("2026-11-23T04:00:00Z")), { fromDate: "2026-01-01", toDate: "2026-11-23" });
});

test("the preview shows opening, each line once, closing, the ageing and unallocated credits", () => {
  const html = renderToStaticMarkup(createElement(StatementTable, { statement }));
  for (const text of ["Opening balance", "CN-00001", "PY-00001", "Closing balance", "Amount owed by the customer", "Over 90 days",
    "Payments and credits not allocated to an item"]) {
    assert.ok(html.includes(text), text);
  }
  assert.equal(html.split("CN-00001").length - 1, 1);
  assert.ok(!html.includes("differs from the closing balance"));
  const flagged = renderToStaticMarkup(createElement(StatementTable, {
    statement: { ...statement, ageing: { ...statement.ageing, reconciles: false, difference: "12.00" } },
  }));
  assert.ok(flagged.includes("differs from the closing balance"));
});

test("the preview explains unposted matched payments and an amount due below the posted total", () => {
  const html = renderToStaticMarkup(createElement(StatementTable, {
    statement: { ...statement, ageing: { ...statement.ageing, unallocatedCredits: "0.00", unpostedPayments: "500.00",
                                         amountDueBelowTotal: "200.00", balance: "1700.00" } },
  }));
  assert.ok(html.includes("Matched payments not yet posted (still owed)"));
  assert.ok(html.includes("total above the amount due shown"));
  assert.ok(!html.includes("not allocated to an item"));
});

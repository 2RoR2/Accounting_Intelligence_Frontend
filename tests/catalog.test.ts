import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_LABELS, CATALOG_TABS, accountsForPurpose, changedPostingAccounts, entryToForm, formToInput, formToProductInput,
  isCompanyAdmin, numberPreview, parseCatalogTab, parseOptions, productToForm, validateCatalogForm, validateProductForm,
  type CatalogForm,
} from "../src/features/common/erp/catalog-logic";
import type { CatalogEntry, Product } from "../src/lib/api/erp.service";
import type { LedgerAccount } from "../src/lib/api/ledger.service";

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
  id: "e1", kind: "currency", code: null, name: "", description: null, data: {}, isActive: true,
  createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", ...overrides,
});
const form = (kind: Parameters<typeof entryToForm>[0], overrides: Partial<CatalogForm>): CatalogForm =>
  ({ ...entryToForm(kind), ...overrides });

test("tabs: every kind has a label, unknown or missing kind falls back to payment terms", () => {
  assert.deepEqual(CATALOG_TABS.map((tab) => CATALOG_LABELS[tab]), ["Payment terms", "Payment methods", "Currencies",
    "Bank accounts", "Tags", "Categories", "Locations", "Custom fields", "Number formats", "Products & services", "Posting accounts"]);
  assert.equal(parseCatalogTab(null), "payment-term");
  assert.equal(parseCatalogTab("coupon"), "payment-term");
  assert.equal(parseCatalogTab("products"), "products");
  assert.equal(parseCatalogTab("posting-accounts"), "posting-accounts");
  assert.equal(parseCatalogTab("currency"), "currency");
  assert.equal(isCompanyAdmin("LOCAL_ADMIN"), true);
  assert.equal(isCompanyAdmin("ACCOUNTANT"), false);
});

test("payment term: days are an integer from 0 to 365 and sent as a number", () => {
  assert.equal(validateCatalogForm("payment-term", form("payment-term", { name: "Net 30", days: "30" })), null);
  assert.equal(validateCatalogForm("payment-term", form("payment-term", { name: "Now", days: "0" })), null);
  for (const days of ["366", "-1", "2.5", "", "abc"]) {
    assert.match(validateCatalogForm("payment-term", form("payment-term", { name: "X", days })) ?? "", /0 to 365/);
  }
  assert.match(validateCatalogForm("payment-term", form("payment-term", { name: " " })) ?? "", /name/);
  const input = formToInput("payment-term", form("payment-term", { name: " Net 30 ", code: "N30", days: "30" }));
  assert.deepEqual(input, { name: "Net 30", code: "N30", description: null, active: true, data: { days: 30 }, ledgerAccountId: null });
});

test("currency: code upper-cased, three letters; a rate needs a date; MYR rate is 1; other data keys kept", () => {
  assert.equal(validateCatalogForm("currency", form("currency", { name: "US dollar", code: "usd" })), null);
  assert.match(validateCatalogForm("currency", form("currency", { name: "X", code: "US" })) ?? "", /three letters/);
  assert.match(validateCatalogForm("currency", form("currency", { name: "X", code: "US1" })) ?? "", /three letters/);
  assert.match(validateCatalogForm("currency", form("currency", { name: "X", code: "USD", rate: "4.5" })) ?? "", /date/);
  assert.match(validateCatalogForm("currency", form("currency", { name: "X", code: "USD", rate: "4.5", rateDate: "2026-02-30" })) ?? "", /valid date/);
  assert.match(validateCatalogForm("currency", form("currency", { name: "X", code: "USD", rate: "0", rateDate: "2026-11-01" })) ?? "", /positive/);
  assert.match(validateCatalogForm("currency", form("currency", { name: "X", code: "USD", rate: "1.1234567", rateDate: "2026-11-01" })) ?? "", /six decimal/);
  assert.match(validateCatalogForm("currency", form("currency", { name: "Ringgit", code: "MYR", rate: "2", rateDate: "2026-11-01" })) ?? "", /MYR rate must be 1/);
  assert.equal(validateCatalogForm("currency", form("currency", { name: "X", code: "USD", rate: "4.471200", rateDate: "2026-11-01" })), null);

  const existing = entry({ code: "USD", name: "US dollar", data: { symbol: "$", rate: "4.40", rateDate: "2026-10-01", decimals: 2 } });
  const edited = { ...entryToForm("currency", existing), rate: "4.47", rateDate: "2026-11-01" };
  assert.deepEqual(formToInput("currency", edited).data, { symbol: "$", rate: "4.47", rateDate: "2026-11-01", decimals: 2 });
  const cleared = { ...entryToForm("currency", existing), rate: "" };
  assert.deepEqual(formToInput("currency", cleared).data, { symbol: "$", decimals: 2 });
  assert.equal(formToInput("currency", form("currency", { name: "Euro", code: " eur " })).code, "EUR");
});

test("bank account: ledger account required and sent at the top level", () => {
  assert.match(validateCatalogForm("bank-account", form("bank-account", { name: "Main" })) ?? "", /ledger account/);
  const input = formToInput("bank-account", form("bank-account", { name: "Main", ledgerAccountId: "acc-1", accountNumber: "123", bankName: "" }));
  assert.equal(input.ledgerAccountId, "acc-1");
  assert.deepEqual(input.data, { accountNumber: "123" });
  assert.equal(formToInput("category", form("category", { name: "A", ledgerAccountId: "acc-1" })).ledgerAccountId, null);
});

test("tag and custom field rules", () => {
  assert.equal(entryToForm("tag").color, "#64748b");
  assert.deepEqual(formToInput("tag", form("tag", { name: "Urgent", color: "#ff0000", code: "x" })),
    { name: "Urgent", code: null, description: null, active: true, data: { color: "#ff0000" }, ledgerAccountId: null });

  const ok = form("custom-field", { name: "Project", code: "project_code", fieldType: "text" });
  assert.equal(validateCatalogForm("custom-field", ok), null);
  for (const code of ["Project", "1abc", "has space", "", "a".repeat(41)]) {
    assert.match(validateCatalogForm("custom-field", { ...ok, code }) ?? "", /Key must/);
  }
  assert.match(validateCatalogForm("custom-field", { ...ok, fieldType: "select", options: " , " }) ?? "", /option/);
  assert.deepEqual(parseOptions("Red, Blue ,, Red,Green"), ["Red", "Blue", "Green"]);
  const select = formToInput("custom-field", { ...ok, fieldType: "select", options: "A, B", required: true });
  assert.deepEqual(select.data, { fieldType: "select", options: ["A", "B"], required: true });
  assert.deepEqual(formToInput("custom-field", { ...ok, options: "A" }).data, { fieldType: "text", options: [], required: false });
});

test("number format: prefix, padding and preview", () => {
  assert.equal(numberPreview("IV-", 5), "IV-00001");
  assert.equal(numberPreview("bl", "3"), "BL001");
  assert.equal(numberPreview("IV-", "9"), "");
  const ok = form("number-format", { name: "Invoices", documentType: "invoice", prefix: "IV-", padding: "5" });
  assert.equal(validateCatalogForm("number-format", ok), null);
  assert.match(validateCatalogForm("number-format", { ...ok, prefix: "IV/" }) ?? "", /Prefix/);
  assert.match(validateCatalogForm("number-format", { ...ok, prefix: "" }) ?? "", /Prefix/);
  assert.match(validateCatalogForm("number-format", { ...ok, prefix: "ABCDEFGHIJK" }) ?? "", /Prefix/);
  assert.match(validateCatalogForm("number-format", { ...ok, padding: "2" }) ?? "", /3 to 8/);
  assert.match(validateCatalogForm("number-format", { ...ok, documentType: "nope" }) ?? "", /document type/);
  assert.deepEqual(formToInput("number-format", { ...ok, prefix: "iv-" }).data, { documentType: "invoice", prefix: "IV-", padding: 5 });
});

test("payment method type is limited to the backend's list", () => {
  assert.equal(validateCatalogForm("payment-method", form("payment-method", { name: "Bank", type: "bank_transfer" })), null);
  assert.match(validateCatalogForm("payment-method", form("payment-method", { name: "X", type: "crypto" })) ?? "", /type/);
});

test("products: form round trip keeps fields, validation of prices", () => {
  const product: Product = {
    id: "p1", name: "Consulting", sku: "C-1", kind: "service", unit: "hour", salePrice: "250.00", purchasePrice: "0.00",
    quantity: "0", groupName: "Services", incomeAccountId: "inc-1", expenseAccountId: null, fields: { colour: "blue" },
    isActive: true, createdAt: "", updatedAt: "",
  };
  const input = formToProductInput({ ...productToForm(product), salePrice: "300" });
  assert.deepEqual(input, {
    quantity: "0", groupName: "Services", fields: { colour: "blue" }, name: "Consulting", sku: "C-1", kind: "service",
    unit: "hour", salePrice: "300", purchasePrice: "0.00", incomeAccountId: "inc-1", expenseAccountId: null,
  });
  assert.equal(validateProductForm(productToForm(product)), null);
  assert.match(validateProductForm({ ...productToForm(product), name: "" }) ?? "", /name/);
  assert.match(validateProductForm({ ...productToForm(product), salePrice: "-1" }) ?? "", /Sale price/);
  assert.match(validateProductForm({ ...productToForm(product), purchasePrice: "1.23456" }) ?? "", /Purchase price/);
  assert.match(validateProductForm({ ...productToForm(product), unit: "" }) ?? "", /unit/);
  assert.equal(formToProductInput({ ...productToForm(), name: "New", sku: " " }).sku, null);
});

test("posting accounts: selects limited by type, only changed purposes are saved", () => {
  const accounts: LedgerAccount[] = [
    { id: "a2", code: "1200", name: "Trade receivables", accountType: "asset" },
    { id: "a1", code: "1100", name: "Bank", accountType: "asset" },
    { id: "l1", code: "2100", name: "Trade payables", accountType: "liability" },
    { id: "i1", code: "4000", name: "Sales", accountType: "income" },
    { id: "x1", code: "5000", name: "Purchases", accountType: "expense" },
  ];
  assert.deepEqual(accountsForPurpose(accounts, "receivable").map((a) => a.id), ["a1", "a2"]);
  assert.deepEqual(accountsForPurpose(accounts, "bank").map((a) => a.id), ["a1", "a2"]);
  assert.deepEqual(accountsForPurpose(accounts, "revenue").map((a) => a.id), ["i1"]);
  assert.deepEqual(accountsForPurpose(accounts, "tax_output").map((a) => a.id), ["l1"]);
  assert.deepEqual(accountsForPurpose(accounts, "expense").map((a) => a.id), ["x1"]);
  const saved = [
    { purpose: "receivable" as const, accountId: "a2" }, { purpose: "revenue" as const, accountId: null },
    { purpose: "bank" as const, accountId: "a1" },
  ];
  assert.deepEqual(changedPostingAccounts(saved, { receivable: "a2", revenue: "i1", bank: "" }), { revenue: "i1" });
  assert.deepEqual(changedPostingAccounts(saved, {}), {});
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  accountOptions, bankOptions, blankLine, contactCurrency, contactOptions, contactSummary, descriptionOptions, exactOption,
  filterOptions, formatAmount, isBlankLine, lineAmount, lineFromSuggestion, lineSums, normalize, productOptions, recentLines,
  taxOptions, termOptions, type ComboOption,
} from "../src/features/common/erp/assisted-entry";
import type { CatalogEntry, Contact, DocumentLine, ErpDocument, Product, TypedDocument } from "../src/lib/api/erp.service";

const contact = (over: Partial<Contact>): Contact => ({
  id: "c1", kind: "customer", legalName: "Senduduk Fit-Out Sdn. Bhd.", code: "SEN", fields: {}, isActive: true,
  createdAt: "", updatedAt: "", ...over,
});
const product = (over: Partial<Product>): Product => ({
  id: "p1", name: "Cement 50kg", sku: "CEM-50", kind: "inventory", unit: "bag", salePrice: "32.50", purchasePrice: "27.00",
  quantity: "0", fields: {}, isActive: true, createdAt: "", updatedAt: "", ...over,
});
const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  id: "e1", kind: "tax-code", code: "SST-10", name: "Sales tax 10%", data: {}, isActive: true, createdAt: "", updatedAt: "", ...over,
});
const doc = (over: Partial<TypedDocument>): ErpDocument => ({
  id: "d1", type: "invoice", number: "INV-0001", currency: "MYR", subtotal: "0", taxAmount: "0", amount: "0", posts: true,
  posted: false, createdAt: "", updatedAt: "", source: "typed", status: "ready", lines: [], allocations: [], tags: [], fields: {},
  ...over,
} as TypedDocument);
const line = (over: Partial<DocumentLine>): DocumentLine => ({ description: "", quantity: "1", unitPrice: "0", ...over });

// ------------------------------------------------------------ filtering
const people: ComboOption[] = [
  { id: "1", label: "Kuini Office Works Sdn. Bhd.", keywords: ["KU", "C20231234567"] },
  { id: "2", label: "Senduduk Fit-Out Sdn. Bhd.", keywords: ["SEN"], detail: "TIN C9988776655" },
  { id: "3", label: "Bina Senang Enterprise", keywords: ["BSE"] },
];
const ids = (options: readonly ComboOption[]) => options.map(({ id }) => id);

test("filterOptions with no text returns the options in their order, up to the limit", () => {
  assert.deepEqual(ids(filterOptions(people, "")), ["1", "2", "3"]);
  assert.deepEqual(ids(filterOptions(people, "  ", 2)), ["1", "2"]);
});

test("filterOptions matches the name, the code, the TIN and other keywords, ignoring case", () => {
  assert.deepEqual(ids(filterOptions(people, "kuini")), ["1"]);
  assert.deepEqual(ids(filterOptions(people, "sen")), ["2", "3"], "code SEN first, then the word Senang");
  assert.deepEqual(ids(filterOptions(people, "c99887")), ["2"], "TIN in the detail line");
  assert.deepEqual(ids(filterOptions(people, "C2023")), ["1"], "registration number keyword");
  assert.deepEqual(filterOptions(people, "zzz"), []);
});

test("filterOptions needs every typed word, in any order", () => {
  assert.deepEqual(ids(filterOptions(people, "works kuini")), ["1"]);
  assert.deepEqual(ids(filterOptions(people, "sdn fit")), ["2"]);
});

test("filterOptions ranks an exact code, then a starting match, then a word start, then anything containing it", () => {
  const options: ComboOption[] = [
    { id: "contains", label: "Supercement mix" },
    { id: "word", label: "Grey cement" },
    { id: "starts", label: "Cement 50kg" },
    { id: "code", label: "Bag of mortar", keywords: ["cement"] },
  ];
  assert.deepEqual(ids(filterOptions(options, "cement")), ["code", "starts", "word", "contains"]);
  assert.deepEqual(ids(filterOptions(options, "CEMENT", 2)), ["code", "starts"], "limit applies after ranking");
});

test("filterOptions ignores accents and extra spaces", () => {
  assert.equal(normalize(" Café  Kopitiam "), "cafe kopitiam");
  assert.deepEqual(ids(filterOptions([{ id: "cafe", label: "Café  Kopitiam" }], "cafe kopi")), ["cafe"]);
});

test("exactOption finds the option whose label is exactly what was typed", () => {
  assert.equal(exactOption(people, "bina senang enterprise")?.id, "3");
  assert.equal(exactOption(people, "bina"), undefined);
  assert.equal(exactOption(people, ""), undefined);
});

// ------------------------------------------------------------ how records read
test("contactOptions show the code, TIN, SSM and city, and match on them; inactive contacts are left out", () => {
  const options = contactOptions([
    contact({ registrationNumber: "202301012345", city: "Kuching", fields: { tin: "C1234567890", sstNumber: "W10-1808-31000001" } }),
    contact({ id: "old", legalName: "Old Co", isActive: false }),
  ]);
  assert.equal(options.length, 1);
  assert.equal(options[0].detail, "SEN · TIN C1234567890 · SSM 202301012345 · Kuching");
  assert.deepEqual(ids(filterOptions(options, "W10-1808")), ["c1"], "SST number matches");
});

test("productOptions show the SKU and the price for this side, and match on the SKU", () => {
  const products = [product({ defaultTaxCode: "SST-10" }), product({ id: "p2", name: "Labour", sku: null, salePrice: "1200", purchasePrice: "0" })];
  const sales = productOptions(products, true);
  assert.equal(sales[0].detail, "CEM-50 · MYR 32.50 · Tax SST-10");
  assert.equal(sales[1].detail, "MYR 1,200.00");
  assert.equal(productOptions(products, false)[0].detail, "CEM-50 · MYR 27.00 · Tax SST-10");
  assert.deepEqual(ids(filterOptions(sales, "cem-5")), ["p1"]);
});

test("account, bank, tax-code and term options", () => {
  const accounts = accountOptions([{ id: "a1", code: "4000", name: "Sales", accountType: "revenue" }]);
  assert.deepEqual(accounts, [{ id: "a1", label: "4000 · Sales", detail: "revenue", keywords: ["4000"] }]);
  assert.equal(filterOptions(accounts, "400")[0].id, "a1");
  const banks = bankOptions([entry({ id: "b1", kind: "bank-account", code: "MBB", name: "Maybank current", data: { accountNumber: "5140 1234" } }),
    entry({ id: "b2", kind: "bank-account", name: "Closed", isActive: false })]);
  assert.deepEqual(ids(banks), ["b1"]);
  assert.equal(filterOptions(banks, "5140")[0].id, "b1");
  assert.deepEqual(taxOptions([entry({}), entry({ id: "x", code: null }), entry({ id: "y", code: "OLD", isActive: false })])
    .map(({ id, label, detail }) => [id, label, detail]), [["SST-10", "SST-10", "Sales tax 10%"]]);
  assert.deepEqual(termOptions([entry({ kind: "payment-term", name: "Net 30", code: null, data: { days: 30 } }),
    entry({ kind: "payment-term", name: "COD", code: null, data: { days: 0 } })]).map(({ id, detail }) => [id, detail]),
  [["Net 30", "30 days"], ["COD", "Due on receipt"]]);
});

// ------------------------------------------------------------ header fill
test("contactSummary is what prints in the bill-to box; contactCurrency is a 3-letter code or nothing", () => {
  assert.equal(contactSummary(undefined), null);
  assert.deepEqual(contactSummary(contact({ address: "Lot 12, Jalan Senduduk", postcode: "93350", city: "Kuching", state: "Sarawak",
    registrationNumber: "202301012345", email: "ap@senduduk.test", fields: { tin: "C1234567890" } })), {
    address: "Lot 12, Jalan Senduduk, 93350 Kuching, Sarawak", registrationNumber: "202301012345", tin: "C1234567890",
    sstNumber: "", email: "ap@senduduk.test", phone: "",
  });
  assert.equal(contactCurrency(contact({ fields: { currency: "sgd" } })), "SGD");
  assert.equal(contactCurrency(contact({ fields: { currency: "Singapore dollar" } })), null);
  assert.equal(contactCurrency(contact({})), null);
});

// ------------------------------------------------------------ description typeahead
test("recentLines lists each description once, newest first, skipping void documents and the one being edited", () => {
  const rows = recentLines([
    doc({ id: "editing", number: "INV-0009", lines: [line({ description: "Should not appear" })] }),
    doc({ id: "d3", number: "INV-0003", lines: [line({ description: "Tiling works", unitPrice: "900" }), line({ description: "  " })] }),
    doc({ id: "d2", number: "INV-0002", status: "void", lines: [line({ description: "Void line" })] }),
    doc({ id: "d1", number: "INV-0001", lines: [line({ description: "tiling WORKS", unitPrice: "800" }), line({ description: "Grout" })] }),
  ], "editing");
  assert.deepEqual(rows.map(({ line: { description, unitPrice }, number }) => [description, unitPrice, number]),
    [["Tiling works", "900", "INV-0003"], ["Grout", "0", "INV-0001"]]);
  assert.equal(recentLines([doc({ lines: [line({ description: "A" }), line({ description: "B" })] })], null, 1).length, 1);
});

test("descriptionOptions put the contact's recent lines before catalog items, each saying where it comes from", () => {
  const recent = recentLines([doc({ lines: [line({ description: "Tiling works", unitPrice: "900", taxCode: "SV-8" })] })]);
  const options = descriptionOptions([product({})], recent, true);
  assert.deepEqual(options.map(({ label, detail, source }) => [label, detail, source]), [
    ["Tiling works", "Used on INV-0001 · MYR 900.00 · Tax SV-8", "recent"],
    ["Cement 50kg", "Catalog · CEM-50 · MYR 32.50", "catalog"],
  ]);
  assert.deepEqual(filterOptions(options, "cem").map(({ source }) => source), ["catalog"]);
});

test("picking a catalog suggestion fills like choosing the product; a recent line fills its price, code and account", () => {
  const [recent, catalog] = descriptionOptions([product({ incomeAccountId: "a-sales", defaultTaxCode: "SST-10" })],
    recentLines([doc({ lines: [line({ description: "Tiling works", quantity: "3", unitPrice: "900", discount: "10", tax: "72",
      taxCode: "SV-8", accountId: "a-works", itemId: null })] })]), true);
  assert.deepEqual(lineFromSuggestion(recent, true),
    { description: "Tiling works", unitPrice: "900.00", itemId: null, taxCode: "SV-8", accountId: "a-works" },
    "quantity, discount and the typed tax amount are not copied");
  assert.deepEqual(lineFromSuggestion(catalog, true),
    { itemId: "p1", description: "Cement 50kg", unitPrice: "32.50", accountId: "a-sales", taxCode: "SST-10" });
  assert.equal(lineFromSuggestion(catalog, false).unitPrice, "27.00", "purchase price on purchase documents");
});

// ------------------------------------------------------------ sums (never a tax calculation)
test("a blank line is one nobody filled in", () => {
  assert.equal(isBlankLine(blankLine()), true);
  assert.equal(isBlankLine(line({ quantity: "5" })), true, "quantity alone does not count");
  assert.equal(isBlankLine(line({ description: "x" })), false);
  assert.equal(isBlankLine(line({ unitPrice: "1" })), false);
  assert.equal(isBlankLine(line({ itemId: "p1" })), false);
  assert.equal(isBlankLine(line({ tax: "0.01" })), false);
});

test("lineAmount is quantity x unit price - discount, rounded to the cent", () => {
  assert.equal(lineAmount(line({ quantity: "3", unitPrice: "32.50", discount: "7.50" })), "90.00");
  assert.equal(lineAmount(line({ quantity: "0.333", unitPrice: "10" })), "3.33");
  assert.equal(lineAmount(line({ quantity: "", unitPrice: "" })), "0.00");
});

test("lineSums add up the lines, the discount and the typed tax; a tax code never adds tax", () => {
  const lines = [
    line({ quantity: "10", unitPrice: "32.50", discount: "25", taxCode: "SST-10", tax: "30.00" }),
    line({ quantity: "2", unitPrice: "450", taxCode: "SST-10" }),
    line({ quantity: "1", unitPrice: "99.99", discount: "0.99", tax: "7.92" }),
  ];
  assert.deepEqual(lineSums("invoice", lines), {
    gross: "1324.99", discount: "25.99", subtotal: "1299.00", tax: "37.92", total: "1336.92",
  });
  assert.deepEqual(lineSums("payment", [], "150.5"), { gross: "150.50", discount: "0.00", subtotal: "150.50", tax: "0.00", total: "150.50" });
});

test("formatAmount groups thousands", () => {
  assert.equal(formatAmount("1234567.5"), "1,234,567.50");
  assert.equal(formatAmount("-1200"), "-1,200.00");
  assert.equal(formatAmount(""), "0.00");
});

test("tidyDecimal writes stored prices the way they are typed", async () => {
  const { tidyDecimal, productLine } = await import("../src/features/common/erp/assisted-entry");
  assert.equal(tidyDecimal("85.0000"), "85.00");
  assert.equal(tidyDecimal("1.2345"), "1.2345");
  assert.equal(tidyDecimal("3.1000"), "3.10");
  assert.equal(tidyDecimal("12"), "12.00");
  assert.equal(tidyDecimal("abc"), "abc");
  assert.equal(productLine(product({ salePrice: "32.5000" }), true).unitPrice, "32.50");
});

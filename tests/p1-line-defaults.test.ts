import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays, changeDocumentDate, chooseContactTerms, chooseTerms, contactTermDays, copiedLines, dueDateFor, editDueDate,
  lastDocumentWithLines, lineFromProduct, taxCodeChoices, termLabel, type TermsState,
} from "../src/features/common/erp/line-defaults";
import { buildContactInput, contactFormProblems, contactToForm, emptyContactForm } from "../src/features/common/contacts/contact-logic";
import {
  entryToForm, formToInput, formToProductInput, productToForm, validateCatalogForm, validateProductForm, CATALOG_LABELS, CATALOG_TABS,
} from "../src/features/common/erp/catalog-logic";
import type { CatalogEntry, Contact, ErpDocument, Product, TypedDocument } from "../src/lib/api/erp.service";

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  id: "e1", kind: "payment-term", code: null, name: "Net 14", description: null, data: { days: 14 }, isActive: true,
  createdAt: "2026-11-01", updatedAt: "2026-11-01", ...over,
});
const terms = [entry({ id: "t0", name: "Due on receipt", data: { days: 0 } }), entry({ id: "t14", name: "Net 14" }),
  entry({ id: "t30", name: "Net 30", data: { days: 30 } }), entry({ id: "old", name: "Net 45", data: { days: 45 }, isActive: false })];
const contact = (fields: Record<string, unknown>): Contact => ({
  id: "c1", kind: "customer", legalName: "Senduduk Fit-Out", fields, isActive: true, createdAt: "", updatedAt: "",
});
const product = (over: Partial<Product> = {}): Product => ({
  id: "p1", name: "Simen 50kg", sku: "SIM", kind: "inventory", unit: "bag", salePrice: "25.5000", purchasePrice: "20.0000",
  quantity: "0", fields: {}, isActive: true, createdAt: "", updatedAt: "", ...over,
});
const fresh = (over: Partial<TermsState> = {}): TermsState =>
  ({ documentDate: "2026-11-24", dueDate: "", paymentTerms: "", termDays: null, auto: true, ...over });

// ---------------------------------------------------------------- dates
test("addDays is calendar arithmetic that crosses months and years", () => {
  assert.equal(addDays("2026-11-24", 14), "2026-12-08");
  assert.equal(addDays("2026-12-25", 30), "2027-01-24");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-11-24", 0), "2026-11-24");
  assert.equal(addDays("2026-02-31", 5), "");
  assert.equal(addDays("", 5), "");
  assert.equal(addDays("24/11/2026", 5), "");
});

test("a contact's terms are a whole number of days from 0 to 365, anything else is none", () => {
  assert.equal(contactTermDays(contact({ paymentTermDays: 14 })), 14);
  assert.equal(contactTermDays(contact({ paymentTermDays: 0 })), 0);
  for (const bad of ["14", 366, -1, 1.5, null, undefined, true]) assert.equal(contactTermDays(contact({ paymentTermDays: bad })), null);
  assert.equal(contactTermDays(undefined), null);
  assert.equal(dueDateFor("2026-11-24", 14), "2026-12-08");
  assert.equal(dueDateFor("2026-11-24", null), "");
});

test("terms are named from the catalog when an active term has the same days", () => {
  assert.equal(termLabel(30, terms), "Net 30");
  assert.equal(termLabel(0, terms), "Due on receipt");
  assert.equal(termLabel(45, terms), "45 days"); // the Net 45 term is inactive
  assert.equal(termLabel(21, terms), "21 days");
});

// ---------------------------------------------------------------- the fill rules
test("choosing a customer with terms fills the terms and the due date", () => {
  const next = chooseContactTerms(fresh(), contact({ paymentTermDays: 14 }), terms);
  assert.deepEqual(next, { documentDate: "2026-11-24", dueDate: "2026-12-08", paymentTerms: "Net 14", termDays: 14, auto: true });
});

test("a contact without terms changes nothing", () => {
  const state = fresh({ dueDate: "2026-12-01", paymentTerms: "Net 30", termDays: 30 });
  assert.equal(chooseContactTerms(state, contact({}), terms), state);
  assert.equal(chooseContactTerms(state, undefined, terms), state);
});

test("changing the document date moves the due date until the due date is edited by hand", () => {
  let state = chooseContactTerms(fresh(), contact({ paymentTermDays: 14 }), terms);
  state = changeDocumentDate(state, "2026-12-01");
  assert.equal(state.dueDate, "2026-12-15");
  state = changeDocumentDate(state, "2026-12-20");
  assert.equal(state.dueDate, "2027-01-03");

  state = editDueDate(state, "2027-02-01");
  assert.equal(state.auto, false);
  state = changeDocumentDate(state, "2027-01-10");
  assert.equal(state.dueDate, "2027-02-01"); // the hand-typed date stays
  assert.equal(state.documentDate, "2027-01-10");
});

test("clearing the due date counts as editing it", () => {
  const state = editDueDate(chooseContactTerms(fresh(), contact({ paymentTermDays: 14 }), terms), "");
  assert.equal(changeDocumentDate(state, "2026-12-01").dueDate, "");
});

test("a contact chosen after the due date was typed does not overwrite it", () => {
  const typed = editDueDate(fresh(), "2026-12-31");
  assert.equal(chooseContactTerms(typed, contact({ paymentTermDays: 14 }), terms), typed);
});

test("a date change with no terms leaves the due date alone", () => {
  const state = fresh({ dueDate: "2026-12-01" });
  assert.equal(changeDocumentDate(state, "2026-11-30").dueDate, "2026-12-01");
});

test("picking payment terms by hand sets the due date and makes it follow the terms again", () => {
  const typed = editDueDate(fresh(), "2026-12-31");
  const picked = chooseTerms(typed, terms[2]);
  assert.deepEqual(picked, { documentDate: "2026-11-24", dueDate: "2026-12-24", paymentTerms: "Net 30", termDays: 30, auto: true });
  assert.equal(changeDocumentDate(picked, "2026-12-01").dueDate, "2026-12-31");
  const none = chooseTerms(picked, null);
  assert.equal(none.paymentTerms, "");
  assert.equal(none.termDays, null);
  assert.equal(none.dueDate, "2026-12-24"); // clearing the terms does not wipe a date
});

// ---------------------------------------------------------------- products
test("a product fills the description, price, account and tax-code label", () => {
  const sold = product({ incomeAccountId: "acc-4000", expenseAccountId: "acc-5000", defaultTaxCode: "SST-10" });
  assert.deepEqual(lineFromProduct(sold, true),
    { itemId: "p1", description: "Simen 50kg", unitPrice: "25.5000", accountId: "acc-4000", taxCode: "SST-10" });
  assert.deepEqual(lineFromProduct(sold, false),
    { itemId: "p1", description: "Simen 50kg", unitPrice: "20.0000", accountId: "acc-5000", taxCode: "SST-10" });
});

test("a product without defaults leaves the line's account and tax code alone", () => {
  const filled = lineFromProduct(product(), true);
  assert.equal("accountId" in filled, false);
  assert.equal("taxCode" in filled, false);
  assert.equal("tax" in filled, false); // the typed tax amount is never touched, let alone calculated
  assert.equal("quantity" in filled, false);
  assert.equal(lineFromProduct(product({ incomeAccountId: "acc-4000" }), false).accountId, undefined); // no purchase account
});

// ---------------------------------------------------------------- tax codes
test("tax codes are offered as labels, active entries only", () => {
  const codes = [
    entry({ id: "a", kind: "tax-code", code: "SV-8", name: "Service tax 8%", data: {} }),
    entry({ id: "b", kind: "tax-code", code: "SST-10", name: "SST-10", data: {} }),
    entry({ id: "c", kind: "tax-code", code: "OLD", name: "Retired", data: {}, isActive: false }),
    entry({ id: "d", kind: "tax-code", code: null, name: "No label", data: {} }),
  ];
  assert.deepEqual(taxCodeChoices(codes), [{ id: "SV-8", label: "SV-8 · Service tax 8%" }, { id: "SST-10", label: "SST-10" }]);
});

test("the catalog gains a Tax codes tab and a tax code needs a short label", () => {
  assert.ok(CATALOG_TABS.includes("tax-code"));
  assert.equal(CATALOG_LABELS["tax-code"], "Tax codes");
  const form = (code: string, name = "Service tax 8%") => ({ ...entryToForm("tax-code"), code, name });
  assert.equal(validateCatalogForm("tax-code", form("SV-8")), null);
  assert.match(validateCatalogForm("tax-code", form("")) ?? "", /tax code/i);
  assert.match(validateCatalogForm("tax-code", form("X".repeat(41))) ?? "", /1 to 40/);
  assert.match(validateCatalogForm("tax-code", form("SV-8", " ")) ?? "", /description/i);
  const input = formToInput("tax-code", form(" SV-8 "));
  assert.equal(input.code, "SV-8");
  assert.deepEqual(input.data, {}); // a label only: no rate is stored
});

test("a product keeps its default tax code through the form", () => {
  const form = productToForm(product({ defaultTaxCode: "SST-10" }));
  assert.equal(form.defaultTaxCode, "SST-10");
  assert.equal(formToProductInput(form).defaultTaxCode, "SST-10");
  assert.equal(formToProductInput({ ...form, defaultTaxCode: "  " }).defaultTaxCode, null);
  assert.equal(productToForm(null).defaultTaxCode, "");
  assert.match(validateProductForm({ ...form, defaultTaxCode: "X".repeat(41) }) ?? "", /Tax code/);
  assert.equal(validateProductForm(form), null);
});

// ---------------------------------------------------------------- contact terms
test("a customer's payment terms are saved as whole days and other fields are kept", () => {
  const saved = contact({ remarks: "Pays on time", rating: 4, paymentTermDays: 14 });
  const form = contactToForm(saved);
  assert.equal(form.paymentTermDays, "14");
  const input = buildContactInput({ ...form, paymentTermDays: "30" }, saved.fields);
  assert.equal(input.fields?.paymentTermDays, 30);
  assert.equal(input.fields?.rating, 4);
  assert.equal("paymentTermDays" in (buildContactInput({ ...form, paymentTermDays: "" }, saved.fields).fields ?? {}), false);
  assert.equal("paymentTermDays" in (buildContactInput({ ...emptyContactForm("employee"), legalName: "Ali", paymentTermDays: "14" }).fields ?? {}), false);
});

test("payment terms on a contact must be a whole number of days from 0 to 365", () => {
  const problems = (paymentTermDays: string) => contactFormProblems({ legalName: "A", email: "", paymentTermDays });
  for (const good of ["", "0", "14", "365"]) assert.deepEqual(problems(good), []);
  for (const bad of ["-1", "366", "1.5", "two weeks"]) assert.match(problems(bad).join(" "), /0 to 365/);
});

// ---------------------------------------------------------------- copy lines
const typed = (id: string, over: Partial<TypedDocument> = {}): TypedDocument => ({
  id, source: "typed", type: "invoice", number: `IV-${id}`, currency: "MYR", subtotal: "0", taxAmount: "0", amount: "0", posts: true,
  posted: false, createdAt: "", updatedAt: "", status: "ready", lines: [{ description: "Simen", quantity: "2", unitPrice: "25.50" }],
  allocations: [], tags: [], fields: {}, ...over,
});

test("the last document to copy is the newest saved one with lines, not void and not this one", () => {
  const scanned = { id: "s", source: "scanned", status: "approved" } as unknown as ErpDocument;
  const items: ErpDocument[] = [scanned, typed("void", { status: "void" }), typed("empty", { lines: [] }), typed("self"), typed("older"), typed("oldest")];
  assert.equal(lastDocumentWithLines(items, "self")?.id, "older");
  assert.equal(lastDocumentWithLines(items)?.id, "self");
  assert.equal(lastDocumentWithLines([scanned, typed("void", { status: "void" })]), null);
  assert.equal(lastDocumentWithLines([]), null);
});

test("copied lines keep product, price, typed tax, tax label and account but nothing else", () => {
  const copied = copiedLines([
    { itemId: "p1", description: "Simen", quantity: "10", unitPrice: "25.5000", discount: "5.00", tax: "20.40", taxCode: "SV-8",
      accountId: "acc-4000", debit: "0", credit: "0" },
    { itemId: null, description: "Delivery", quantity: "1", unitPrice: "40", discount: "", tax: undefined, taxCode: null, accountId: null },
  ]);
  assert.deepEqual(copied, [
    { itemId: "p1", description: "Simen", quantity: "10", unitPrice: "25.5000", discount: "5.00", tax: "20.40", taxCode: "SV-8", accountId: "acc-4000" },
    { description: "Delivery", quantity: "1", unitPrice: "40" },
  ]);
});

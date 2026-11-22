import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContactInput, contactFormProblems, contactToForm, emptyContactForm, filterByTab, historyActionLabel,
  isValidEmail, kindLabel, relatedDocuments,
} from "../src/features/common/contacts/contact-logic";
import type { Contact } from "../src/lib/api/erp.service";

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: "c1", kind: "supplier", legalName: "Acme Sdn Bhd", code: "S001", registrationNumber: "201901000001",
  email: "ap@acme.my", phone: "082-123456", address: "1 Jalan Satok", city: "Kuching", state: "Sarawak", postcode: "93400",
  fields: { tin: "C1234567890", sstNumber: "W10-1808-31000001", remarks: "Pays late", bankName: "Maybank", rating: 4 },
  isActive: true, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z", ...over,
});

test("kind labels are plain words", () => {
  assert.equal(kindLabel("customer"), "Customer");
  assert.equal(kindLabel("supplier"), "Supplier");
  assert.equal(kindLabel("employee"), "Employee");
  assert.equal(kindLabel("something"), "Contact");
  assert.equal(kindLabel(undefined), "Contact");
});

test("tabs filter by kind, and All keeps everything", () => {
  const rows = [contact({ id: "a", kind: "customer" }), contact({ id: "b", kind: "supplier" }), contact({ id: "c", kind: "employee" })];
  assert.deepEqual(filterByTab(rows, "all").map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(filterByTab(rows, "customer").map((r) => r.id), ["a"]);
  assert.deepEqual(filterByTab(rows, "supplier").map((r) => r.id), ["b"]);
  assert.deepEqual(filterByTab(rows, "employee").map((r) => r.id), ["c"]);
});

test("history actions read as plain words", () => {
  assert.equal(historyActionLabel("contact.supplier_updated"), "Updated");
  assert.equal(historyActionLabel("contact.customer_created"), "Created");
  assert.equal(historyActionLabel("contact.deactivated"), "Deactivated");
  assert.equal(historyActionLabel("contact.employee_reactivated"), "Reactivated");
  assert.equal(historyActionLabel("contact.address_checked"), "Address checked");
  assert.equal(historyActionLabel(""), "Changed");
});

test("email check matches the backend: optional, needs @, no spaces", () => {
  assert.equal(isValidEmail(""), true);
  assert.equal(isValidEmail(null), true);
  assert.equal(isValidEmail("ap@acme.my"), true);
  assert.equal(isValidEmail("  ap@acme.my  "), true);
  assert.equal(isValidEmail("acme.my"), false);
  assert.equal(isValidEmail("ap @acme.my"), false);
});

test("form problems name the missing legal name and bad email", () => {
  assert.deepEqual(contactFormProblems({ legalName: "Acme", email: "" }), []);
  assert.equal(contactFormProblems({ legalName: "  ", email: "bad" }).length, 2);
});

test("a contact round-trips through the form and keeps unknown fields keys", () => {
  const original = contact();
  const input = buildContactInput(contactToForm(original), original.fields);
  assert.equal(input.kind, "supplier");
  assert.equal(input.legalName, "Acme Sdn Bhd");
  assert.equal(input.postcode, "93400");
  assert.deepEqual(input.fields, original.fields);
});

test("editing the form updates its own fields keys only", () => {
  const original = contact();
  const form = { ...contactToForm(original), tin: " C999 ", remarks: "", email: "", code: "  " };
  const input = buildContactInput(form, original.fields);
  assert.deepEqual(input.fields, { tin: "C999", sstNumber: "W10-1808-31000001", bankName: "Maybank", rating: 4 });
  assert.equal(input.email, null);
  assert.equal(input.code, null);
  assert.ok(!("remarks" in (input.fields ?? {})));
  // the caller's object is not changed
  assert.equal(original.fields.remarks, "Pays late");
});

test("a supplier default expense account can be set or cleared through the contact input", () => {
  const original = contact({
    defaultExpenseAccountId: "expense",
    defaultExpenseAccountCode: "6000",
    defaultExpenseAccountName: "Utilities",
  });
  const form = contactToForm(original);
  const input = buildContactInput(form, original.fields);
  assert.equal(form.defaultExpenseAccountId, "expense");
  assert.equal(input.defaultExpenseAccountId, "expense");
  assert.ok(!("defaultExpenseAccountCode" in input));
  assert.ok(!("defaultExpenseAccountName" in input));
  assert.equal(buildContactInput({ ...form, defaultExpenseAccountId: "" }).defaultExpenseAccountId, null);
  assert.ok(!("defaultExpenseAccountId" in buildContactInput({ ...form, defaultExpenseAccountId: undefined })));
  assert.ok(!("defaultExpenseAccountId" in buildContactInput({ ...form, kind: "customer" })));
});

test("a new contact form builds a minimal input", () => {
  const input = buildContactInput({ ...emptyContactForm("employee"), legalName: " Ali bin Abu " });
  assert.deepEqual(input, {
    kind: "employee", legalName: "Ali bin Abu", code: null, registrationNumber: null, email: null, phone: null,
    address: null, city: null, postcode: null, state: null, fields: {},
  });
});

test("related documents match the contact's side by name, ignoring case and spaces", () => {
  const docs = [
    { id: "1", supplier: "ACME SDN BHD ", customer: null },
    { id: "2", supplier: null, customer: "Acme Sdn Bhd" },
    { id: "3", supplier: "Other", customer: "Other" },
  ];
  assert.deepEqual(relatedDocuments(contact({ kind: "supplier" }), docs).map((d) => d.id), ["1"]);
  assert.deepEqual(relatedDocuments(contact({ kind: "customer" }), docs).map((d) => d.id), ["2"]);
  assert.deepEqual(relatedDocuments(contact({ kind: "employee" }), docs).map((d) => d.id), ["1", "2"]);
  assert.deepEqual(relatedDocuments(contact({ legalName: " " }), docs), []);
});

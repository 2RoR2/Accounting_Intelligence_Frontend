/**
 * Pure helpers for the one contact list (Plan L2): labels, tab filtering, history wording and
 * turning the contact form into the backend's ContactInput. No React, no network.
 */
import type { Contact, ContactInput, ContactKind } from "@/lib/api/erp.service";
import type { Document } from "@/types";

export const CONTACT_KINDS: readonly ContactKind[] = ["customer", "supplier", "employee"];

const KIND_LABELS: Record<ContactKind, string> = { customer: "Customer", supplier: "Supplier", employee: "Employee" };

export function kindLabel(kind: ContactKind | string | null | undefined): string {
  return kind && kind in KIND_LABELS ? KIND_LABELS[kind as ContactKind] : "Contact";
}

export type ContactTab = "all" | ContactKind;
export const CONTACT_TABS: readonly [label: string, tab: ContactTab][] = [
  ["All", "all"], ["Customers", "customer"], ["Suppliers", "supplier"], ["Employees", "employee"],
];

export function filterByTab<T extends Pick<Contact, "kind">>(contacts: readonly T[], tab: ContactTab): T[] {
  return tab === "all" ? [...contacts] : contacts.filter((contact) => contact.kind === tab);
}

const ACTION_WORDS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  deleted: "Deactivated",
  merged: "Merged",
  imported: "Imported",
};

/** "contact.supplier_updated" -> "Updated"; unknown actions are shown as readable words. */
export function historyActionLabel(action: string): string {
  const last = action.split(".").at(-1) ?? action;
  const words = last.split(/[_\s-]+/).filter(Boolean);
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const known = ACTION_WORDS[words[index].toLowerCase()];
    if (known) return known;
  }
  const text = words.join(" ").toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Changed";
}

/** Matches the backend rule: optional, but when given it contains "@" and no spaces. */
export function isValidEmail(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  return text === "" || (text.includes("@") && !/\s/.test(text));
}

export type ContactForm = {
  kind: ContactKind;
  legalName: string;
  code: string;
  registrationNumber: string;
  tin: string;
  sstNumber: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  state: string;
  remarks: string;
};

/** Keys of `fields` that the form edits; every other key is carried over untouched. */
export const FORM_FIELD_KEYS = ["tin", "sstNumber", "remarks"] as const;

export function emptyContactForm(kind: ContactKind = "customer"): ContactForm {
  return { kind, legalName: "", code: "", registrationNumber: "", tin: "", sstNumber: "", email: "", phone: "",
    address: "", city: "", postcode: "", state: "", remarks: "" };
}

const text = (value: unknown) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));

export function contactToForm(contact: Contact): ContactForm {
  const fields = contact.fields ?? {};
  return {
    kind: contact.kind,
    legalName: contact.legalName ?? "",
    code: text(contact.code),
    registrationNumber: text(contact.registrationNumber),
    tin: text(fields.tin),
    sstNumber: text(fields.sstNumber),
    email: text(contact.email),
    phone: text(contact.phone),
    address: text(contact.address),
    city: text(contact.city),
    postcode: text(contact.postcode),
    state: text(contact.state),
    remarks: text(fields.remarks),
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * The full ContactInput for create/update. Blank optional values become null; blank form-owned
 * `fields` keys are dropped, and any other keys already in `fields` are kept as they were.
 */
export function buildContactInput(form: ContactForm, existingFields: Record<string, unknown> = {}): ContactInput {
  const fields: Record<string, unknown> = { ...existingFields };
  for (const key of FORM_FIELD_KEYS) {
    const value = form[key].trim();
    if (value) fields[key] = value;
    else delete fields[key];
  }
  return {
    kind: form.kind,
    legalName: form.legalName.trim(),
    code: orNull(form.code),
    registrationNumber: orNull(form.registrationNumber),
    email: orNull(form.email),
    phone: orNull(form.phone),
    address: orNull(form.address),
    city: orNull(form.city),
    postcode: orNull(form.postcode),
    state: orNull(form.state),
    fields,
  };
}

/** Plain-language problems with the form, or an empty list when it can be sent. */
export function contactFormProblems(form: Pick<ContactForm, "legalName" | "email">): string[] {
  const problems: string[] = [];
  if (!form.legalName.trim()) problems.push("Enter the contact's legal name.");
  if (!isValidEmail(form.email)) problems.push("Enter a valid email address, or leave it blank.");
  return problems;
}

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/**
 * Documents whose supplier (for a supplier) or customer (for a customer) name matches the contact's
 * legal name. Employees are matched on either side, since their claims may be recorded under either.
 */
export function relatedDocuments<D extends Pick<Document, "supplier" | "customer">>(
  contact: Pick<Contact, "kind" | "legalName">, documents: readonly D[],
): D[] {
  const name = norm(contact.legalName);
  if (!name) return [];
  return documents.filter((doc) => {
    if (contact.kind === "supplier") return norm(doc.supplier) === name;
    if (contact.kind === "customer") return norm(doc.customer) === name;
    return norm(doc.supplier) === name || norm(doc.customer) === name;
  });
}

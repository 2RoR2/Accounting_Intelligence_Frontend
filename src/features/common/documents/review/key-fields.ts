/**
 * Review page rules added after the 24 Nov demo (accountant function audit): the key fields that always show,
 * the fields a reviewer may add when reading did not store them, the checks that block approval without naming
 * a field on screen, and a due date from payment terms. Pure functions, unit tested.
 */
import { addDays, MAX_PAYMENT_TERM_DAYS } from "@/features/common/erp/line-defaults";
import { typePendingCheck } from "@/lib/glossary";
import type { ValidationResult } from "@/types";

/** Always on screen when stored, even with "Only fields to check": an accountant checks these on every document. */
export const KEY_FIELDS = ["supplier", "customer", "invoice", "bill_number", "reference", "receipt_number", "date", "due",
  "payment_terms", "subtotal", "tax", "total"] as const;

export function keyFieldsPresent(fields: Record<string, unknown>): string[] {
  return KEY_FIELDS.filter((key) => Object.hasOwn(fields, key));
}

/** Fields a reviewer can add, by type (backend ADDABLE_FIELDS). Most useful first. */
const ADDABLE_BY_KIND: Record<string, string[]> = {
  INVOICE: ["due", "payment_terms", "purchase_order_number", "reference", "received_date", "discount", "payment_reference"],
  BILL: ["bill_number", "due", "payment_terms", "purchase_order_number", "received_date", "discount", "payment_reference"],
  RECEIPT: ["receipt_number", "payment_reference", "subtotal", "tax", "discount"],
  CREDIT_NOTE: ["reference", "invoice", "due", "payment_terms"],
  DEBIT_NOTE: ["reference", "invoice", "due", "payment_terms"],
};

/** Stored keys that already mean the same field (the backend refuses a second value for one field). */
const ALIASES: Record<string, string[]> = {
  due: ["due_date"], invoice: ["invoice_number"], reference: ["reference_number", "bill_reference"],
  bill_number: ["bill_reference"], receipt_number: ["receipt"], tax: ["tax_amount"], subtotal: ["total_excluding_tax"],
};

export const ADDED_FIELD_LABELS: Record<string, string> = {
  due: "Due date", payment_terms: "Payment terms", purchase_order_number: "Purchase order number",
  reference: "Reference / document number", received_date: "Received date", discount: "Discount",
  payment_reference: "Payment reference", bill_number: "Bill number", receipt_number: "Receipt number",
  invoice: "Invoice number", subtotal: "Subtotal", tax: "Tax",
};

export function addableFields(kind: string, storedKeys: Iterable<string>): string[] {
  const stored = new Set(storedKeys);
  return (ADDABLE_BY_KIND[kind] ?? []).filter((key) => !stored.has(key) && !(ALIASES[key] ?? []).some((alias) => stored.has(alias)));
}

const DATE_KEYS = new Set(["due", "received_date"]);
const MONEY_KEYS = new Set(["discount", "subtotal", "tax"]);

/** What the backend accepts for an added value, checked before sending; null when it is fine. */
export function addedValueProblem(key: string, value: string): string | null {
  const text = value.trim();
  if (!text) return "Type the value as printed on the document.";
  if (DATE_KEYS.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return "Use a date (YYYY-MM-DD).";
  if (MONEY_KEYS.has(key) && !/^-?\d+(\.\d+)?$/.test(text)) return "Type the amount as a number, without RM.";
  return null;
}

/**
 * Checks that block approval but light up no field: they name no field, name one that is not on screen, or are a
 * warning that still prevents approval (bug d: "Nothing to check" while two checks blocked approval).
 */
export function blockingChecks(results: readonly ValidationResult[], fieldShown: (field: string) => boolean): ValidationResult[] {
  return results.filter((item) => (item.result === "FAIL" || item.preventsApproval === true)
    && !typePendingCheck(item.rule) && (!item.field || !fieldShown(item.field)));
}

/** Blocking results that name a field: that field must say "Please check", whatever the reading said. */
export function blockingFields(results: readonly ValidationResult[]): string[] {
  return results.filter((item) => (item.result === "FAIL" || item.preventsApproval === true) && item.field
    && !typePendingCheck(item.rule)).map((item) => item.field as string);
}

/** Why the admin cannot approve right now, in plain words; empty when Approve may be pressed (bug b). */
export function approvalBlockers({ canDecide, ownSubmission, report, blocking }: {
  canDecide: boolean; ownSubmission: boolean; blocking: number;
  report: { validationStatus?: string | null; coverageComplete?: boolean | null } | null | undefined;
}): string[] {
  const reasons: string[] = [];
  if (ownSubmission) reasons.push("You submitted this document. Another local admin must approve it.");
  else if (!canDecide) reasons.push("This document is not waiting for your decision (refresh: it may have changed).");
  if (!report) reasons.push("The checks have not run on this version. Ask the accountant to run them and submit again.");
  else {
    if (blocking > 0) reasons.push(`${blocking} ${blocking === 1 ? "check blocks" : "checks block"} approval. See the Checks tab, then return it to the accountant.`);
    else if (report.validationStatus !== "PASS") reasons.push("The checks did not pass on this version.");
    if (report.coverageComplete === false) reasons.push("Some checks for this type could not run, so it cannot be approved yet.");
  }
  return reasons;
}

/** Days in printed payment terms: "NET 30", "30 days", "COD" (0). Null when the text names no period. */
export function termDaysFromText(text: string | null | undefined): number | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  if (/\b(cod|cash on delivery|due on receipt|immediate)\b/i.test(value)) return 0;
  const match = /(\d{1,3})\s*(?:days?|hari|d\b)|\bnet\s*(\d{1,3})\b|^(\d{1,3})$/i.exec(value);
  const days = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  return Number.isInteger(days) && days >= 0 && days <= MAX_PAYMENT_TERM_DAYS ? days : null;
}

export type DueSuggestion = { due: string; days: number; source: "printed terms" | "supplier terms" | "customer terms" };

/**
 * A due date the reviewer may accept (never applied by itself): from the printed terms, else the contact's terms.
 * Offered when no due date is stored, or when the stored one disagrees with the printed terms.
 */
export function dueSuggestion({ documentDate, due, printedTerms, contactDays, contactKind }: {
  documentDate?: string | null; due?: string | null; printedTerms?: string | null; contactDays?: number | null;
  contactKind: "supplier" | "customer";
}): DueSuggestion | null {
  if (!documentDate || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) return null;
  const printed = termDaysFromText(printedTerms);
  const days = printed ?? (contactDays ?? null);
  if (days === null) return null;
  const suggestion = addDays(documentDate, days);
  if (!suggestion || suggestion === due) return null;
  if (due && printed === null) return null; // a printed due date beats the contact's default
  return { due: suggestion, days, source: printed !== null ? "printed terms" : contactKind === "customer" ? "customer terms" : "supplier terms" };
}

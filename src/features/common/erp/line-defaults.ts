/**
 * P1 line defaults: pure rules that cut typing on typed sales and purchase documents (no React, no fetch), so they can be
 * tested with node:test. Choosing a product fills the line, choosing a contact fills payment terms and the due date, and the
 * last document for a contact can be copied. Everything filled stays editable.
 *
 * Tax is never calculated here: a tax code is a label and the tax amount is typed as shown on the document.
 */
import type { CatalogEntry, Contact, DocumentLine, ErpDocument, Product, TypedDocument } from "@/lib/api/erp.service";

export const MAX_PAYMENT_TERM_DAYS = 365;

// ---------------------------------------------------------------- dates and terms
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar days after an ISO date (YYYY-MM-DD), or "" when the date is not a real one. Uses UTC so no timezone shifts it. */
export function addDays(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match || !Number.isInteger(days)) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = new Date(Date.UTC(year, month - 1, day));
  // A date such as 2026-02-31 rolls into March when parsed; refuse it rather than invent a different day.
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return "";
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The payment terms a customer or supplier is on, as whole days (fields.paymentTermDays), or null when none are set. */
export function contactTermDays(contact?: Pick<Contact, "fields"> | null): number | null {
  const value = contact?.fields?.paymentTermDays;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PAYMENT_TERM_DAYS ? value : null;
}

/** Document date plus terms, or "" when either is missing. */
export function dueDateFor(documentDate: string, days: number | null): string {
  return days === null ? "" : addDays(documentDate, days);
}

/** The catalog name of terms with these days ("Net 30"), else a plain description. */
export function termLabel(days: number, terms: readonly Pick<CatalogEntry, "name" | "data" | "isActive">[]): string {
  const match = terms.find((term) => term.isActive && Number(term.data?.days) === days);
  if (match) return match.name;
  return days === 0 ? "Due on receipt" : `${days} days`;
}

/** The days of a catalog payment term, or null. */
export function catalogTermDays(term?: Pick<CatalogEntry, "data"> | null): number | null {
  const value = term?.data?.days;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PAYMENT_TERM_DAYS ? value : null;
}

/**
 * The terms and due date of a document being edited. `auto` is true while the due date follows the terms: it starts true on
 * a new document (and on one saved without a due date) and turns false the moment the user types or clears the due date.
 */
export type TermsState = { documentDate: string; dueDate: string; paymentTerms: string; termDays: number | null; auto: boolean };

/** A contact was chosen: its terms fill the payment terms and (while automatic) the due date. A contact without terms changes nothing. */
export function chooseContactTerms(
  state: TermsState, contact: Pick<Contact, "fields"> | undefined, terms: readonly CatalogEntry[],
): TermsState {
  const days = contactTermDays(contact);
  if (days === null || !state.auto) return state;
  return { ...state, termDays: days, paymentTerms: termLabel(days, terms), dueDate: dueDateFor(state.documentDate, days) };
}

/** The document date changed: the due date follows it until the user has set the due date by hand. */
export function changeDocumentDate(state: TermsState, documentDate: string): TermsState {
  const next = { ...state, documentDate };
  return state.auto && state.termDays !== null ? { ...next, dueDate: dueDateFor(documentDate, state.termDays) } : next;
}

/** The user typed (or cleared) the due date: it no longer follows the terms. */
export function editDueDate(state: TermsState, dueDate: string): TermsState {
  return { ...state, dueDate, auto: false };
}

/** The user picked payment terms by hand: the due date follows them again. Choosing "none" clears the terms only. */
export function chooseTerms(state: TermsState, term: Pick<CatalogEntry, "name" | "data"> | null): TermsState {
  if (!term) return { ...state, paymentTerms: "", termDays: null };
  const days = catalogTermDays(term);
  if (days === null) return { ...state, paymentTerms: term.name, termDays: null };
  return { ...state, paymentTerms: term.name, termDays: days, dueDate: dueDateFor(state.documentDate, days), auto: true };
}

// ---------------------------------------------------------------- products
/**
 * What choosing a product puts on a line: its name, the price for this side (sale price on sales, purchase price on
 * purchases), its default account and its default tax-code label. A default the product does not have leaves the
 * line's current value alone. The quantity, discount and the typed tax amount are never touched.
 */
export function lineFromProduct(product: Product, sales: boolean): Partial<DocumentLine> {
  const account = sales ? product.incomeAccountId : product.expenseAccountId;
  return {
    itemId: product.id,
    description: product.name,
    unitPrice: sales ? product.salePrice : product.purchasePrice,
    ...(account ? { accountId: account } : {}),
    ...(product.defaultTaxCode ? { taxCode: product.defaultTaxCode } : {}),
  };
}

// ---------------------------------------------------------------- tax codes
export type SelectChoice = { id: string; label: string };

/** Active tax codes as dropdown choices (value = the label printed on the line). */
export function taxCodeChoices(entries: readonly CatalogEntry[]): SelectChoice[] {
  return entries.filter((entry) => entry.isActive && entry.code).map((entry) => {
    const code = entry.code as string;
    return { id: code, label: entry.name && entry.name !== code ? `${code} · ${entry.name}` : code };
  });
}

// ---------------------------------------------------------------- copy lines from the last document
/** The most recent saved document of the same type for the contact that has lines: not void, not the one being edited. */
export function lastDocumentWithLines(items: readonly ErpDocument[], currentId?: string | null): TypedDocument | null {
  for (const item of items) {
    if (item.source !== "typed" || item.id === currentId || item.status === "void" || !item.lines?.length) continue;
    return item;
  }
  return null;
}

/** Lines ready to add to another document: same product, description, quantity, price, discount, tax label, typed tax and account. */
export function copiedLines(lines: readonly DocumentLine[]): DocumentLine[] {
  return lines.map(({ itemId, description, quantity, unitPrice, discount, tax, taxCode, accountId }) => ({
    ...(itemId ? { itemId } : {}), description, quantity, unitPrice,
    ...(discount ? { discount } : {}), ...(tax ? { tax } : {}), ...(taxCode ? { taxCode } : {}), ...(accountId ? { accountId } : {}),
  }));
}

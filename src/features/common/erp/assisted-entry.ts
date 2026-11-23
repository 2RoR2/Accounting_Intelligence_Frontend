/**
 * Assisted entry for typed sales and purchase documents: pure rules (no React, no fetch) behind the "type or pick"
 * fields, so they can be tested with node:test.
 *
 * - filterOptions: what a combobox shows for what was typed (code, name, SKU, TIN ... all match).
 * - *Options: how contacts, products, accounts, bank accounts, tax codes and terms read in a combobox.
 * - contactSummary / contactCurrency: what choosing a customer or supplier fills or shows in the header.
 * - recentLines / descriptionOptions / lineFromSuggestion: the description typeahead (catalog items and this contact's
 *   recent lines) and what picking one puts on the line.
 * - lineAmount / lineSums: live sums only. Tax is never calculated: the tax amount stays as typed.
 */
import {
  AMOUNT_ONLY_TYPES, type CatalogEntry, type Contact, type DocumentLine, type DocumentType, type ErpDocument, type Product,
} from "@/lib/api/erp.service";
import type { LedgerAccount } from "@/lib/api/ledger.service";
import { amountInCents, decimalAmount, documentTotals } from "./document-logic";
import { lineFromProduct } from "./line-defaults";

// ---------------------------------------------------------------- filtering
export type ComboOption = {
  id: string;
  label: string;
  /** A second, smaller line: SKU and price, TIN, account type ... */
  detail?: string;
  /** Extra text that matches but is not shown as the label (codes, SKU, TIN, registration number). */
  keywords?: readonly (string | null | undefined)[];
};

/** Lower case, accents removed, runs of spaces collapsed. */
export function normalize(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const words = (value: string) => value.split(/[\s·.,/()\-_:]+/).filter(Boolean);

/**
 * The options matching what was typed, best first. Every typed word must appear somewhere in the label, detail or
 * keywords. Ranking: an exact code/label, then a label or code that starts with the text, then a word that starts with
 * it, then anything containing it. Ties keep the original order. An empty query returns the options as given.
 */
export function filterOptions<T extends ComboOption>(options: readonly T[], query: string, limit = 50): T[] {
  const typed = normalize(query);
  if (!typed) return options.slice(0, limit);
  const tokens = typed.split(" ");
  const ranked: { option: T; score: number; index: number }[] = [];
  options.forEach((option, index) => {
    const label = normalize(option.label);
    const keys = (option.keywords ?? []).map(normalize).filter(Boolean);
    const haystack = [label, normalize(option.detail), ...keys].join(" \u0000 ");
    if (!tokens.every((token) => haystack.includes(token))) return;
    let score = 3;
    if (label === typed || keys.includes(typed)) score = 0;
    else if (label.startsWith(typed) || keys.some((key) => key.startsWith(typed))) score = 1;
    else if ([label, ...keys].some((value) => words(value).some((word) => word.startsWith(tokens[0])))) score = 2;
    ranked.push({ option, score, index });
  });
  return ranked.sort((a, b) => a.score - b.score || a.index - b.index).slice(0, limit).map(({ option }) => option);
}

/** The option whose label is exactly what was typed (ignoring case and spacing), if any. */
export function exactOption<T extends ComboOption>(options: readonly T[], query: string): T | undefined {
  const typed = normalize(query);
  return typed ? options.find((option) => normalize(option.label) === typed) : undefined;
}

// ---------------------------------------------------------------- how things read in a combobox
const text = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const joined = (parts: readonly (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

/** "1,234.50" for a decimal string. */
export function formatAmount(value: string | null | undefined): string {
  const [whole, fraction] = decimalAmount(amountInCents(value || "0")).split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  return `${sign}${whole.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

export function contactOptions(contacts: readonly Contact[]): ComboOption[] {
  return contacts.filter((contact) => contact.isActive !== false).map((contact) => {
    const tin = text(contact.fields?.tin);
    return {
      id: contact.id,
      label: contact.legalName,
      detail: joined([contact.code, tin && `TIN ${tin}`, contact.registrationNumber && `SSM ${contact.registrationNumber}`, contact.city]),
      keywords: [contact.code, contact.registrationNumber, tin, text(contact.fields?.sstNumber), contact.email, contact.phone],
    };
  });
}

/** Products with the price for this side: the sale price on sales documents, the purchase price on purchases. */
export function productOptions(products: readonly Product[], sales: boolean, currency = "MYR"): ComboOption[] {
  return products.filter((product) => product.isActive !== false).map((product) => ({
    id: product.id,
    label: product.name,
    detail: joined([product.sku, `${currency} ${formatAmount(sales ? product.salePrice : product.purchasePrice)}`,
      product.defaultTaxCode && `Tax ${product.defaultTaxCode}`]),
    keywords: [product.sku, product.groupName],
  }));
}

export function accountOptions(accounts: readonly LedgerAccount[]): ComboOption[] {
  return accounts.map(({ id, code, name, accountType }) => ({
    id, label: `${code} · ${name}`, detail: accountType ? accountType.replace(/_/g, " ") : undefined, keywords: [code],
  }));
}

export function bankOptions(entries: readonly CatalogEntry[]): ComboOption[] {
  return entries.filter((entry) => entry.isActive).map((entry) => ({
    id: entry.id,
    label: entry.name,
    detail: joined([entry.code, text(entry.data?.bankName), text(entry.data?.accountNumber),
      entry.ledgerAccountCode && `Ledger ${entry.ledgerAccountCode}`]) || undefined,
    keywords: [entry.code, text(entry.data?.accountNumber), text(entry.data?.bankName)],
  }));
}

/** Active tax codes; the id is the code, which is the label printed on the line. */
export function taxOptions(entries: readonly CatalogEntry[]): ComboOption[] {
  return entries.filter((entry) => entry.isActive && entry.code).map((entry) => ({
    id: entry.code as string,
    label: entry.code as string,
    detail: entry.name && entry.name !== entry.code ? entry.name : undefined,
    keywords: [entry.name, entry.description],
  }));
}

/** Active payment terms; the id is the name, which is what the document stores and prints. */
export function termOptions(entries: readonly CatalogEntry[]): ComboOption[] {
  return entries.filter((entry) => entry.isActive).map((entry) => {
    const days = entry.data?.days;
    return {
      id: entry.name, label: entry.name,
      detail: typeof days === "number" ? (days === 0 ? "Due on receipt" : `${days} days`) : undefined,
      keywords: [entry.code],
    };
  });
}

// ---------------------------------------------------------------- header fill from the contact
export type ContactSummary = {
  address: string; registrationNumber: string; tin: string; sstNumber: string; email: string; phone: string;
};

/** What prints in the "Bill to" / supplier box for this contact (the PDF reads it from the contact record). */
export function contactSummary(contact: Contact | undefined | null): ContactSummary | null {
  if (!contact) return null;
  const place = [contact.postcode, contact.city].map(text).filter(Boolean).join(" ");
  const address = [text(contact.address), place, text(contact.state)].filter(Boolean).join(", ");
  return {
    address, registrationNumber: text(contact.registrationNumber), tin: text(contact.fields?.tin),
    sstNumber: text(contact.fields?.sstNumber), email: text(contact.email), phone: text(contact.phone),
  };
}

/** A three-letter currency the contact is billed in (fields.currency), or null when it has none. */
export function contactCurrency(contact: Pick<Contact, "fields"> | undefined | null): string | null {
  const value = text(contact?.fields?.currency).toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : null;
}

// ---------------------------------------------------------------- description typeahead
export type RecentLine = { line: DocumentLine; number: string; documentDate: string | null };

/**
 * Distinct line descriptions from this contact's earlier typed documents, newest document first (as listed), skipping
 * void documents and the one being edited. The first (newest) use of a description wins.
 */
export function recentLines(documents: readonly ErpDocument[], currentId?: string | null, limit = 30): RecentLine[] {
  const seen = new Set<string>();
  const rows: RecentLine[] = [];
  for (const document of documents) {
    if (document.source !== "typed" || document.status === "void" || document.id === currentId) continue;
    for (const line of document.lines ?? []) {
      const key = normalize(line.description);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({ line, number: document.number, documentDate: document.documentDate ?? null });
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

export type Suggestion = ComboOption & ({ source: "recent"; recent: RecentLine } | { source: "catalog"; product: Product });

/** The contact's recent lines first (what this customer or supplier usually buys), then catalog items. */
export function descriptionOptions(
  products: readonly Product[], recent: readonly RecentLine[], sales: boolean, currency = "MYR",
): Suggestion[] {
  const recentRows: Suggestion[] = recent.map((row, index) => ({
    id: `recent:${index}`, label: row.line.description, source: "recent", recent: row,
    detail: joined([`Used on ${row.number}`, `${currency} ${formatAmount(row.line.unitPrice)}`, row.line.taxCode && `Tax ${row.line.taxCode}`]),
  }));
  const products_ = products.filter((product) => product.isActive !== false);
  const catalogRows: Suggestion[] = productOptions(products_, sales, currency).map((option, index) => ({
    ...option, id: `catalog:${option.id}`, detail: joined(["Catalog", option.detail]), source: "catalog", product: products_[index],
  }));
  return [...recentRows, ...catalogRows];
}

/** "85.0000" (as the API stores prices) -> "85.00"; decimals that matter are kept ("1.2345", "3.10"). */
export function tidyDecimal(value: string): string {
  const match = /^(-?\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match) return value;
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return `${match[1]}.${fraction.padEnd(2, "0")}`;
}

/** Choosing a product (lineFromProduct) with its price written the way it is typed. */
export function productLine(product: Product, sales: boolean): Partial<DocumentLine> {
  const fill = lineFromProduct(product, sales);
  return fill.unitPrice ? { ...fill, unitPrice: tidyDecimal(fill.unitPrice) } : fill;
}

/**
 * What picking a suggestion puts on the line. A catalog item fills like choosing the product; a recent line fills its
 * description, unit price, product, tax-code label and account. Quantity, discount and the typed tax amount are kept.
 */
export function lineFromSuggestion(suggestion: Suggestion, sales: boolean): Partial<DocumentLine> {
  if (suggestion.source === "catalog") return productLine(suggestion.product, sales);
  const { itemId, description, unitPrice, taxCode, accountId } = suggestion.recent.line;
  return {
    description, unitPrice: tidyDecimal(unitPrice), itemId: itemId ?? null,
    ...(taxCode ? { taxCode } : {}), ...(accountId ? { accountId } : {}),
  };
}

// ---------------------------------------------------------------- lines and sums
export function blankLine(): DocumentLine {
  return { description: "", quantity: "1", unitPrice: "0" };
}

/** A line nobody filled in (as added): dropped on save, so an empty last line never blocks saving. */
export function isBlankLine(line: DocumentLine): boolean {
  return !line.itemId && !line.description.trim() && !line.accountId && !line.taxCode
    && amountInCents(line.unitPrice || "0") === 0n && amountInCents(line.discount || "0") === 0n
    && amountInCents(line.tax || "0") === 0n;
}

/** Quantity x unit price - discount for one line, to the cent (the same rounding the document totals use). */
export function lineAmount(line: DocumentLine): string {
  return documentTotals("invoice", [line]).subtotal;
}

export type LineSums = { gross: string; discount: string; subtotal: string; tax: string; total: string };

/**
 * Document sums from the lines: gross (quantity x price), discount, subtotal (after discount), tax (the typed amounts
 * added up, never calculated) and total. Amount-only types use the typed amount.
 */
export function lineSums(type: DocumentType, lines: readonly DocumentLine[], amount = "0"): LineSums {
  const totals = documentTotals(type, lines, amount);
  const discount = AMOUNT_ONLY_TYPES.has(type) ? 0n : lines.reduce((sum, line) => sum + amountInCents(line.discount || "0"), 0n);
  return {
    gross: decimalAmount(amountInCents(totals.subtotal) + discount), discount: decimalAmount(discount),
    subtotal: totals.subtotal, tax: totals.tax, total: totals.total,
  };
}

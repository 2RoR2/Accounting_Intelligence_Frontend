/**
 * Plan L3: pure rules for the catalog, products and posting-accounts pages (no React, no fetch), so they
 * can be tested with node:test. Validation mirrors the backend's /api/erp/catalog rules so most mistakes
 * are caught before a request; the backend stays the authority and its message is shown when it refuses.
 */
import {
  DOCUMENT_LABELS, VISIBLE_CATALOG_KINDS,
  type CatalogEntry, type CatalogInput, type DocumentType, type PostingPurpose, type Product, type ProductInput,
  type ProductKind,
} from "@/lib/api/erp.service";
import type { LedgerAccount } from "@/lib/api/ledger.service";

// ---------------------------------------------------------------- tabs
export type VisibleCatalogKind = (typeof VISIBLE_CATALOG_KINDS)[number];
export type CatalogTab = VisibleCatalogKind | "products" | "posting-accounts";

export const CATALOG_LABELS: Record<CatalogTab, string> = {
  "payment-term": "Payment terms", "payment-method": "Payment methods", "tax-code": "Tax codes", currency: "Currencies",
  "bank-account": "Bank accounts", tag: "Tags", category: "Categories", location: "Locations",
  "custom-field": "Custom fields", "number-format": "Number formats", products: "Products & services",
  "posting-accounts": "Posting accounts",
};
/** One entry's name in a sentence, e.g. "New payment term". */
export const CATALOG_SINGULAR: Record<VisibleCatalogKind, string> = {
  "payment-term": "payment term", "payment-method": "payment method", "tax-code": "tax code", currency: "currency",
  "bank-account": "bank account", tag: "tag", category: "category", location: "location",
  "custom-field": "custom field", "number-format": "number format",
};
export const CATALOG_TABS: CatalogTab[] = [...VISIBLE_CATALOG_KINDS, "products", "posting-accounts"];
export const DEFAULT_CATALOG_TAB: CatalogTab = "payment-term";

export const isCatalogKind = (value: string): value is VisibleCatalogKind =>
  (VISIBLE_CATALOG_KINDS as readonly string[]).includes(value);
/** The `?kind=` value, or the default tab when it is missing or unknown. */
export const parseCatalogTab = (value: string | null | undefined): CatalogTab =>
  value && (CATALOG_TABS as string[]).includes(value) ? (value as CatalogTab) : DEFAULT_CATALOG_TAB;

export const isCompanyAdmin = (role: string | null | undefined) => role === "LOCAL_ADMIN";
/** Tags and custom fields have no active flag on the backend: removing one deletes it. */
export const removesPermanently = (kind: VisibleCatalogKind) => kind === "tag" || kind === "custom-field";

/** The backend's plain-language message (an ApiError is an Error), or a fallback. */
export const errorMessage = (error: unknown, fallback = "Something went wrong. Please try again.") =>
  error instanceof Error && error.message ? error.message : fallback;

// ---------------------------------------------------------------- catalog forms
export const PAYMENT_METHOD_TYPES = ["cash", "bank_transfer", "cheque", "card", "ewallet", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHOD_TYPES)[number], string> = {
  cash: "Cash", bank_transfer: "Bank transfer", cheque: "Cheque", card: "Card", ewallet: "E-wallet", other: "Other",
};
export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;
export const CUSTOM_FIELD_LABELS: Record<(typeof CUSTOM_FIELD_TYPES)[number], string> = {
  text: "Text", number: "Number", date: "Date", boolean: "Yes / no", select: "Choice list",
};
export const DEFAULT_TAG_COLOR = "#64748b";
export const COMPANY_CURRENCY = "MYR";

/** Every input any kind's form uses, as typed text (booleans aside); `extra` holds the entry's original data. */
export type CatalogForm = {
  name: string; code: string; description: string; active: boolean; ledgerAccountId: string;
  days: string; type: string; symbol: string; rate: string; rateDate: string; accountNumber: string; bankName: string;
  color: string; fieldType: string; options: string; required: boolean; documentType: string; prefix: string; padding: string;
  extra: Record<string, unknown>;
};

/** The `data` keys each kind's form edits; any other keys in an entry's data are kept unchanged on save. */
const DATA_KEYS: Record<VisibleCatalogKind, string[]> = {
  "payment-term": ["days"], "payment-method": ["type"], "tax-code": [], currency: ["symbol", "rate", "rateDate"],
  "bank-account": ["accountNumber", "bankName"], tag: ["color"], category: [], location: [],
  "custom-field": ["fieldType", "options", "required"], "number-format": ["documentType", "prefix", "padding"],
};

const text = (value: unknown) => (value === undefined || value === null ? "" : String(value));

export function entryToForm(kind: VisibleCatalogKind, entry?: CatalogEntry | null): CatalogForm {
  const data = entry?.data ?? {};
  const options = Array.isArray(data.options) ? data.options.map(String).join(", ") : "";
  return {
    name: entry?.name ?? "", code: entry?.code ?? "", description: entry?.description ?? "", active: entry?.isActive ?? true,
    ledgerAccountId: entry?.ledgerAccountId ?? "",
    days: entry ? text(data.days) : kind === "payment-term" ? "30" : "",
    type: text(data.type) || (kind === "payment-method" ? "bank_transfer" : ""),
    symbol: text(data.symbol), rate: text(data.rate), rateDate: text(data.rateDate),
    accountNumber: text(data.accountNumber), bankName: text(data.bankName),
    color: text(data.color) || DEFAULT_TAG_COLOR,
    fieldType: text(data.fieldType) || "text", options, required: data.required === true,
    documentType: text(data.documentType) || (kind === "number-format" ? "invoice" : ""),
    prefix: text(data.prefix), padding: entry ? text(data.padding) : kind === "number-format" ? "5" : "",
    extra: { ...data },
  };
}

/** "a, b ,, c" -> ["a", "b", "c"] (blank items dropped, duplicates removed). */
export const parseOptions = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

const optional = (value: string) => (value.trim() ? value.trim() : null);

/** The request body for a kind's form. Unknown data keys from the original entry are kept. */
export function formToInput(kind: VisibleCatalogKind, form: CatalogForm): CatalogInput {
  const data: Record<string, unknown> = { ...form.extra };
  for (const key of DATA_KEYS[kind]) delete data[key];
  const set = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") data[key] = value;
  };
  let code = optional(form.code);
  let description = optional(form.description);
  switch (kind) {
    case "payment-term": set("days", Number(form.days.trim())); break;
    case "payment-method": set("type", form.type); break;
    case "currency":
      code = form.code.trim().toUpperCase() || null;
      set("symbol", form.symbol.trim()); set("rate", form.rate.trim()); set("rateDate", form.rate.trim() ? form.rateDate.trim() : "");
      break;
    case "bank-account": set("accountNumber", form.accountNumber.trim()); set("bankName", form.bankName.trim()); break;
    case "tag": code = null; description = null; set("color", form.color || DEFAULT_TAG_COLOR); break;
    case "custom-field":
      code = form.code.trim() || null; description = null;
      data.fieldType = form.fieldType;
      data.options = form.fieldType === "select" ? parseOptions(form.options) : [];
      data.required = form.required;
      break;
    case "number-format":
      set("documentType", form.documentType); set("prefix", form.prefix.trim().toUpperCase()); set("padding", Number(form.padding.trim()));
      break;
  }
  return {
    name: form.name.trim(), code, description, active: form.active, data,
    ledgerAccountId: kind === "bank-account" ? optional(form.ledgerAccountId) : null,
  };
}

const INTEGER = /^\d+$/;
const RATE = /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const CURRENCY_CODE = /^[A-Z]{3}$/;
export const CUSTOM_FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;
export const NUMBER_PREFIX = /^[A-Z0-9-]{1,10}$/;

const isIsoDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const integerIn = (value: string, min: number, max: number) =>
  INTEGER.test(value.trim()) && Number(value) >= min && Number(value) <= max;

export const TAX_CODE_MAX_LENGTH = 40;

/** The first problem with a form, in plain words, or null when it can be saved. */
export function validateCatalogForm(kind: VisibleCatalogKind, form: CatalogForm): string | null {
  if (!form.name.trim()) return kind === "custom-field" ? "Enter a label." : kind === "tax-code" ? "Enter a description." : "Enter a name.";
  switch (kind) {
    case "tax-code":
      if (!form.code.trim() || form.code.trim().length > TAX_CODE_MAX_LENGTH)
        return `Enter the tax code, 1 to ${TAX_CODE_MAX_LENGTH} characters, for example SST-10 or SV-8.`;
      break;
    case "payment-term":
      if (!integerIn(form.days, 0, 365)) return "Days must be a whole number from 0 to 365.";
      break;
    case "payment-method":
      if (!(PAYMENT_METHOD_TYPES as readonly string[]).includes(form.type)) return "Choose a payment method type.";
      break;
    case "currency": {
      const code = form.code.trim().toUpperCase();
      if (!CURRENCY_CODE.test(code)) return "Currency code must be three letters, for example USD.";
      const rate = form.rate.trim();
      if (rate) {
        if (!RATE.test(rate) || Number(rate) <= 0) return "Rate must be a positive number with up to six decimal places.";
        if (code === COMPANY_CURRENCY && Number(rate) !== 1) return "The MYR rate must be 1.";
        if (!form.rateDate.trim()) return "Enter the date of the rate.";
        if (!isIsoDate(form.rateDate.trim())) return "Rate date must be a valid date.";
      }
      break;
    }
    case "bank-account":
      if (!form.ledgerAccountId) return "Choose the ledger account for this bank account.";
      break;
    case "tag":
      if (!/^#[0-9a-f]{6}$/i.test(form.color)) return "Choose a colour.";
      break;
    case "custom-field":
      if (!CUSTOM_FIELD_KEY.test(form.code.trim()))
        return "Key must start with a lower-case letter and use only lower-case letters, digits and underscores (up to 40).";
      if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(form.fieldType)) return "Choose a field type.";
      if (form.fieldType === "select" && !parseOptions(form.options).length) return "Enter at least one option, separated by commas.";
      break;
    case "number-format":
      if (!(form.documentType in DOCUMENT_LABELS)) return "Choose a document type.";
      if (!NUMBER_PREFIX.test(form.prefix.trim().toUpperCase()))
        return "Prefix must be 1 to 10 capital letters, digits or hyphens.";
      if (!integerIn(form.padding, 3, 8)) return "Padding must be a whole number from 3 to 8.";
      break;
  }
  return null;
}

/** The first number a format produces, e.g. ("IV-", 5) -> "IV-00001"; "" when the inputs are not usable yet. */
export function numberPreview(prefix: string, padding: string | number): string {
  const width = Number(padding);
  if (!Number.isInteger(width) || width < 3 || width > 8) return "";
  return `${prefix.trim().toUpperCase()}${"1".padStart(width, "0")}`;
}

export const documentTypeLabel = (value: unknown) =>
  typeof value === "string" && value in DOCUMENT_LABELS ? DOCUMENT_LABELS[value as DocumentType] : text(value) || "—";

// ---------------------------------------------------------------- products
export const PRODUCT_KINDS: ProductKind[] = ["inventory", "non-inventory", "service", "bundle"];
export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  inventory: "Stock item", "non-inventory": "Non-stock item", service: "Service", bundle: "Bundle",
};

export type ProductForm = {
  name: string; sku: string; kind: ProductKind; unit: string; salePrice: string; purchasePrice: string;
  incomeAccountId: string; expenseAccountId: string; defaultTaxCode: string;
  /** Kept from the product being edited so a save does not clear them. */
  keep: Pick<ProductInput, "quantity" | "groupName" | "fields">;
};

export function productToForm(product?: Product | null): ProductForm {
  return {
    name: product?.name ?? "", sku: product?.sku ?? "", kind: product?.kind ?? "service", unit: product?.unit ?? "unit",
    salePrice: product?.salePrice ?? "0.00", purchasePrice: product?.purchasePrice ?? "0.00",
    incomeAccountId: product?.incomeAccountId ?? "", expenseAccountId: product?.expenseAccountId ?? "",
    defaultTaxCode: product?.defaultTaxCode ?? "",
    keep: product ? { quantity: product.quantity, groupName: product.groupName ?? null, fields: product.fields ?? {} } : {},
  };
}

export function formToProductInput(form: ProductForm): ProductInput {
  return {
    ...form.keep,
    name: form.name.trim(), sku: optional(form.sku), kind: form.kind, unit: form.unit.trim(),
    salePrice: form.salePrice.trim() || "0", purchasePrice: form.purchasePrice.trim() || "0",
    incomeAccountId: form.incomeAccountId || null, expenseAccountId: form.expenseAccountId || null,
    defaultTaxCode: optional(form.defaultTaxCode),
  };
}

const PRICE = /^(?:\d{1,14}(?:\.\d{1,4})?|\.\d{1,4})$/;

export function validateProductForm(form: ProductForm): string | null {
  if (!form.name.trim()) return "Enter a name.";
  if (!PRODUCT_KINDS.includes(form.kind)) return "Choose a kind.";
  if (!form.unit.trim()) return "Enter a unit, for example unit, hour or kg.";
  if (form.unit.trim().length > 40) return "Unit must be at most 40 characters.";
  if (form.sku.trim().length > 120) return "SKU must be at most 120 characters.";
  if (form.defaultTaxCode.trim().length > TAX_CODE_MAX_LENGTH) return `Tax code must be at most ${TAX_CODE_MAX_LENGTH} characters.`;
  for (const [label, value] of [["Sale price", form.salePrice], ["Purchase price", form.purchasePrice]] as const) {
    if (value.trim() && !PRICE.test(value.trim())) return `${label} must be zero or more, with up to four decimal places.`;
  }
  return null;
}

// ---------------------------------------------------------------- ledger accounts and posting purposes
export type LedgerAccountType = "asset" | "liability" | "equity" | "income" | "expense";

export const accountsOfType = (accounts: LedgerAccount[], type: LedgerAccountType) =>
  accounts.filter((account) => account.accountType === type).sort((a, b) => a.code.localeCompare(b.code));

export const POSTING_PURPOSES: { purpose: PostingPurpose; label: string; accountType: LedgerAccountType }[] = [
  { purpose: "receivable", label: "Trade receivables", accountType: "asset" },
  { purpose: "revenue", label: "Sales", accountType: "income" },
  { purpose: "tax_output", label: "SST output tax", accountType: "liability" },
  { purpose: "payable", label: "Trade payables", accountType: "liability" },
  { purpose: "expense", label: "Purchases", accountType: "expense" },
  { purpose: "tax_input", label: "SST input tax", accountType: "asset" },
  { purpose: "bank", label: "Default bank account", accountType: "asset" },
];

export const purposeAccountType = (purpose: PostingPurpose): LedgerAccountType =>
  POSTING_PURPOSES.find((item) => item.purpose === purpose)?.accountType ?? "asset";
export const purposeLabel = (purpose: PostingPurpose) =>
  POSTING_PURPOSES.find((item) => item.purpose === purpose)?.label ?? purpose;

/** The ledger accounts a posting purpose may use. */
export const accountsForPurpose = (accounts: LedgerAccount[], purpose: PostingPurpose) =>
  accountsOfType(accounts, purposeAccountType(purpose));

/** Only the purposes whose chosen account differs from the saved one (blank choices are left out). */
export function changedPostingAccounts(
  saved: { purpose: PostingPurpose; accountId: string | null }[],
  chosen: Partial<Record<PostingPurpose, string>>,
): Partial<Record<PostingPurpose, string>> {
  const result: Partial<Record<PostingPurpose, string>> = {};
  for (const row of saved) {
    const next = chosen[row.purpose];
    if (next && next !== (row.accountId ?? "")) result[row.purpose] = next;
  }
  return result;
}

export const accountLabel = (account: Pick<LedgerAccount, "code" | "name">) => `${account.code} · ${account.name}`;

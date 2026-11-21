/**
 * Plan L: the sales/purchases module ("ERP" in latest_update) on the backend's /api/erp routes.
 * One contact list (suppliers = the vendors the scanner matches, customers, employees), products and
 * catalog lists, and documents that post to the ledger when they become ready.
 */
import { api, get } from "@/lib/api/client";

const q = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const seg = encodeURIComponent;

// ---------------------------------------------------------------- contacts (L2)
export type ContactKind = "customer" | "supplier" | "employee";
export type Contact = {
  id: string; kind: ContactKind; legalName: string; code?: string | null; registrationNumber?: string | null;
  email?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null;
  postcode?: string | null; fields: Record<string, unknown>; isActive: boolean; createdAt: string; updatedAt: string;
};
export type ContactInput = Omit<Contact, "id" | "isActive" | "createdAt" | "updatedAt" | "fields"> & { fields?: Record<string, unknown> };
export type ContactEvent = { action: string; by: string; at: string };

export const listContacts = (params: { kind?: ContactKind; search?: string; includeInactive?: boolean } = {}) =>
  get<Contact[]>(`/api/erp/contacts${q(params)}`);
export const getContact = (id: string) => get<Contact>(`/api/erp/contacts/${seg(id)}`);
export const createContact = (input: ContactInput) => api<Contact>("/api/erp/contacts", json("POST", input));
export const updateContact = (id: string, input: ContactInput) => api<Contact>(`/api/erp/contacts/${seg(id)}`, json("PUT", input));
export const deactivateContact = (id: string) => api<{ id: string; isActive: false }>(`/api/erp/contacts/${seg(id)}`, json("DELETE"));
export const reactivateContact = (id: string) => api<{ id: string; isActive: true }>(`/api/erp/contacts/${seg(id)}/reactivate`, json("POST"));
export const contactHistory = (id: string) => get<ContactEvent[]>(`/api/erp/contacts/${seg(id)}/history`);

// ---------------------------------------------------------------- products and catalog (L3)
export type ProductKind = "inventory" | "non-inventory" | "service" | "bundle";
export type Product = {
  id: string; name: string; sku?: string | null; kind: ProductKind; unit: string; salePrice: string; purchasePrice: string;
  quantity: string; groupName?: string | null; incomeAccountId?: string | null; expenseAccountId?: string | null;
  fields: Record<string, unknown>; isActive: boolean; createdAt: string; updatedAt: string;
};
export type ProductInput = {
  name: string; sku?: string | null; kind: ProductKind; unit: string; salePrice: string; purchasePrice: string;
  quantity?: string; groupName?: string | null; incomeAccountId?: string | null; expenseAccountId?: string | null;
  fields?: Record<string, unknown>;
};
/** Kinds the menu shows; the API also keeps the other latest_update kinds (coupons, price levels, ...). */
export const VISIBLE_CATALOG_KINDS = ["payment-term", "payment-method", "currency", "bank-account", "tag", "category",
  "location", "custom-field", "number-format"] as const;
export type CatalogKind = (typeof VISIBLE_CATALOG_KINDS)[number] | "product-group" | "coupon" | "content-page" | "price-level"
  | "asset-type" | "form-design" | "fixed-asset" | "store-setting";
export type CatalogEntry = {
  id: string; kind: CatalogKind; code?: string | null; name: string; description?: string | null;
  data: Record<string, unknown>; isActive: boolean; ledgerAccountId?: string | null; ledgerAccountCode?: string | null;
  createdAt: string; updatedAt: string;
};
export type CatalogInput = {
  name: string; code?: string | null; description?: string | null; active?: boolean; data?: Record<string, unknown>;
  ledgerAccountId?: string | null;
};

export const listProducts = (params: { search?: string; kind?: ProductKind; includeInactive?: boolean } = {}) =>
  get<Product[]>(`/api/erp/products${q(params)}`);
export const createProduct = (input: ProductInput) => api<Product>("/api/erp/products", json("POST", input));
export const updateProduct = (id: string, input: ProductInput) => api<Product>(`/api/erp/products/${seg(id)}`, json("PUT", input));
export const deactivateProduct = (id: string) => api<{ id: string; isActive: false }>(`/api/erp/products/${seg(id)}`, json("DELETE"));

export const listCatalog = (kind: CatalogKind, includeInactive = false) =>
  get<CatalogEntry[]>(`/api/erp/catalog/${seg(kind)}${q({ includeInactive })}`);
export const createCatalogEntry = (kind: CatalogKind, input: CatalogInput) =>
  api<CatalogEntry>(`/api/erp/catalog/${seg(kind)}`, json("POST", input));
export const updateCatalogEntry = (kind: CatalogKind, id: string, input: CatalogInput) =>
  api<CatalogEntry>(`/api/erp/catalog/${seg(kind)}/${seg(id)}`, json("PUT", input));
/** Deactivates (tags and custom fields are removed: their tables have no active flag). */
export const removeCatalogEntry = (kind: CatalogKind, id: string) =>
  api<{ id: string; isActive: false }>(`/api/erp/catalog/${seg(kind)}/${seg(id)}`, json("DELETE"));

// ---------------------------------------------------------------- documents (L4/L5)
export const SALES_TYPES = ["quotation", "sales-order", "delivery-order", "invoice", "credit-note", "payment", "refund"] as const;
export const PURCHASE_TYPES = ["purchase-order", "goods-received", "bill", "purchase-credit-note", "purchase-payment", "purchase-refund"] as const;
export const BANK_TYPES = ["money-in", "money-out", "bank-transfer"] as const;
export type DocumentType = (typeof SALES_TYPES)[number] | (typeof PURCHASE_TYPES)[number] | (typeof BANK_TYPES)[number]
  | "journal-entry" | "stock-adjustment" | "stock-transfer" | "contra" | "deemed-payment" | "store-order" | "minipos-order";
/** Types that post a journal when they become ready; the others are records only. */
export const POSTING_TYPES: ReadonlySet<DocumentType> = new Set(["invoice", "credit-note", "payment", "refund", "bill",
  "purchase-credit-note", "purchase-payment", "purchase-refund", "money-in", "money-out", "bank-transfer", "journal-entry"]);
/** Types that hold an amount (and allocations) instead of priced lines. */
export const AMOUNT_ONLY_TYPES: ReadonlySet<DocumentType> = new Set(["payment", "refund", "purchase-payment", "purchase-refund", "bank-transfer"]);
/** The invoice/bill a payment or credit note can be allocated to. */
export const ALLOCATES_TO: Partial<Record<DocumentType, "invoice" | "bill">> = {
  payment: "invoice", "credit-note": "invoice", "purchase-payment": "bill", "purchase-credit-note": "bill",
};
/** Lists that also show approved scanned documents (source "scanned"). */
export const SCANNED_LIST_TYPES: ReadonlySet<DocumentType> = new Set(["invoice", "bill", "credit-note", "purchase-credit-note"]);
/** What a document can be turned into (the backend's TRANSFERS). */
export const TRANSFERS: Partial<Record<DocumentType, DocumentType[]>> = {
  quotation: ["sales-order", "delivery-order", "invoice"], "sales-order": ["delivery-order", "invoice"], "delivery-order": ["invoice"],
  invoice: ["credit-note", "payment"], "purchase-order": ["goods-received", "bill"], "goods-received": ["bill"],
  bill: ["purchase-credit-note", "purchase-payment"],
};
export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  quotation: "Quotation", "sales-order": "Sales order", "delivery-order": "Delivery order", invoice: "Invoice",
  "credit-note": "Credit note", payment: "Customer payment", refund: "Customer refund", "purchase-order": "Purchase order",
  "goods-received": "Goods received", bill: "Bill", "purchase-credit-note": "Supplier credit note",
  "purchase-payment": "Supplier payment", "purchase-refund": "Supplier refund", "money-in": "Money in", "money-out": "Money out",
  "bank-transfer": "Bank transfer", "journal-entry": "Journal entry", "stock-adjustment": "Stock adjustment",
  "stock-transfer": "Stock transfer", contra: "Contra", "deemed-payment": "Deemed payment", "store-order": "Store order",
  "minipos-order": "MiniPOS order",
};

export type DocumentStatus = "draft" | "pending_approval" | "ready" | "void";
export type DocumentLine = {
  itemId?: string | null; description: string; quantity: string; unitPrice: string; discount?: string; tax?: string;
  accountId?: string | null; debit?: string; credit?: string;
};
export type DocumentAllocation = { targetId: string; source: "typed" | "scanned"; amount: string };
type Common = {
  id: string; type: DocumentType; number: string; contactId?: string | null; contactName?: string | null;
  documentDate?: string | null; dueDate?: string | null; currency: string; referenceNo?: string | null;
  subtotal: string; taxAmount: string; amount: string; outstanding?: string; posts: boolean; posted: boolean;
  journalId?: string | null; createdAt: string; updatedAt: string;
};
export type TypedDocument = Common & {
  source: "typed"; status: DocumentStatus; contactKind?: ContactKind | null; description?: string | null;
  bankAccountId?: string | null; lines: DocumentLine[]; allocations: DocumentAllocation[]; tags: string[];
  fields: Record<string, unknown>; reversalJournalId?: string | null; postedAt?: string | null; voidReason?: string | null;
  voidedAt?: string | null; paymentStatus?: "unpaid" | "partly_paid" | "paid" | "void"; idempotent?: boolean;
};
/** An approved scanned document shown in the same list; "ready" once its journal is posted. */
export type ScannedDocument = Common & {
  source: "scanned"; status: "approved" | "ready"; recordCode: string; documentId: string; fileName: string;
};
export type ErpDocument = TypedDocument | ScannedDocument;
export type DocumentPage = { items: ErpDocument[]; total: number; page: number; pageSize: number; nextPage: number | null };
export type DocumentInput = {
  number?: string | null; contactId?: string | null; contactName?: string | null; documentDate?: string; dueDate?: string | null;
  currency?: string; referenceNo?: string | null; description?: string | null; status?: "draft" | "pending_approval" | "ready";
  amount?: string | null; bankAccountId?: string | null; lines?: DocumentLine[]; allocations?: DocumentAllocation[];
  tags?: string[]; fields?: Record<string, unknown>;
};
export type DocumentHistory = {
  events: { id: string; eventType: string; fromStatus?: string | null; toStatus?: string | null; reason?: string | null; actorName?: string | null; createdAt: string }[];
  links: { linkType: "duplicate" | "transfer"; sourceId: string; sourceType: DocumentType; sourceNumber: string; targetId: string; targetType: DocumentType; targetNumber: string }[];
  allocations: { amount: string; status: string; sourceId: string; sourceType: DocumentType; sourceNumber: string; targetId: string; targetType: DocumentType; targetNumber: string }[];
};

export const listDocuments = (type: DocumentType, params: {
  page?: number; pageSize?: number; search?: string; status?: DocumentStatus | "approved"; contactId?: string;
  dateFrom?: string; dateTo?: string; source?: "all" | "typed" | "scanned";
} = {}) => get<DocumentPage>(`/api/erp/documents/${seg(type)}${q(params)}`);
export const getDocument = (type: DocumentType, id: string) => get<TypedDocument>(`/api/erp/documents/${seg(type)}/${seg(id)}`);
export const createDocument = (type: DocumentType, input: DocumentInput) =>
  api<TypedDocument>(`/api/erp/documents/${seg(type)}`, json("POST", input));
export const updateDocument = (type: DocumentType, id: string, input: Partial<DocumentInput>) =>
  api<TypedDocument>(`/api/erp/documents/${seg(type)}/${seg(id)}`, json("PATCH", input));
export const deleteDocument = (type: DocumentType, id: string) =>
  api<{ id: string; deleted: true }>(`/api/erp/documents/${seg(type)}/${seg(id)}`, json("DELETE"));
/** "ready" posts a financial document (company admin only); "void" of a posted one adds a reversal journal. */
export const transitionDocument = (type: DocumentType, id: string, status: DocumentStatus, reason?: string) =>
  api<TypedDocument>(`/api/erp/documents/${seg(type)}/${seg(id)}/transition`, json("POST", { status, reason }));
export const duplicateDocument = (type: DocumentType, id: string) =>
  api<TypedDocument>(`/api/erp/documents/${seg(type)}/${seg(id)}/duplicate`, json("POST"));
export const transferDocument = (type: DocumentType, id: string, targetType: DocumentType) =>
  api<TypedDocument>(`/api/erp/documents/${seg(type)}/${seg(id)}/transfer`, json("POST", { targetType }));
export const documentHistory = (type: DocumentType, id: string) =>
  get<DocumentHistory>(`/api/erp/documents/${seg(type)}/${seg(id)}/history`);
/** L5: post an approved scanned invoice/bill/credit note through the same rule (posts once on either path). */
export const postScannedRecord = (recordId: string, input: { accountId?: string; journalDate?: string } = {}) =>
  api<{ id: string; status: string; idempotent: boolean; recordId: string }>(`/api/erp/scanned/${seg(recordId)}/post`, json("POST", input));

export type PostingPurpose = "receivable" | "revenue" | "tax_output" | "payable" | "expense" | "tax_input" | "bank";
export type PostingAccount = { purpose: PostingPurpose; accountId: string | null; code: string | null; name: string | null; problem?: string };
export const getPostingAccounts = () => get<PostingAccount[]>("/api/erp/posting-accounts");
export const setPostingAccounts = (accounts: Partial<Record<PostingPurpose, string>>) =>
  api<PostingAccount[]>("/api/erp/posting-accounts", json("PUT", { accounts }));

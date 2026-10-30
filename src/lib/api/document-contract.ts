import type { Document, StandardisedRecord, ExtractedField, Extraction, LineItem, ValidationResult, TransactionAnomaly } from "@/types";
export interface ExtractionResponse {
  lineCorrections?: Extraction["lineCorrections"];
  warnings?: Extraction["warnings"]; documentId: string; contentRevision?: number; raw?: Record<string, unknown>; classification?: Extraction["classification"];
  fields?: Array<Partial<ExtractedField> & { key: string }>;
  lineItems?: Array<Partial<LineItem> & { unit_price?: string | null }>;
}
export interface ValidationReport {
  documentId: string; contentRevision: number; status: string; validationStatus: string;
  reviewRequired: boolean; accountingApprovalPerformed: boolean;
  coverageComplete?: boolean; passed: number; warnings: number; failed: number; blocking: boolean; results: ValidationResult[];
  transactionAnomaly?: TransactionAnomaly | null;
}
/** POST revalidate returns errors/checks; GET validation supplies the full report. */
export interface RevalidationResponse {
  documentId: string; contentRevision: number; status: string; validationStatus: string;
  reviewRequired: boolean; accountingApprovalPerformed: boolean; coverageComplete: boolean;
  errors: Array<{ code: string; field: string; message: string; severity?: string }>;
  checks: ValidationResult[];
}
export interface CorrectionResponse { key: string; value: string; correctedBy: string; contentRevision: number; }
export function mapDocument(value: Document & { kind?: string }): Document {
  return { ...value, type: value.kind ?? value.type };
}
export function mapExtraction(value: ExtractionResponse): Extraction {
  return {
    lineCorrections: value.lineCorrections ?? [], warnings: value.warnings ?? [], documentId: value.documentId, contentRevision: value.contentRevision, raw: value.raw,
    classification: value.classification ?? value.raw?.document_type as Extraction["classification"],
    fields: Object.fromEntries((value.fields ?? []).map(field => [field.key, {
      ...field, label: field.label ?? field.key, value: field.value ?? null,
      original: field.normalizedValue ?? field.original ?? null,
      confidence: field.confidence ?? null, evidence: field.evidence ?? [], candidates: field.candidates ?? [],
    }])),
    lineItems: (value.lineItems ?? []).map(line => ({
      ...line, description: line.description ?? null, quantity: line.quantity ?? null,
      unitPrice: line.unit_price ?? line.unitPrice ?? null, amount: line.amount ?? null,
    })),
  };
}
/** Exact display only. No financial calculation or assumed currency. */
export function decimalDisplay(value: string | number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  const text = String(value);
  if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(text)) return "Invalid amount";
  const [whole, fraction] = text.split(".");
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction === undefined ? "" : "." + fraction);
  return currency ? currency + " " + formatted : formatted;
}

export type RecordResponse = Omit<StandardisedRecord, "extraction"> & { extraction?: Extraction; snapshot?: {
  contentRevision?: number; fieldPredictions?: ExtractionResponse["fields"];
  lineItems?: ExtractionResponse["lineItems"]; extraction?: Record<string, unknown>;
} };
export function mapRecord(record: RecordResponse): StandardisedRecord {
  if (record.extraction) return { ...record, extraction: record.extraction };
  return { ...record, extraction: mapExtraction({
    documentId: record.documentId, contentRevision: record.snapshot?.contentRevision,
    fields: record.snapshot?.fieldPredictions, lineItems: record.snapshot?.lineItems,
    raw: record.snapshot?.extraction,
  }) };
}

/** Support response omits category, validation and createdAt; never synthesize them. */
export type SupportViewResponse = Pick<RecordResponse, "id" | "documentId" | "tenantId" | "status" | "snapshot">;
export type SupportViewRecord = Pick<StandardisedRecord, "id" | "documentId" | "tenantId" | "status"> & { extraction: Extraction };
export function mapSupportView(record: SupportViewResponse): SupportViewRecord {
  return { ...record, extraction: mapExtraction({
    documentId: record.documentId, contentRevision: record.snapshot?.contentRevision,
    fields: record.snapshot?.fieldPredictions, lineItems: record.snapshot?.lineItems, raw: record.snapshot?.extraction,
  }) };
}

/** Source classification overrides stored intake kind, including explicit unknown. */
export function sourceKind(extraction: Pick<Extraction, "classification">, intake?: string): string {
  if (extraction.classification?.value !== undefined) {
    const kind = extraction.classification.value.toUpperCase();
    return ["INVOICE", "BILL", "RECEIPT"].includes(kind) ? kind : "UNKNOWN";
  }
  return intake?.toUpperCase() ?? "UNKNOWN";
}

/** Human-readable labels aligned with backend short storage keys (FIELD_KEYS). */
export function fieldLabel(kind: string, key: string, fallback?: string): string {
  const shared: Record<string, string> = {
    currency: "Currency",
    subtotal: "Subtotal",
    tax: "Tax",
    discount: "Discount",
    total: "Total",
    customer: "Customer",
    due: "Due date",
    supplier: "Supplier",
    invoice: "Invoice number",
    date: "Document date",
    reference: "Reference",
    amount_due: "Amount due",
    amount_paid: "Amount paid",
    allowances: "Allowances",
    charges: "Charges",
    prepaid: "Prepaid amount",
    rounding: "Rounding",
    total_excluding_tax: "Total excluding tax",
    total_including_tax: "Total including tax",
    tendered_amount: "Tendered amount",
    change_given: "Change given",
    outstanding_amount: "Outstanding amount",
    payment_terms: "Payment terms",
    received_date: "Received date",
    expense_category: "Expense category",
    payment_reference: "Payment reference",
    purchase_order_number: "Purchase order number",
    goods_receipt_reference: "Goods receipt reference",
    supplier_address: "Supplier address",
    customer_address: "Customer address",
    supplier_tax_id: "Supplier tax ID",
    customer_tax_id: "Customer tax ID",
    merchant_address: "Merchant address",
    account_number: "Account number",
    billing_period: "Billing period",
    transaction_time: "Transaction time",
    payment_method: "Payment method",
  };
  const profiles: Record<string, Record<string, string>> = {
    INVOICE: {
      supplier: "Supplier",
      invoice: "Invoice number",
      date: "Invoice date",
      customer: "Customer",
    },
    BILL: {
      supplier: "Issuer",
      reference: "Bill reference",
      account_number: "Account number",
      billing_period: "Billing period",
      date: "Bill date",
      total: "Bill total",
      amount_due: "Amount due",
      amount_paid: "Amount paid",
      charges: "Current charges",
    },
    RECEIPT: {
      supplier: "Merchant",
      reference: "Receipt reference",
      date: "Transaction date",
      transaction_time: "Transaction time",
      payment_method: "Payment method",
    },
  };
  return profiles[kind]?.[key] ?? shared[key] ?? fallback ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function validationState(result: ValidationResult): string {
  return result.checkStatus === "NOT_CHECKED" ? "NOT_CHECKED" : result.result;
}
export function standardisationAvailable(status: string, kind: string, report: ValidationReport | null): boolean {
  return status === "VALIDATED" && kind !== "UNKNOWN" && report?.validationStatus === "PASS"
    && report.coverageComplete !== false && !report.blocking;
}

/** Decimal field keys that should use decimalDisplay. */
export const MONEY_KEYS = new Set([
  "subtotal", "tax", "discount", "total", "amount_due", "amount_paid",
  "allowances", "charges", "prepaid", "rounding", "total_excluding_tax",
  "total_including_tax", "tendered_amount", "change_given", "outstanding_amount",
]);

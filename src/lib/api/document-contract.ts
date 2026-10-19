import type { Document, StandardisedRecord, ExtractedField, Extraction, LineItem, ValidationResult } from "@/types";
export interface ExtractionResponse {
  documentId: string; contentRevision?: number; raw?: Record<string, unknown>;
  fields?: Array<Partial<ExtractedField> & { key: string }>;
  lineItems?: Array<Partial<LineItem> & { unit_price?: string | null }>;
}
export interface ValidationReport {
  documentId: string; contentRevision: number; status: string; validationStatus: string;
  reviewRequired: boolean; accountingApprovalPerformed: boolean;
  passed: number; warnings: number; failed: number; blocking: boolean; results: ValidationResult[];
}
export interface CorrectionResponse { key: string; value: string; correctedBy: string; contentRevision: number; }
export function mapDocument(value: Document & { kind?: string }): Document {
  return { ...value, type: value.kind ?? value.type };
}
export function mapExtraction(value: ExtractionResponse): Extraction {
  return {
    documentId: value.documentId, contentRevision: value.contentRevision, raw: value.raw,
    classification: value.raw?.document_type as Extraction["classification"],
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

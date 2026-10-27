export interface ExtractionWarning { code: string; message: string; reviewed?: boolean; }
export interface SourceEvidence { page?: number; source_ref?: string; text?: string; bbox?: { l: number; t: number; r: number; b: number; coord_origin?: string } | null; page_size?: { width: number; height: number } | null; coordinate_units?: string; text_span?: [number, number]; bbox_scope?: string; }
export interface ExtractedField {
  label: string; value: string | null; original: string | null; confidence: number | null;
  rawValue?: string | null; normalizedValue?: string | null; currentValue?: string | null;
  warnings?: ExtractionWarning[]; confirmationRequired?: boolean; reviewRequired?: boolean;
  state?: string; resolution?: string; evidence?: SourceEvidence[]; candidates?: unknown[];
  method?: string; modelName?: string | null; modelVersion?: string | null;
  correctedBy?: string | null; correctedAt?: string | null;
}
export interface LineCorrection { line_item_id: string; field_key: string; old_value: string | null; new_value: string | null; corrected_by: string; corrected_at: string; }
export interface LineItem { methods?: Record<string, string | null>; fieldStates?: Record<string, string>; guidance?: Record<string, Pick<ExtractedField, "warnings" | "confirmationRequired" | "reviewRequired">>; id?: string; description: string | null; quantity: string | number | null; unitPrice: string | number | null; amount: string | number | null; evidence?: Record<string, SourceEvidence[]>; candidates?: Record<string, unknown[]>; }
export interface SourceClassification {
  value?: string; status?: string; method?: string; reason?: string; classifier_version?: string;
  candidates?: Array<{ value?: string; matched_title?: string; evidence?: { text?: string; source_ref?: string; prov?: Array<{ page_no?: number; bbox?: Record<string, unknown>; charspan?: number[] }> } }>;
  unsupported_headings?: Array<{ matched_title?: string; evidence?: { text?: string; source_ref?: string; prov?: Array<{ page_no?: number; bbox?: Record<string, unknown>; charspan?: number[] }> } }>;
}
export interface Extraction { lineCorrections?: LineCorrection[]; warnings?: ExtractionWarning[]; documentId: string; contentRevision?: number; raw?: Record<string, unknown>; classification?: SourceClassification; fields: Record<string, ExtractedField>; lineItems: LineItem[]; }

export interface SourceEvidence { page?: number; source_ref?: string; text?: string; bbox?: { l: number; t: number; r: number; b: number; coord_origin?: string } | null; coordinate_units?: string; }
export interface ExtractedField {
  label: string; value: string | null; original: string | null; confidence: number | null;
  rawValue?: string | null; normalizedValue?: string | null; currentValue?: string | null;
  state?: string; resolution?: string; evidence?: SourceEvidence[]; candidates?: unknown[];
  method?: string; modelName?: string | null; modelVersion?: string | null;
  correctedBy?: string | null; correctedAt?: string | null;
}
export interface LineItem { id?: string; description: string | null; quantity: string | number | null; unitPrice: string | number | null; amount: string | number | null; evidence?: Record<string, SourceEvidence[]>; candidates?: Record<string, unknown[]>; }
export interface Extraction { documentId: string; contentRevision?: number; raw?: Record<string, unknown>; classification?: { value?: string; status?: string; method?: string }; fields: Record<string, ExtractedField>; lineItems: LineItem[]; }

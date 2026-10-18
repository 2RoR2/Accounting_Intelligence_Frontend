export interface ExtractedField { label: string; value: string; original: string; confidence: number | null; correctedBy?: string; }
export interface LineItem { description: string; quantity: number; unitPrice: number; amount: number; }
export interface Extraction { documentId: string; fields: Record<string, ExtractedField>; lineItems: LineItem[]; }

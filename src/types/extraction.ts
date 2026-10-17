export interface ExtractedField { label: string; value: string; original: string; confidence: number; correctedBy?: string; }
export interface LineItem { description: string; quantity: number; unitPrice: number; amount: number; }
export interface Extraction { documentId: string; fields: Record<string, ExtractedField>; lineItems: LineItem[]; }

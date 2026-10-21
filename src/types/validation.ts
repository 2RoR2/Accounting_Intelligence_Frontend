export interface ValidationResult { rule: string; result: "PASS" | "WARNING" | "FAIL"; message: string; field?: string; severity?: string; checkStatus?: string; code?: string; required?: boolean; duplicate_of?: string;
  vendor_candidate?: { vendor_id?: string | null; vendor_name?: string | null; similarity?: number | null; score_method?: string | null }; }
export interface ValidationRules { supplier: boolean; invoice: boolean; date: boolean; total: boolean; duplicate: boolean; threshold: number; invoiceByType?: boolean; billReferenceByType?: boolean; receiptIdentifierByType?: boolean; }

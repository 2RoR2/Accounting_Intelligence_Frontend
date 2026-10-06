export interface ValidationResult { rule: string; result: "PASS" | "WARNING" | "FAIL"; message: string; }
export interface ValidationRules { supplier: boolean; invoice: boolean; date: boolean; total: boolean; duplicate: boolean; threshold: number; }

import type { Extraction } from "./extraction";
export type RecordCategory = "ACCOUNTS_RECEIVABLE" | "ACCOUNTS_PAYABLE";
export interface StandardisedRecord { id: string; documentId: string; tenantId: string; createdAt: string; category: RecordCategory; validation: "PASSED"; status: "COMPLETED"; extraction: Extraction; }

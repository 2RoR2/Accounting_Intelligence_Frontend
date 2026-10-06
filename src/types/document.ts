export type DocumentStatus = "UPLOADED" | "QUEUED" | "PROCESSING" | "EXTRACTED" | "VALIDATING" | "EXCEPTION" | "IN_REVIEW" | "CORRECTED" | "VALIDATED" | "STANDARDISED" | "COMPLETED" | "FAILED";
export type DocumentKind = "INVOICE" | "BILL" | "RECEIPT";
export interface Document { id: string; tenantId: string; ownerId: string; assignedTo: string; name: string; type: string; status: DocumentStatus; createdAt: string; seconds: number; scenario: string; }
export interface ProcessingJob { id: string; documentId: string; tenantId: string; status: DocumentStatus; seconds: number; startedAt: string; completedAt: string; }

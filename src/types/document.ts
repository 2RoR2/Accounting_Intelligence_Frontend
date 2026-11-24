import type { DocumentDisplayName } from "@/lib/document-display-name";

export type DocumentStatus = "UPLOADED" | "QUEUED" | "PROCESSING" | "EXTRACTED" | "VALIDATING" | "EXCEPTION" | "IN_REVIEW" | "CORRECTED" | "VALIDATED" | "STANDARDISED" | "COMPLETED" | "FAILED";
export type DocumentKind = "INVOICE" | "BILL" | "RECEIPT" | "CREDIT_NOTE" | "DEBIT_NOTE";
export interface Document extends DocumentDisplayName {
  id: string;
  tenantId: string;
  ownerId: string;
  assignedTo: string | null;
  name: string;
  /** "sales" | "purchase" | "unknown": whose document this is for the company. */
  direction?: string;
  directionWarning?: string | null;
  type: string;
  kind?: string;
  code?: string;
  category?: string;
  mimeType?: string;
  /** False for a kind=auto upload whose type was not detected yet (code DOC_..., type AUTO). */
  kindDetected?: boolean;
  jobId?: string;
  queueJobId?: string | null;
  status: DocumentStatus;
  createdAt: string;
  contentRevision?: number;
  dueDate?: string | null;
  seconds: number;
  scenario: string;
  /** Prefer string to avoid float precision loss; backend list may return number, records return string. */
  totalAmount?: string | number | null;
  /** Where `totalAmount` came from: the saved record ("record"), or what the AI read before approval ("read"). */
  totalSource?: "record" | "read" | null;
  /** Passed every check on the current revision with nothing open: the backend's ready lane rule (list responses only). */
  readyToSubmit?: boolean;
  supplier?: string | null;
  customer?: string | null;
  /** Set aside as a wrong upload (left out of every list); detail responses only. */
  excludedAt?: string | null;
  excludedReason?: string | null;
}
export interface ProcessingJob { id: string; documentId: string; tenantId: string; status: DocumentStatus; seconds: number; startedAt: string; completedAt: string; }

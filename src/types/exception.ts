export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH";
export type ExceptionStatus = "OPEN" | "ASSIGNED" | "IN_REVIEW" | "RESOLVED";
export interface Exception {
  id: string;
  documentId: string;
  tenantId: string;
  type: string;
  severity: ExceptionSeverity;
  assignedTo: string;
  assignedToName?: string;
  documentCode?: string;
  originalFilename?: string;
  createdAt: string;
  resolvedAt?: string;
  status: ExceptionStatus;
  message: string;
  note?: string;
}

import type { Role } from "./auth";
export interface AuditLog { id: string; tenantId: string | null; user: string; role: Role | "SYSTEM"; action: string; resource: string; details: string; timestamp: string; }
export interface AiAuditLog {
  id: string;
  timestamp: string;
  documentCode: string;
  provider: string | null;
  model: string | null;
  seconds: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  outcome: string;
  imageSent: boolean;
  promptSha256: string | null;
  maskedIdentifiers: Record<string, number>;
  schemaValid: boolean;
  injectionDetected: boolean;
}

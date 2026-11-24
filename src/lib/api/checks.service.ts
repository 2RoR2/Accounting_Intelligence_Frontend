/**
 * Document checks (POST /api/erp/documents/{type}/checks): advisory findings on a typed sales document or supplier
 * bill as the form holds it. Nothing is saved or changed; the user decides what to fix.
 */
import { api, json } from "@/lib/api/client";
import type { DocumentInput, DocumentType } from "@/lib/api/erp.service";

export type CheckSeverity = "block" | "warn" | "info";
/** A value the user may apply with one click (never applied automatically). */
export type CheckSuggestion = { field: string; value: string; label: string; lineIndex?: number };
export type CheckFinding = {
  code: string; severity: CheckSeverity; field: string; lineIndex?: number; message: string; howToFix: string;
  suggestion?: CheckSuggestion;
};
export type CheckResult = { findings: CheckFinding[]; counts: Record<CheckSeverity, number> };

export const runDocumentChecks = (type: DocumentType, input: DocumentInput, documentId?: string | null, signal?: AbortSignal) =>
  api<CheckResult>(`/api/erp/documents/${encodeURIComponent(type)}/checks`,
    { ...json("POST", { ...input, documentId: documentId ?? null }), signal });

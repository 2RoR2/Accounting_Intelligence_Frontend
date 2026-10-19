import type {
  Document,
  RecordCategory,
  User,
  ValidationRules,
  Exception,
} from "@/types";
import type { DocumentKind } from "@/types";
import { requireRole } from "../permissions";
import { api, get } from "./client";
import { mapDocument, mapExtraction, type ExtractionResponse, type ValidationReport, type CorrectionResponse } from "./document-contract";
export type DocumentSearch = {
  q?: string;
  status?: string;
  date?: string;
  amount?: string;
  business?: string;
};
export async function getDocuments(user: User, filters: DocumentSearch = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value?.trim()) params.set(key, value.trim());
  });
  const query = params.toString();
  return (await get<Array<Document & { kind?: string }>>(`/api/documents${query ? `?${query}` : ""}`)).map(mapDocument);
}
export async function getDocument(user: User, documentId: string) {
  return mapDocument(await get<Document & { kind?: string }>(`/api/documents/${documentId}`));
}
export async function getExtraction(user: User, documentId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  return mapExtraction(await get<ExtractionResponse>("/api/documents/" + documentId + "/extraction"));
}
export async function getValidationReport(user: User, documentId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  return get<ValidationReport>("/api/documents/" + documentId + "/validation");
}
export async function getValidationResults(user: User, documentId: string) {
  return (await getValidationReport(user, documentId)).results;
}
export async function updateExtractedField(user: User, documentId: string, key: string, value: string, expectedContentRevision: number) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  if (!Number.isInteger(expectedContentRevision) || expectedContentRevision < 1) throw new Error("Refresh the document to obtain its current revision.");
  return api<CorrectionResponse>("/api/documents/" + documentId + "/extraction/" + encodeURIComponent(key), {
    method: "PATCH", body: JSON.stringify({ value, expectedContentRevision }),
  });
}
export async function revalidateDocument(user: User, documentId: string, note = "") {
  void note;
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  return api<ValidationReport>("/api/documents/" + documentId + "/revalidate", { method: "POST" });
}

export async function retryDocumentProcessing(user: User, documentId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  return api<{ documentId: string; jobId?: string; status: string }>(`/api/documents/${documentId}/retry`, { method: "POST" });
}
export async function getExceptions(user: User) {
  void user;
  return get<Exception[]>("/api/exceptions");
}
export async function resolveException(
  user: User,
  documentId: string,
  note: string,
) {
  if (!note.trim())
    throw new Error("Add a correction note before revalidating.");
  const exception = (await getExceptions(user)).find((item) => item.documentId === documentId);
  if (!exception) throw new Error("Exception was not found.");
  await api(`/api/exceptions/${exception.id}/resolve`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
  return revalidateDocument(user, documentId, note);
}
export async function assignException(
  user: User,
  exceptionId: string,
  userId: string,
) {
  requireRole(user, ["LOCAL_ADMIN"]);
  await api(`/api/exceptions/${exceptionId}/assign`, {
    method: "PATCH",
    body: JSON.stringify({ userId }),
  });
}
export async function uploadDocument(
  user: User,
  file: File,
  scenario: string,
  category: RecordCategory = "ACCOUNTS_PAYABLE",
  kind: DocumentKind = "INVOICE",
) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  if (!/\.pdf$/i.test(file.name))
    throw new Error(
      "The verified AI workflow accepts digital PDF invoices, bills and receipts; unknown content requires review.",
    );
  if (file.size === 0) throw new Error("This file is empty.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Maximum file size is 20 MB.");
  const body = new FormData();
  body.append("file", file, file.name);
  void scenario;
  const params = new URLSearchParams({kind: kind.toLowerCase(), category: category.toLowerCase()});
  return mapDocument(await api<Document>("/api/documents?" + params, { method: "POST", body }));
}
export async function advanceProcessing(
  user: User,
  documentId: string,
  status: "QUEUED" | "PROCESSING" | "EXTRACTED" | "FAILED",
) {
  if (status === "EXTRACTED") return revalidateDocument(user, documentId);
  return retryDocumentProcessing(user, documentId); /*
  mutate((db) => {
    const doc = documentFor(db, user, documentId, true);
    doc.status = status;
    log(db, user, `DOCUMENT_${status}`, doc.name, "Simulated processing.");
  }); */
  if (status === "EXTRACTED") await revalidateDocument(user, documentId);
}
export async function getValidationRules(user: User) {
  // Accountants need read access to the active policy while reviewing a
  // document. Updates remain restricted to local admins below.
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  return get<ValidationRules>("/api/validation-rules");
}
export async function updateValidationRules(
  user: User,
  rules: ValidationRules,
) {
  requireRole(user, ["LOCAL_ADMIN"]);
  if (rules.threshold < 0 || rules.threshold > 100)
    throw new Error("Threshold must be between 0 and 100.");
  await api("/api/validation-rules", { method: "PUT", body: JSON.stringify(rules) });
}

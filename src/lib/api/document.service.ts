import type {
  Document,
  Extraction,
  RecordCategory,
  User,
  ValidationResult,
  ValidationRules,
  Exception,
} from "@/types";
import type { DocumentKind } from "@/types";
import { requireRole } from "../permissions";
import { api, get } from "./client";
function documentKindFromName(name: string): DocumentKind {
  const lower = name.toLowerCase();
  if (lower.includes("receipt")) return "RECEIPT";
  if (lower.includes("credit")) return "CREDIT_NOTE";
  if (lower.includes("debit")) return "DEBIT_NOTE";
  if (lower.includes("bill")) return "BILL";
  return "INVOICE";
}
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
  return get<Document[]>(`/api/documents${query ? `?${query}` : ""}`);
}
export async function getDocument(user: User, documentId: string) {
  return get<Document>(`/api/documents/${documentId}`);
}
export async function getExtraction(user: User, documentId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  const response = await get<{ documentId: string; fields?: Array<{ key: string; label?: string; value?: string | null; confidence?: number | null }>; lineItems?: Extraction["lineItems"] }>(`/api/documents/${documentId}/extraction`);
  return {
    documentId: response.documentId,
    fields: Object.fromEntries((response.fields ?? []).map((field) => [field.key, { label: field.label ?? field.key, value: field.value ?? "", original: field.value ?? "", confidence: field.confidence ?? 0 }])),
    lineItems: response.lineItems ?? [],
  } as Extraction;
}
export function validateExtraction(
  extraction: Extraction,
  rules: ValidationRules,
  otherExtractions: Extraction[],
): ValidationResult[] {
  const f = extraction.fields;
  const results: ValidationResult[] = [];
  const add = (
    enabled: boolean,
    rule: string,
    pass: boolean,
    message: string,
  ) => {
    if (enabled)
      results.push({
        rule,
        result: pass ? "PASS" : "FAIL",
        message: pass ? "Check passed." : message,
      });
  };
  add(
    rules.supplier,
    "Supplier Required",
    !!f.supplier?.value?.trim(),
    "Supplier name is required.",
  );
  add(
    rules.invoice,
    "Invoice Number Required",
    !!f.invoice?.value?.trim(),
    "Invoice number is required.",
  );
  add(
    rules.date,
    "Invoice Date",
    /^\d{4}-\d{2}-\d{2}$/.test(f.date?.value ?? "") &&
      !Number.isNaN(Date.parse(f.date?.value ?? "")),
    "Enter a valid invoice date.",
  );
  const values = ["subtotal", "tax", "discount", "total"].map((k) =>
    f[k]?.value?.trim() === "" ? NaN : Number(f[k]?.value),
  );
  add(
    rules.total,
    "Total Calculation",
    values.every((v) => Number.isFinite(v) && v >= 0) &&
      Math.abs(values[0] + values[1] - values[2] - values[3]) < 0.01,
    "Subtotal + tax − discount does not equal total.",
  );
  add(
    rules.duplicate,
    "Duplicate Invoice",
    !otherExtractions.some(
      (e) =>
        e.documentId !== extraction.documentId &&
        e.fields.invoice?.value === f.invoice?.value &&
        e.fields.supplier?.value === f.supplier?.value,
    ),
    "An invoice with this number and supplier already exists.",
  );
  const low = Object.values(f).filter(
    (field) => field.confidence < rules.threshold && !field.correctedBy,
  );
  results.push({
    rule: "Confidence Check",
    result: low.length ? "WARNING" : "PASS",
    message: low.length
      ? `${low.map((f) => f.label).join(", ")} below ${rules.threshold}%. Review recommended.`
      : "All fields meet the confidence threshold or have been reviewed.",
  });
  return results;
}
export async function getValidationResults(user: User, documentId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  const response = await get<{
    results?: ValidationResult[];
  }>(`/api/documents/${documentId}/validation`);
  return response.results ?? [];
}
export async function updateExtractedField(
  user: User,
  documentId: string,
  key: string,
  value: string,
) {
  await api(`/api/documents/${documentId}/extraction/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({ value }) }); /*
  mutate((db) => {
    const doc = documentFor(db, user, documentId, true);
    const field = db.extractions.find((e) => e.documentId === documentId)
      ?.fields[key];
    if (!field) throw new Error("Unknown extraction field.");
    field.value = value;
    field.correctedBy = user.name;
    doc.status = "CORRECTED";
    log(
      db,
      user,
      "EXTRACTION_CORRECTED",
      doc.name,
      `${field.label}: ${field.original} → ${value}`,
      doc.tenantId,
    );
  }); */
}
export async function revalidateDocument(
  user: User,
  documentId: string,
  note = "",
) {
  void user;
  void note;
  return api(`/api/documents/${documentId}/revalidate`, { method: "POST" }); /*
  return mutate((db) => {
    const doc = documentFor(db, user, documentId, true);
    const extraction = db.extractions.find(
      (item) => item.documentId === documentId,
    )!;
    if (extraction.fields.validationDateTime) {
      const validatedAt = now();
      extraction.fields.validationDateTime.value = validatedAt;
      extraction.fields.validationDateTime.original = validatedAt;
    }
    const results = resultsFor(db, doc);
    const failures = results.filter((r) => r.result !== "PASS");
    doc.status = failures.some((r) => r.result === "FAIL")
      ? "EXCEPTION"
      : failures.length
        ? "IN_REVIEW"
        : "VALIDATED";
    db.exceptions
      .filter((e) => e.documentId === documentId)
      .forEach((e) => {
        const rule =
          e.type === "TOTAL_MISMATCH"
            ? "Total Calculation"
            : e.type === "MISSING_INVOICE"
              ? "Invoice Number Required"
              : e.type === "DUPLICATE_INVOICE"
                ? "Duplicate Invoice"
                : "Confidence Check";
        if (!failures.some((r) => r.rule === rule)) {
          e.status = "RESOLVED";
          e.note = note;
        } else if (e.status === "RESOLVED") e.status = "OPEN";
      });
    failures.forEach((r) => {
      const type =
        r.rule === "Total Calculation"
          ? "TOTAL_MISMATCH"
          : r.rule === "Invoice Number Required"
            ? "MISSING_INVOICE"
            : r.rule === "Duplicate Invoice"
              ? "DUPLICATE_INVOICE"
              : "LOW_CONFIDENCE";
      if (
        !db.exceptions.some(
          (e) =>
            e.documentId === doc.id &&
            e.type === type &&
            e.status !== "RESOLVED",
        )
      )
        db.exceptions.push({
          id: id("EXC"),
          documentId: doc.id,
          tenantId: doc.tenantId,
          type,
          severity: r.result === "FAIL" ? "HIGH" : "LOW",
          assignedTo: doc.assignedTo,
          createdAt: now(),
          status: "OPEN",
          message: r.message,
          note,
        });
    });
    log(
      db,
      user,
      "DOCUMENT_REVALIDATED",
      doc.name,
      `${doc.status}${note ? `: ${note}` : ""}`,
      doc.tenantId,
    );
    return results;
  }); */
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
  file: File | Pick<File, "name" | "size" | "type">,
  scenario: string,
  category: RecordCategory = "ACCOUNTS_PAYABLE",
  kind: DocumentKind = documentKindFromName(file.name),
) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  if (!/\.(pdf|png|jpe?g|tiff?|xlsx|csv)$/i.test(file.name))
    throw new Error(
      "Supported formats: PDF, PNG, JPG, JPEG, TIFF, TIF, XLSX, CSV.",
    );
  if (file.size === 0) throw new Error("This file is empty.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Maximum file size is 20 MB.");
  const body = new FormData();
  body.append("file", file instanceof File ? file : new Blob([], { type: file.type }), file.name);
  body.append("kind", kind.toLowerCase());
  body.append("category", category.toLowerCase());
  return api<Document>("/api/documents", { method: "POST", body });
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

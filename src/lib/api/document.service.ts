import type {
  Database,
  Document,
  DocumentStatus,
  DocumentKind,
  Exception,
  ExceptionSeverity,
  ExceptionStatus,
  ExtractedField,
  Extraction,
  LineItem,
  RecordCategory,
  User,
  ValidationResult,
  ValidationRules,
} from "@/types";
import { id, mutate, now, readDb } from "../mock/repository";
import {
  defaultRules,
  documentKindFromName,
  labelForKind,
  makeExtraction,
  nextDocumentCode,
} from "../mock/seed";
import { assertActive, canDocument, requireRole } from "../permissions";
import { log } from "./audit.service";
import { api } from "./client";

export const isFrontendMockEnabled =
  (typeof window === "undefined" && process.env.NEXT_PUBLIC_AUTH_MODE !== "real" && process.env.NEXT_PUBLIC_AUTH_MODE !== "api") ||
  process.env.NEXT_PUBLIC_AUTH_MODE === "mock" ||
  process.env.NODE_ENV === "test";

function documentFor(
  db: Database,
  user: User,
  documentId: string,
  edit = false,
) {
  assertActive(db, user);
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc || !canDocument(user, doc))
    throw new Error("Document not found in your workspace.");
  if (edit) {
    requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
    if (doc.status === "COMPLETED")
      throw new Error("Completed records are immutable.");
  }
  return doc;
}

interface BackendDocumentItem {
  id: string;
  document_code?: string;
  tenant_id?: string;
  original_filename: string;
  kind?: string;
  category?: string;
  status: string;
  file_size_bytes?: number;
  uploaded_at: string;
  updated_at?: string;
  processing_seconds?: number | null;
}

interface RawBackendException {
  id?: string | number;
  tenant_id?: string;
  document_id?: string | number;
  document_code?: string;
  original_filename?: string;
  type?: string;
  category?: string;
  exception_type?: string;
  exception_code?: string;
  severity?: string;
  status?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  message?: string;
  details?: string;
  note?: string;
  created_at?: string;
  resolved_at?: string;
}

interface BackendExtractionResult {
  document_id: string;
  document_code?: string;
  status: string;
  review_required?: boolean;
  can_approve?: boolean;
  run_number?: number;
  routing_decision?: string;
  fields?: Array<{
    field_key: string;
    field_label?: string;
    raw_value?: string;
    normalized_value?: string;
    current_value?: string;
    confidence?: number | null;
    is_corrected?: boolean;
    corrected_by?: string;
  }>;
  line_items?: Array<{
    line_number?: number;
    description?: string;
    quantity?: number;
    unit_price?: number;
    amount?: number;
  }>;
  exceptions?: RawBackendException[];
}

export async function getDocuments(user: User): Promise<Document[]> {
  if (!isFrontendMockEnabled) {
    const docs = await api<BackendDocumentItem[]>("/documents");
    return docs.map((d) => ({
      id: String(d.id),
      tenantId: String(d.tenant_id || user.tenantId || ""),
      ownerId: user.id,
      assignedTo: user.id,
      name: d.original_filename,
      type: (d.kind || "INVOICE").toUpperCase(),
      status: (d.status || "UPLOADED").toUpperCase() as DocumentStatus,
      createdAt: d.uploaded_at,
      seconds: d.processing_seconds != null ? Number(d.processing_seconds) : null,
      scenario: "",
    }));
  }
  assertActive(readDb(), user);
  return readDb().documents.filter((d) => canDocument(user, d));
}

export async function getDocument(user: User, documentId: string): Promise<Document> {
  if (!isFrontendMockEnabled) {
    const d = await api<BackendDocumentItem>(`/documents/${documentId}`);
    return {
      id: String(d.id),
      tenantId: String(d.tenant_id),
      ownerId: user.id,
      assignedTo: user.id,
      name: d.original_filename,
      type: (d.kind || "INVOICE").toUpperCase(),
      status: (d.status || "UPLOADED").toUpperCase() as DocumentStatus,
      createdAt: d.uploaded_at,
      seconds: d.processing_seconds != null ? Number(d.processing_seconds) : null,
      scenario: "",
    };
  }
  return documentFor(readDb(), user, documentId);
}

export async function getExtraction(user: User, documentId: string): Promise<Extraction> {
  if (!isFrontendMockEnabled) {
    const res = await api<BackendExtractionResult>(`/documents/${documentId}/result`);
    const fields: Record<string, ExtractedField> = {};
    const keyAliasMap: Record<string, string> = {
      supplier_name: "supplier",
      invoice_number: "invoice",
      invoice_date: "date",
      total_amount: "total",
      subtotal: "subtotal",
      tax_amount: "tax",
      currency: "currency",
    };

    for (const f of res.fields || []) {
      const canonicalKey = keyAliasMap[f.field_key] || f.field_key;
      const fieldObj: ExtractedField = {
        label: f.field_label || f.field_key,
        value: f.current_value ?? f.normalized_value ?? f.raw_value ?? "",
        original: f.raw_value ?? "",
        confidence: f.confidence != null ? Math.round(f.confidence * 100) : null,
        correctedBy: f.is_corrected ? (f.corrected_by || "Accountant") : undefined,
      };
      fields[canonicalKey] = fieldObj;
    }

    const lineItems: LineItem[] = (res.line_items || []).map((item) => ({
      description: item.description || "Line item",
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price) || 0,
      amount: Number(item.amount) || 0,
    }));

    return {
      documentId,
      fields,
      lineItems,
    };
  }
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  documentFor(readDb(), user, documentId);
  return structuredClone(
    readDb().extractions.find((e) => e.documentId === documentId)!,
  );
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
    !!f.supplier?.value.trim(),
    "Supplier name is required.",
  );
  add(
    rules.invoice,
    "Invoice Number Required",
    !!f.invoice?.value.trim(),
    "Invoice number is required.",
  );
  add(
    rules.date,
    "Invoice Date",
    /^\d{4}-\d{2}-\d{2}$/.test(f.date?.value || "") &&
      !Number.isNaN(Date.parse(f.date?.value || "")),
    "Enter a valid invoice date.",
  );
  const values = ["subtotal", "tax", "discount", "total"].map((k) =>
    !f[k] || f[k].value.trim() === "" ? NaN : Number(f[k].value),
  );
  add(
    rules.total,
    "Total Calculation",
    values.every((v) => Number.isFinite(v) && v >= 0) &&
      Math.abs(values[0] + values[1] - (values[2] || 0) - values[3]) < 0.01,
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
    (field) =>
      field.confidence !== null &&
      field.confidence !== undefined &&
      field.confidence < rules.threshold &&
      !field.correctedBy,
  );

  results.push({
    rule: "Confidence Check",
    result: low.length ? "WARNING" : "PASS",
    message: low.length
      ? `${low.map((field) => field.label).join(", ")} below ${rules.threshold}%. Review recommended.`
      : "All fields meet the confidence threshold or have been reviewed.",
  });
  return results;
}

function resultsFor(db: Database, doc: Document) {
  return validateExtraction(
    db.extractions.find((e) => e.documentId === doc.id)!,
    db.rules[doc.tenantId] ?? defaultRules,
    db.extractions.filter((e) =>
      db.documents.some(
        (d) => d.id === e.documentId && d.tenantId === doc.tenantId,
      ),
    ),
  );
}

export async function getValidationResults(user: User, documentId: string): Promise<ValidationResult[]> {
  if (!isFrontendMockEnabled) {
    const res = await api<BackendExtractionResult>(`/documents/${documentId}/result`);
    const results: ValidationResult[] = [];
    if (res.exceptions && res.exceptions.length > 0) {
      for (const exc of res.exceptions) {
        results.push({
          rule: exc.category || exc.exception_code || "Validation Issue",
          result: exc.severity === "high" || exc.severity === "HIGH" ? "FAIL" : "WARNING",
          message: exc.message || "Discrepancy detected.",
        });
      }
    }
    if (res.status === "validated" || res.status === "standardised") {
      results.push({
        rule: "Module 3 Accounting Rules",
        result: "PASS",
        message: "All validation rules passed with zero blocking exceptions.",
      });
    } else if (res.status === "corrected") {
      results.push({
        rule: "Human Field Corrections",
        result: "WARNING",
        message: "Field corrections recorded. Revalidation required before approval.",
      });
    } else if (res.exceptions?.length === 0) {
      results.push({
        rule: "Module 3 Rules Check",
        result: "PASS",
        message: "No open validation exceptions.",
      });
    }
    return results;
  }
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  const db = readDb();
  return resultsFor(db, documentFor(db, user, documentId));
}

export async function updateExtractedField(
  user: User,
  documentId: string,
  key: string,
  value: string,
): Promise<void> {
  if (!isFrontendMockEnabled) {
    const reverseAliasMap: Record<string, string> = {
      supplier: "supplier_name",
      invoice: "invoice_number",
      date: "invoice_date",
      total: "total_amount",
      tax: "tax_amount",
    };
    const backendKey = reverseAliasMap[key] || key;
    const res = await fetch(`/api/documents/${documentId}/fields/${backendKey}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "AccountingIntelligence",
      },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Failed to update field.");
    }
    return;
  }
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
  });
}

export async function revalidateDocument(
  user: User,
  documentId: string,
  note = "",
): Promise<ValidationResult[]> {
  if (!isFrontendMockEnabled) {
    const res = await fetch(`/api/documents/${documentId}/revalidate`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "AccountingIntelligence",
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Revalidation failed.");
    }
    return getValidationResults(user, documentId);
  }
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
  });
}

export interface ExceptionFilters {
  status?: string;
  severity?: string;
  documentId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export async function getExceptions(
  user: User,
  filters?: ExceptionFilters,
): Promise<Exception[]> {
  if (!isFrontendMockEnabled) {
    try {
      const q = new URLSearchParams();
      if (filters?.status) q.set("status", filters.status.toLowerCase());
      if (filters?.severity) q.set("severity", filters.severity.toLowerCase());
      if (filters?.documentId) q.set("document_id", filters.documentId);
      if (filters?.type) q.set("type", filters.type);
      if (filters?.limit) q.set("limit", String(filters.limit));
      if (filters?.offset) q.set("offset", String(filters.offset));
      const qs = q.toString() ? `?${q.toString()}` : "";

      const res = await fetch(`/api/exceptions${qs}`, {
        credentials: "same-origin",
        headers: {
          "X-Requested-With": "AccountingIntelligence",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const rawList: RawBackendException[] = Array.isArray(data)
          ? data
          : data.exceptions || [];
        return rawList.map((e: RawBackendException) => {
          const sev = String(e.severity || "MEDIUM").toUpperCase();
          const validSeverity: ExceptionSeverity =
            sev === "HIGH" || sev === "LOW" ? sev : "MEDIUM";
          const st = String(e.status || "OPEN").toUpperCase();
          const validStatus: ExceptionStatus =
            st === "RESOLVED" || st === "IN_REVIEW" || st === "ASSIGNED"
              ? st
              : "OPEN";
          return {
            id: String(e.id),
            tenantId: String(e.tenant_id || user.tenantId),
            documentId: String(e.document_id),
            documentCode: e.document_code,
            originalFilename: e.original_filename,
            type: String(e.type || e.exception_type || "VALIDATION_ERROR"),
            severity: validSeverity,
            status: validStatus,
            assignedTo: e.assigned_to ? String(e.assigned_to) : user.id,
            assignedToName: e.assigned_to_name,
            message: String(e.message || "Document requires review"),
            createdAt: e.created_at || new Date().toISOString(),
            resolvedAt: e.resolved_at || undefined,
            note:
              e.note ||
              (e.resolved_at
                ? `Resolved at ${e.resolved_at}`
                : e.details || undefined),
          };
        });
      }

      if (res.status === 404) {
        // Backend tenant-scoped /api/exceptions endpoint is not yet mounted.
        // Fallback: Aggregate genuine exceptions from documents in 'EXCEPTION' status via /result
        const docs = await getDocuments(user);
        const flaggedDocs = docs.filter((d) =>
          ["EXCEPTION", "IN_REVIEW"].includes(d.status),
        );
        if (!flaggedDocs.length) {
          return [];
        }
        const aggregated: Exception[] = [];
        for (const doc of flaggedDocs) {
          try {
            const detail = await api<BackendExtractionResult>(
              `/documents/${doc.id}/result`,
            );
            for (const ex of detail.exceptions || []) {
              const sev = String(ex.severity || "MEDIUM").toUpperCase();
              const validSeverity: ExceptionSeverity =
                sev === "HIGH" || sev === "LOW" ? sev : "MEDIUM";
              const st = String(ex.status || "OPEN").toUpperCase();
              const validStatus: ExceptionStatus =
                st === "RESOLVED" || st === "IN_REVIEW" || st === "ASSIGNED"
                  ? st
                  : "OPEN";
              aggregated.push({
                id: String(ex.id || `EXC-${doc.id}-${ex.exception_code || "GEN"}`),
                tenantId: String(ex.tenant_id || user.tenantId),
                documentId: String(doc.id),
                documentCode: doc.name,
                originalFilename: doc.name,
                type: String(ex.type || ex.exception_code || "VALIDATION_ERROR"),
                severity: validSeverity,
                status: validStatus,
                assignedTo: ex.assigned_to ? String(ex.assigned_to) : user.id,
                message: String(
                  ex.message || "Document requires accountant review",
                ),
                createdAt: ex.created_at || doc.createdAt,
                note: ex.resolved_at
                  ? `Resolved at ${ex.resolved_at}`
                  : ex.details || undefined,
              });
            }
          } catch {
            // Document result fetch failed
          }
        }
        return aggregated;
      }

      // If server returned non-404 error (e.g. 500, 401, 403), throw so user sees real error
      throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    } catch (err) {
      throw new Error(
        `Unable to retrieve tenant exceptions: ${(err as Error).message}`,
      );
    }
  }

  const docs = await getDocuments(user);
  return readDb().exceptions.filter(
    (e) =>
      docs.some((d) => d.id === e.documentId) &&
      (user.role !== "ACCOUNTANT" || e.assignedTo === user.id),
  );
}

export async function resolveException(
  user: User,
  documentId: string,
  note: string,
) {
  if (!note.trim())
    throw new Error("Add a correction note before revalidating.");
  return revalidateDocument(user, documentId, note);
}

export async function resolveExceptionDirect(
  user: User,
  exceptionId: string,
  note = "Resolved by accountant",
) {
  if (!isFrontendMockEnabled) {
    return api(
      `/exceptions/${exceptionId}`,
      { status: "resolved", note },
      "PATCH",
    );
  }
  mutate((db) => {
    const exception = db.exceptions.find((e) => e.id === exceptionId);
    if (!exception || exception.tenantId !== user.tenantId)
      throw new Error("Exception not found.");
    exception.status = "RESOLVED";
    if (note) exception.note = note;
  });
}

export async function assignException(
  user: User,
  exceptionId: string,
  userId: string,
) {
  if (!isFrontendMockEnabled) {
    return api(
      `/exceptions/${exceptionId}`,
      { assigned_to: userId, status: "assigned" },
      "PATCH",
    );
  }
  requireRole(user, ["LOCAL_ADMIN"]);
  mutate((db) => {
    const exception = db.exceptions.find((e) => e.id === exceptionId);
    const target = db.users.find(
      (u) =>
        u.id === userId &&
        u.tenantId === user.tenantId &&
        u.status === "ACTIVE",
    );
    if (!exception || exception.tenantId !== user.tenantId || !target)
      throw new Error("Invalid assignment.");
    exception.assignedTo = userId;
    exception.status = "ASSIGNED";
    db.documents.find((d) => d.id === exception.documentId)!.assignedTo =
      userId;
    log(db, user, "EXCEPTION_ASSIGNED", exception.documentId, target.name);
  });
}

export async function uploadDocument(
  user: User,
  file: Pick<File, "name" | "size" | "type"> | File,
  scenario = "",
  category: RecordCategory = "ACCOUNTS_PAYABLE",
  kind: DocumentKind = documentKindFromName(file.name),
): Promise<Document> {
  if (!isFrontendMockEnabled) {
    if (!/\.pdf$/i.test(file.name))
      throw new Error(
        "Unsupported format: Currently only PDF files (.pdf) are accepted for Docling neural extraction.",
      );

    if (file.size === 0) throw new Error("This file is empty.");
    if (file.size > 20 * 1024 * 1024)
      throw new Error("Maximum file size is 20 MB.");

    const formData = new FormData();
    formData.append("file", file as Blob, file.name);
    formData.append("kind", String(kind).toLowerCase());
    formData.append("category", String(category).toLowerCase());

    const res = await fetch("/api/documents/upload", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "AccountingIntelligence",
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Document upload failed.");
    }
    const data = await res.json();
    return {
      id: String(data.document_id),
      tenantId: String(data.tenant_id),
      ownerId: user.id,
      assignedTo: user.id,
      name: data.original_filename,
      type: (data.kind || "INVOICE").toUpperCase(),
      status: (data.status || "QUEUED").toUpperCase() as DocumentStatus,
      createdAt: data.uploaded_at,
      seconds: 0,
      scenario,
    };
  }

  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  assertActive(readDb(), user);
  if (!/\.(pdf|png|jpe?g|tiff?|xlsx|csv)$/i.test(file.name))
    throw new Error(
      "Supported formats: PDF, PNG, JPG, JPEG, TIFF, TIF, XLSX, CSV.",
    );
  if (file.size === 0) throw new Error("This file is empty.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Maximum file size is 20 MB.");
  return mutate((db) => {
    const doc: Document = {
      id: nextDocumentCode(db.documents.map((item) => item.id), kind),
      tenantId: user.tenantId!,
      ownerId: user.id,
      assignedTo: user.id,
      name: file.name,
      type: labelForKind(kind),
      status: "UPLOADED",
      createdAt: now(),
      seconds: 8.7,
      scenario,
    };
    db.documents.unshift(doc);
    const extraction = makeExtraction(
      doc.id,
      scenario,
      db.tenants.find((t) => t.id === user.tenantId)!.name,
      doc.type,
      doc.createdAt,
      category,
    );
    if (scenario === "duplicate") {
      const prior = db.extractions.find((e) =>
        db.documents.some(
          (d) =>
            d.id === e.documentId &&
            d.tenantId === user.tenantId &&
            d.id !== doc.id,
        ),
      );
      if (prior) extraction.fields.invoice.value = prior.fields.invoice.value;
    }
    db.extractions.push(extraction);
    log(db, user, "DOCUMENT_UPLOADED", doc.name, "Mock processing requested.");
    return doc;
  });
}

export async function advanceProcessing(
  user: User,
  documentId: string,
  status: "QUEUED" | "PROCESSING" | "EXTRACTED" | "FAILED",
) {
  if (!isFrontendMockEnabled) {
    // In real mode, processing is executed asynchronously by backend RQ worker
    return;
  }
  mutate((db) => {
    const doc = documentFor(db, user, documentId, true);
    doc.status = status;
    log(db, user, `DOCUMENT_${status}`, doc.name, "Simulated processing.");
  });
  if (status === "EXTRACTED") await revalidateDocument(user, documentId);
}

export async function getValidationRules(user: User): Promise<ValidationRules> {
  requireRole(user, ["LOCAL_ADMIN"]);
  return readDb().rules[user.tenantId!] ?? defaultRules;
}

export async function updateValidationRules(
  user: User,
  rules: ValidationRules,
): Promise<void> {
  requireRole(user, ["LOCAL_ADMIN"]);
  if (rules.threshold < 0 || rules.threshold > 100)
    throw new Error("Threshold must be between 0 and 100.");
  mutate((db) => {
    db.rules[user.tenantId!] = rules;
    log(
      db,
      user,
      "VALIDATION_RULES_UPDATED",
      user.tenantId!,
      "Company-specific rules saved.",
    );
  });
}

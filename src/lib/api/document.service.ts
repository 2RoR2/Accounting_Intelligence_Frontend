import type {
  Database,
  Document,
  Extraction,
  RecordCategory,
  User,
  ValidationResult,
  ValidationRules,
} from "@/types";
import { id, mutate, now, readDb } from "../mock/repository";
import type { DocumentKind } from "@/types";
import {
  defaultRules,
  documentKindFromName,
  labelForKind,
  makeExtraction,
  nextDocumentCode,
} from "../mock/seed";
import { assertActive, canDocument, requireRole } from "../permissions";
import { log } from "./audit.service";
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
export async function getDocuments(user: User) {
  assertActive(readDb(), user);
  return readDb().documents.filter((d) => canDocument(user, d));
}
export async function getDocument(user: User, documentId: string) {
  return documentFor(readDb(), user, documentId);
}
export async function getExtraction(user: User, documentId: string) {
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
    !!f.supplier.value.trim(),
    "Supplier name is required.",
  );
  add(
    rules.invoice,
    "Invoice Number Required",
    !!f.invoice.value.trim(),
    "Invoice number is required.",
  );
  add(
    rules.date,
    "Invoice Date",
    /^\d{4}-\d{2}-\d{2}$/.test(f.date.value) &&
      !Number.isNaN(Date.parse(f.date.value)),
    "Enter a valid invoice date.",
  );
  const values = ["subtotal", "tax", "discount", "total"].map((k) =>
    f[k].value.trim() === "" ? NaN : Number(f[k].value),
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
        e.fields.invoice.value === f.invoice.value &&
        e.fields.supplier.value === f.supplier.value,
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
export async function getValidationResults(user: User, documentId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  const db = readDb();
  return resultsFor(db, documentFor(db, user, documentId));
}
export async function updateExtractedField(
  user: User,
  documentId: string,
  key: string,
  value: string,
) {
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
) {
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
export async function getExceptions(user: User) {
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
export async function assignException(
  user: User,
  exceptionId: string,
  userId: string,
) {
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
  file: Pick<File, "name" | "size" | "type">,
  scenario: string,
  category: RecordCategory = "ACCOUNTS_PAYABLE",
  kind: DocumentKind = documentKindFromName(file.name),
) {
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
  mutate((db) => {
    const doc = documentFor(db, user, documentId, true);
    doc.status = status;
    log(db, user, `DOCUMENT_${status}`, doc.name, "Simulated processing.");
  });
  if (status === "EXTRACTED") await revalidateDocument(user, documentId);
}
export async function getValidationRules(user: User) {
  requireRole(user, ["LOCAL_ADMIN"]);
  return readDb().rules[user.tenantId!] ?? defaultRules;
}
export async function updateValidationRules(
  user: User,
  rules: ValidationRules,
) {
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

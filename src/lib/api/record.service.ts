import type { Extraction, StandardisedRecord, User } from "@/types";
import { id, mutate, now, readDb } from "../mock/repository";
import { assertActive, canDocument, requireRole } from "../permissions";
import { log } from "./audit.service";
import { isFrontendMockEnabled, getDocuments, getExtraction } from "./document.service";

export async function standardiseDocument(
  user: User,
  documentId: string,
  overrideDuplicate = false,
  overrideJustification = "",
): Promise<string> {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  if (!isFrontendMockEnabled) {
    const res = await fetch(`/api/documents/${documentId}/approve`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "AccountingIntelligence",
      },
      body: JSON.stringify({
        override_duplicate: overrideDuplicate,
        override_justification: overrideJustification,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Approval failed.");
    }
    const data = await res.json();
    return data.record_code || data.standardised_record_id || `REC-${documentId.slice(0, 8)}`;
  }
  return mutate((db) => {
    assertActive(db, user);
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc || !canDocument(user, doc) || doc.status !== "VALIDATED")
      throw new Error("Resolve all validation issues before standardising.");
    if (db.records.some((r) => r.documentId === documentId))
      throw new Error("This document already has a record.");
    const record = {
      id: id("REC"),
      documentId,
      tenantId: doc.tenantId,
      createdAt: now(),
      category:
        db.extractions.find((e) => e.documentId === documentId)?.fields
          .accountingCategory?.value === "Accounts Receivable"
          ? ("ACCOUNTS_RECEIVABLE" as const)
          : ("ACCOUNTS_PAYABLE" as const),
      validation: "PASSED" as const,
      status: "COMPLETED" as const,
      extraction: structuredClone(
        db.extractions.find((e) => e.documentId === documentId)!,
      ),
    };
    db.records.unshift(record);
    doc.status = "COMPLETED";
    log(db, user, "RECORD_STANDARDISED", doc.name, record.id, doc.tenantId);
    return record.id;
  });
}

export async function getStandardisedRecords(user: User): Promise<StandardisedRecord[]> {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  if (!isFrontendMockEnabled) {
    const docs = await getDocuments(user);
    const approved = docs.filter(
      (d) => d.status === "STANDARDISED" || d.status === "COMPLETED",
    );
    const records: StandardisedRecord[] = [];
    for (const doc of approved) {
      let extraction: Extraction = { documentId: doc.id, fields: {}, lineItems: [] };
      try {
        extraction = await getExtraction(user, doc.id);
      } catch {}
      records.push({
        id: `REC-${doc.id.slice(0, 8)}`,
        documentId: doc.id,
        tenantId: doc.tenantId,
        createdAt: doc.createdAt,
        category: "ACCOUNTS_PAYABLE",
        validation: "PASSED",
        status: "COMPLETED",
        extraction,
      });
    }
    return records;
  }
  assertActive(readDb(), user);
  const db = readDb();
  return db.records.filter((r) => {
    const doc = db.documents.find((d) => d.id === r.documentId);
    return doc && canDocument(user, doc);
  });
}

export async function getRecordMetadata(user: User, tenantId?: string) {
  requireRole(user, ["SUPER_ADMIN"]);
  return readDb()
    .records.filter((r) => !tenantId || r.tenantId === tenantId)
    .map((record) => ({
      id: record.id,
      documentId: record.documentId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      category: record.category,
      validation: record.validation,
      status: record.status,
      document: readDb().documents.find((d) => d.id === record.documentId),
    }));
}

export async function getStandardisedRecord(user: User, recordId: string) {
  return (await getStandardisedRecords(user)).find((r) => r.id === recordId);
}

export async function openSupportView(
  user: User,
  recordId: string,
  reason: string,
) {
  requireRole(user, ["SUPER_ADMIN"]);
  if (reason.trim().length < 5)
    throw new Error("Provide a support reason of at least 5 characters.");
  return mutate((db) => {
    const record = db.records.find((r) => r.id === recordId);
    if (!record) throw new Error("Record not found.");
    log(db, user, "SUPPORT_VIEW_ACCESSED", record.id, reason, record.tenantId);
    return structuredClone(record);
  });
}

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map(
          (value) =>
            `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`,
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

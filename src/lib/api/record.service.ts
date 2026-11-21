import type { Document, User } from "@/types";
import { requireRole } from "../permissions";
import { mapRecord, mapSupportView, type SupportViewResponse, type RecordResponse } from "./document-contract";
import { api, get } from "./client";
export async function standardiseDocument(user: User, documentId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  const record = await api<{ id: string }>(`/api/records/from-document/${documentId}`, { method: "POST" });
  if (!record || typeof record.id !== "string" || !record.id.trim()) {
    throw new Error("The server did not confirm a standardised record. Refresh records before trying again.");
  }
  return record.id;
}
/** Optional Today filters: unpaid items due in a window (needs `category`), or approved records not yet posted. */
export type RecordListFilter = { category?: string; due?: string; posting?: string; asOf?: string };
export async function getStandardisedRecords(user: User, filter: RecordListFilter = {}) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  const params = new URLSearchParams();
  if (filter.due) {
    params.set("due", filter.due);
    if (filter.category) params.set("category", filter.category);
    // The date the Today tile counted on, so the list is due/overdue as of that same day.
    if (filter.asOf) params.set("asOf", filter.asOf);
  }
  if (filter.posting) params.set("posting", filter.posting);
  const query = params.toString();
  return (await get<RecordResponse[]>(`/api/records${query ? `?${query}` : ""}`)).map(mapRecord);
}
export async function getRecordMetadata(user: User, tenantId?: string) {
  requireRole(user, ["SUPER_ADMIN"]);
  return get<Array<{ id: string; documentId: string; tenantId: string; createdAt: string; category: string; validation: string; status: string; document?: Document }>>(`/api/records/metadata${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ""}`);
}
export async function getStandardisedRecord(user: User, recordId: string) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  const record = await get<RecordResponse>(`/api/records/${encodeURIComponent(recordId)}`);
  return record && !Array.isArray(record) && record.id ? mapRecord(record) : undefined;
}
export async function openSupportView(
  user: User,
  recordId: string,
  reason: string,
) {
  requireRole(user, ["SUPER_ADMIN"]);
  if (reason.trim().length < 5)
    throw new Error("Provide a support reason of at least 5 characters.");
  return mapSupportView(await api<SupportViewResponse>(`/api/records/${recordId}/support-view`, { method: "POST", body: JSON.stringify({ reason }) }));
}
// A plain number such as -150.00 stays numeric in spreadsheets; anything else starting with a formula character is escaped.
const isNumericLiteral = (value: string) => /^-?\d+(\.\d+)?$/.test(value.trim());
export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map(
          (value) =>
            `"${(!isNumericLiteral(value) && /^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`,
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

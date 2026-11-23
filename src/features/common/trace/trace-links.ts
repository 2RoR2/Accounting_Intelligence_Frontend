import { DOCUMENT_LABELS, type DocumentType } from "@/lib/api/erp.service";
import { documentGroup, documentHref } from "@/features/common/erp/document-logic";

/** Where a traced or searched record opens, or null when the app has no page for it (a settlement). */
export function recordHref(
  base: string,
  record: { kind: string; type: string; id: string; amount?: string | null },
): string | null {
  const id = encodeURIComponent(record.id);
  switch (record.kind) {
    case "erp": {
      const group = documentGroup(record.type as DocumentType);
      return group ? documentHref(base, group, record.type as DocumentType, record.id) : null;
    }
    case "record": return `${base}/records/${id}`;
    case "upload": return `${base}/documents/${id}`;
    // The bank page opens the line when the address names it; money out is a negative amount.
    case "bank": return `${base}/${record.amount?.startsWith("-") ? "money-out" : "money-in"}?transaction=${id}`;
    // The journal list filters on the id, so the address lands on that one journal.
    case "journal": return `${base}/ledger?section=journals&q=${id}`;
    case "contact": return `${base}/contacts/${id}`;
    default: return null;
  }
}

const TYPE_LABELS: Record<string, string> = {
  "bank-transaction": "Bank line", settlement: "Settlement", journal: "Journal", reversal: "Reversal journal",
  bill: "bill", invoice: "invoice", receipt: "receipt", credit_note: "credit note", debit_note: "debit note",
  customer: "Customer", supplier: "Supplier", employee: "Employee",
};

/** `Invoice`, `Purchase payment`, `Bank line`, `Scanned bill` … for a trace node or search result. */
export function typeLabel(kind: string, type: string): string {
  if (kind === "erp") return DOCUMENT_LABELS[type as DocumentType] ?? type;
  if (kind === "upload") return `Uploaded ${TYPE_LABELS[type] ?? type}`;
  if (kind === "record") return `Scanned ${TYPE_LABELS[type] ?? type}`;
  return TYPE_LABELS[type] ?? type;
}

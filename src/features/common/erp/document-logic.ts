import {
  ALLOCATES_TO, AMOUNT_ONLY_TYPES, BANK_TYPES, DOCUMENT_LABELS, NOTE_TARGETS, POSTING_TYPES, PRINTED_TYPES, PURCHASE_TYPES,
  SALES_TYPES, TRANSFERS, type DocumentFile, type DocumentLine, type DocumentStatus, type DocumentType, type ErpDocument,
} from "@/lib/api/erp.service";
import type { User } from "@/types";

const DEFAULT_TYPES = { sales: "invoice", purchases: "bill", "bank-entries": "bank-transfer" } as const;
export type DocumentGroup = keyof typeof DEFAULT_TYPES;

const GROUP_TYPES: Record<DocumentGroup, readonly DocumentType[]> = {
  sales: SALES_TYPES,
  purchases: PURCHASE_TYPES,
  "bank-entries": BANK_TYPES,
};

export function resolveDocumentType(group: DocumentGroup, value: string | null): DocumentType | null {
  return value === null ? DEFAULT_TYPES[group] : GROUP_TYPES[group].find((type) => type === value) ?? null;
}

export function documentGroup(type: DocumentType): DocumentGroup | undefined {
  return (Object.keys(DEFAULT_TYPES) as DocumentGroup[]).find((group) => GROUP_TYPES[group].includes(type));
}

export function documentHref(base: string, group: DocumentGroup, type: DocumentType, id?: string) {
  return `${base}/${group}${id ? `/${encodeURIComponent(id)}` : ""}?type=${encodeURIComponent(type)}`;
}

/** Open items: they carry an outstanding balance and a payment status. */
export function hasOutstanding(type: DocumentType) {
  return type === "invoice" || type === "bill" || type === "debit-note" || type === "purchase-debit-note";
}

export const DOCUMENT_STATUSES: Record<DocumentStatus | "approved", string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  ready: "Ready",
  sent: "Sent",
  accepted: "Accepted",
  expired: "Expired",
  void: "Void",
  approved: "Approved (scanned)",
};

/** A printed document that is ready has been issued (posted and its PDF copy stored). */
export function documentStatusLabel(status: DocumentStatus | "approved", type: DocumentType) {
  return status === "ready" && PRINTED_TYPES.has(type) ? "Issued" : DOCUMENT_STATUSES[status];
}

/** The statuses a list of this type can filter by. */
export function statusFilterOptions(type: DocumentType, showsScanned: boolean): (DocumentStatus | "approved")[] {
  if (type === "quotation") return ["draft", "sent", "accepted", "expired", "void"];
  return ["draft", "pending_approval", "ready", "void", ...(showsScanned ? ["approved" as const] : [])];
}

export const ONLY_ADMIN_ISSUES = "Only a company admin can issue";

export type DocumentAction = { kind: "save" | "delete" | "duplicate" | "preview" | "print" | "download"; label: string }
  | { kind: "transition"; label: string; status: DocumentStatus; disabledReason?: string }
  | { kind: "transfer"; label: string; target: DocumentType };

const save = { kind: "save", label: "Save" } as const;
const duplicate = { kind: "duplicate", label: "Duplicate" } as const;
const remove = { kind: "delete", label: "Delete" } as const;
const preview = { kind: "preview", label: "Preview PDF" } as const;
const printCopy = [{ kind: "print", label: "Print" }, { kind: "download", label: "Download PDF" }] as const;
const voidAction = { kind: "transition", status: "void", label: "Void" } as const;
const transition = (status: DocumentStatus, label: string): DocumentAction => ({ kind: "transition", status, label });
const transfer = (target: DocumentType, label: string): DocumentAction => ({ kind: "transfer", target, label });

/** Plan M: a quotation is sent (by an accountant or admin), then accepted, expired or converted to an invoice. */
function quotationActions(status: DocumentStatus): DocumentAction[] {
  switch (status) {
    case "draft": return [save, preview, transition("sent", "Send"), remove];
    case "sent": return [transition("accepted", "Mark accepted"), transition("expired", "Mark expired"),
      transfer("invoice", "Convert to invoice"), voidAction, ...printCopy, duplicate];
    case "accepted": return [transfer("invoice", "Convert to invoice"), voidAction, ...printCopy, duplicate];
    case "expired": return [transition("sent", "Send again"), voidAction, ...printCopy, duplicate];
    case "void": return [...printCopy, duplicate];
    default: return [duplicate];
  }
}

const ISSUED_TRANSFERS: Partial<Record<DocumentType, DocumentAction[]>> = {
  invoice: [transfer("payment", "Receive payment"), transfer("credit-note", "Credit note"), transfer("debit-note", "Debit note")],
  "debit-note": [transfer("payment", "Receive payment"), transfer("credit-note", "Credit note")],
  "delivery-order": [transfer("invoice", "Turn into invoice")],
};

/** Printed sales documents: edited only as drafts; only the company admin issues or voids them. */
function printedActions(status: DocumentStatus, type: DocumentType, admin: boolean): DocumentAction[] {
  const issue: DocumentAction = admin ? transition("ready", "Issue")
    : { kind: "transition", status: "ready", label: "Issue", disabledReason: ONLY_ADMIN_ISSUES };
  switch (status) {
    case "draft": return [save, preview, transition("pending_approval", "Submit for approval"), issue, remove];
    case "pending_approval": return [preview, transition("draft", "Back to draft"), issue];
    case "ready": return [...ISSUED_TRANSFERS[type] ?? [], ...(admin ? [voidAction] : []), ...printCopy, duplicate];
    case "void": return [...printCopy, duplicate];
    default: return [duplicate];
  }
}

export function documentActions(status: DocumentStatus, type: DocumentType, role: User["role"]): DocumentAction[] {
  const admin = role === "LOCAL_ADMIN";
  if (!admin && role !== "ACCOUNTANT") return [];
  if (type === "quotation") return quotationActions(status);
  if (PRINTED_TYPES.has(type)) return printedActions(status, type, admin);
  const posts = POSTING_TYPES.has(type);

  switch (status) {
    case "draft":
      return [
        save,
        { kind: "transition", status: "pending_approval", label: "Submit for approval" },
        ...(admin ? [{ kind: "transition", status: "ready", label: posts ? "Post to ledger" : "Mark ready" } as const] : []),
        remove,
      ];
    case "pending_approval":
      return [
        save,
        { kind: "transition", status: "draft", label: "Back to draft" },
        ...(admin ? [{ kind: "transition", status: "ready", label: posts ? "Approve and post" : "Approve" } as const] : []),
      ];
    case "ready":
      return [
        ...(admin ? [voidAction] : []),
        duplicate,
        ...(TRANSFERS[type] ?? []).map((target) => transfer(target, `Turn into ${DOCUMENT_LABELS[target].toLowerCase()}`)),
      ];
    default:
      return [duplicate];
  }
}

/** The latest stored printed copy (the void copy once voided), or undefined before the document is issued. */
export function latestFile(files: readonly DocumentFile[] | undefined) {
  return files?.reduce<DocumentFile | undefined>((latest, file) => !latest || file.revision > latest.revision ? file : latest, undefined);
}

export function fileReasonLabel(reason: DocumentFile["reason"]) {
  return reason === "void" ? "Void" : "Issued";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function decimalParts(value: string) {
  const [, sign, whole, fraction = "", exponent = "0"] =
    /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.trim()) ?? [];
  const scale = fraction.length - Number(exponent);
  if ((!whole && !fraction) || Math.abs(scale) > 400) return { units: 0n, scale: 0 };
  return { units: BigInt(`${sign}${whole}${fraction}`), scale };
}

/** Round an exact decimal to cents before it participates in a sum. */
function roundToCents(units: bigint, scale: number): bigint {
  if (scale <= 2) return units * 10n ** BigInt(2 - scale);
  const divisor = 10n ** BigInt(scale - 2);
  const magnitude = units < 0n ? -units : units;
  const rounded = (magnitude + divisor / 2n) / divisor;
  return units < 0n ? -rounded : rounded;
}

export function amountInCents(value: string) {
  const { units, scale } = decimalParts(value);
  return roundToCents(units, scale);
}

export function decimalAmount(cents: bigint) {
  const magnitude = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, "0")}`;
}

export function documentTotals(type: DocumentType, lines: readonly DocumentLine[], amount = "0") {
  if (AMOUNT_ONLY_TYPES.has(type)) {
    const total = decimalAmount(amountInCents(amount));
    return { subtotal: total, tax: "0.00", total };
  }
  let subtotal = 0n;
  let tax = 0n;
  for (const line of lines) {
    const quantity = decimalParts(line.quantity);
    const price = decimalParts(line.unitPrice);
    subtotal += roundToCents(quantity.units * price.units, quantity.scale + price.scale) - amountInCents(line.discount ?? "0");
    tax += amountInCents(line.tax ?? "0");
  }
  return { subtotal: decimalAmount(subtotal), tax: decimalAmount(tax), total: decimalAmount(subtotal + tax) };
}

export function acceptsScannedAllocations(type: DocumentType) {
  return type === "payment" || type === "purchase-payment";
}

type AllocationCandidate = Pick<ErpDocument, "type" | "source" | "status" | "outstanding" | "contactId" | "contactName">;

export function allocationCandidates<T extends AllocationCandidate>(
  type: DocumentType, contact: { id: string; legalName: string }, rows: readonly T[],
): T[] {
  const targets: readonly DocumentType[] = ALLOCATES_TO[type] ?? [];
  const name = contact.legalName.trim().toLowerCase();
  return rows.filter((row) => {
    if (!targets.includes(row.type) || amountInCents(row.outstanding ?? "0") <= 0n) return false;
    if (row.source === "typed") return row.status === "ready" && row.contactId === contact.id;
    // Scanned documents settle only through the invoice or bill list.
    return acceptsScannedAllocations(type) && row.type === targets[0] && !!name && row.contactName?.trim().toLowerCase() === name;
  });
}

/** What a credit or debit note can correct: issued typed invoices / bills (or debit notes) of the same contact. */
export function noteTargetCandidates<T extends Pick<ErpDocument, "type" | "source" | "status" | "contactId">>(
  type: DocumentType, contactId: string, rows: readonly T[],
): T[] {
  const targets = NOTE_TARGETS[type] ?? [];
  return rows.filter((row) => row.source === "typed" && row.status === "ready" && !!contactId && row.contactId === contactId
    && targets.includes(row.type));
}

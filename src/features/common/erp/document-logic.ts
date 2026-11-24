import {
  ALLOCATES_TO, AMOUNT_ONLY_TYPES, BANK_TYPES, DOCUMENT_LABELS, NOTE_TARGETS, POSTING_TYPES, PRINTED_TYPES, PURCHASE_TYPES,
  SALES_TYPES, SCANNED_LIST_TYPES, TRANSFERS, type DeliveryRecord, type DocumentFile, type DocumentLine, type DocumentStatus,
  type DocumentType, type ErpDocument,
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

/** Types whose name is already a plural or a mass noun: the list title and sentences use the label as it is. */
const UNCOUNTED_TYPES: ReadonlySet<DocumentType> = new Set(["goods-received", "money-in", "money-out"]);

/** The list title: "Invoices", but "Goods received". */
export function documentListTitle(type: DocumentType) {
  const label = DOCUMENT_LABELS[type];
  return UNCOUNTED_TYPES.has(type) ? label : `${label}s`;
}

/** What an empty list says to do next. Only bills and supplier credit notes also list approved scanned documents. */
export function emptyListHint(type: DocumentType) {
  const noun = documentListTitle(type).toLowerCase();
  if (type === "payment") return `No ${noun} yet. Record one against an invoice with New.`;
  if (type === "purchase-payment") return `No ${noun} yet. Record one against a bill with New.`;
  if ((SALES_TYPES as readonly string[]).includes(type)) return `No ${noun} yet. Create one with New: what you issue is typed here, not uploaded.`;
  if (type === "bank-transfer") return "No transfers yet. Record a move between your own bank accounts with New.";
  if (SCANNED_LIST_TYPES.has(type)) return `No ${noun} yet. Captured documents appear here after you approve them in the Inbox, or create one with New.`;
  return `No ${noun} yet. Create one with New, or turn an earlier document into one.`;
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
  if (status === "ready" && type === "sales-order") return "Confirmed";
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
/** On a printed document Save only keeps an editable draft; the label says so (Send / Issue is the step that counts). */
const saveDraft = { kind: "save", label: "Save draft" } as const;
const duplicate = { kind: "duplicate", label: "Duplicate" } as const;
const remove = { kind: "delete", label: "Delete" } as const;
const preview = { kind: "preview", label: "Preview PDF" } as const;
const printCopy = [{ kind: "print", label: "Print" }, { kind: "download", label: "Download PDF" }] as const;
const voidAction = { kind: "transition", status: "void", label: "Void" } as const;
const transition = (status: DocumentStatus, label: string): DocumentAction => ({ kind: "transition", status, label });
const transfer = (target: DocumentType, label: string): DocumentAction => ({ kind: "transfer", target, label });

/** A sent or accepted quotation becomes a sales order, a delivery order (deliver first) or an invoice, nothing retyped. */
const QUOTATION_CONVERSIONS = [transfer("sales-order", "Convert to sales order"),
  transfer("delivery-order", "Convert to delivery order"), transfer("invoice", "Convert to invoice")];

/** Plan M: a quotation is sent (by an accountant or admin), then accepted, expired or converted to an invoice. */
function quotationActions(status: DocumentStatus): DocumentAction[] {
  switch (status) {
    case "draft": return [saveDraft, preview, transition("sent", "Send"), remove];
    case "sent": return [transition("accepted", "Mark accepted"), transition("expired", "Mark expired"),
      ...QUOTATION_CONVERSIONS, voidAction, ...printCopy, duplicate];
    case "accepted": return [...QUOTATION_CONVERSIONS, voidAction, ...printCopy, duplicate];
    case "expired": return [transition("sent", "Send again"), voidAction, ...printCopy, duplicate];
    case "void": return [...printCopy, duplicate];
    default: return [duplicate];
  }
}

const ISSUED_TRANSFERS: Partial<Record<DocumentType, DocumentAction[]>> = {
  invoice: [transfer("payment", "Receive payment"), transfer("credit-note", "Credit note"), transfer("debit-note", "Debit note"),
    transfer("delivery-order", "Delivery order")],
  "debit-note": [transfer("payment", "Receive payment"), transfer("credit-note", "Credit note")],
  "sales-order": [transfer("delivery-order", "Create delivery order"), transfer("invoice", "Create invoice")],
  "delivery-order": [transfer("invoice", "Create invoice")],
};

/** Printed sales documents: edited only as drafts; only the company admin issues or voids them. */
function printedActions(status: DocumentStatus, type: DocumentType, admin: boolean): DocumentAction[] {
  const verb = issueLabel(type);
  const issue: DocumentAction = admin ? transition("ready", verb)
    : { kind: "transition", status: "ready", label: verb, disabledReason: ONLY_ADMIN_ISSUES };
  switch (status) {
    case "draft": return [saveDraft, preview, transition("pending_approval", "Submit for approval"), issue, remove];
    case "pending_approval": return [preview, transition("draft", "Back to draft"), issue];
    case "ready": return [...ISSUED_TRANSFERS[type] ?? [], ...(admin ? [voidAction] : []), ...printCopy, duplicate];
    case "void": return [...printCopy, duplicate];
    default: return [duplicate];
  }
}

/**
 * What the user can do with a document in this state. Pass the open item's `outstanding` amount when it is known:
 * once nothing is left to pay, "Receive payment" / "Turn into supplier payment" are not offered (the API would refuse
 * with "has nothing outstanding").
 */
export function documentActions(status: DocumentStatus, type: DocumentType, role: User["role"], outstanding?: string | null): DocumentAction[] {
  const actions = actionsFor(status, type, role);
  if (outstanding == null || amountInCents(outstanding) > 0n) return actions;
  return actions.filter((action) => !(action.kind === "transfer" && MONEY_TARGETS.has(action.target)));
}

const MONEY_TARGETS: ReadonlySet<DocumentType> = new Set(["payment", "purchase-payment"]);

function actionsFor(status: DocumentStatus, type: DocumentType, role: User["role"]): DocumentAction[] {
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

/** The word for the step that freezes a printed document: a quotation is sent, a sales order confirmed, the rest issued. */
export function issueLabel(type: DocumentType) {
  return type === "quotation" ? "Send" : type === "sales-order" ? "Confirm" : "Issue";
}

/** What Save draft and Send / Confirm / Issue do, in one line under the title of an editable printed document. */
export function draftExplainer(type: DocumentType, admin: boolean) {
  const verb = issueLabel(type);
  const frozen = `${verb} freezes it and stores its PDF, which never changes`;
  const after = type === "quotation" || type === "sales-order" || type === "delivery-order"
    ? "; it never posts to the ledger." : POSTING_TYPES.has(type) ? ", and posts it to the ledger." : ".";
  const who = type !== "quotation" && !admin ? ` Only the company admin can ${verb.toLowerCase()}; you submit it for approval.` : "";
  return `Draft: only your team can see it. Save draft keeps it editable (the first save takes the next number). ${frozen}${after}${who}`;
}

/** How long a quotation's prices hold by default (its due date is its validity). */
export const QUOTATION_VALID_DAYS = 30;

const DAY_MS = 86_400_000;
function isoDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
}

/** The note a sent quotation shows in lists: soon to expire, or past its valid-until date (it is not expired by itself). */
export function quotationValidity(validUntil: string | null | undefined, status: string, today: string) {
  if (status !== "sent" || !validUntil) return null;
  const days = Math.round((isoDay(validUntil) - isoDay(today)) / DAY_MS);
  if (Number.isNaN(days)) return null;
  if (days < 0) return { tone: "danger" as const, label: "Past its valid-until date" };
  if (days === 0) return { tone: "warning" as const, label: "Expires today" };
  if (days <= 3) return { tone: "warning" as const, label: `Expires in ${days} day${days === 1 ? "" : "s"}` };
  return null;
}

/** The delivery record an issued delivery order keeps once the customer has signed for it. */
export function deliveryRecord(fields: Record<string, unknown> | undefined | null): DeliveryRecord | null {
  const value = fields?.delivered;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.receivedBy === "string" && typeof record.receivedOn === "string"
    ? { receivedBy: record.receivedBy, receivedOn: record.receivedOn, note: typeof record.note === "string" ? record.note : null }
    : null;
}

type DuplicateRow = Pick<ErpDocument, "id" | "number" | "status" | "source" | "referenceNo" | "documentDate" | "amount">;

/** The server's duplicate rule, applied while typing: same contact and type (the caller lists those), and the same
 * reference, or the same total on the same date. A warning only; void documents and this one do not count. */
export function liveDuplicates(rows: readonly DuplicateRow[], current: {
  id?: string | null; referenceNo: string; documentDate: string; total: string;
}) {
  const reference = current.referenceNo.trim().toLowerCase();
  const total = amountInCents(current.total || "0");
  return rows.flatMap((row) => {
    if (row.source !== "typed" || row.status === "void" || row.id === current.id) return [];
    if (reference && (row.referenceNo ?? "").trim().toLowerCase() === reference) return [{ id: row.id, number: row.number, reason: "same reference" }];
    if (total > 0n && row.documentDate === current.documentDate && amountInCents(row.amount) === total) {
      return [{ id: row.id, number: row.number, reason: "same amount and date" }];
    }
    return [];
  });
}

export type LastPrice = { unitPrice: string; number: string; documentDate: string | null };

/** The latest unit price this contact was charged for each product, from their earlier documents (newest first). */
export function lastPrices(rows: readonly ErpDocument[], currentId?: string | null): Map<string, LastPrice> {
  const prices = new Map<string, LastPrice>();
  const ordered = [...rows].filter((row) => row.source === "typed" && row.status !== "void" && row.status !== "draft" && row.id !== currentId)
    .sort((a, b) => (b.documentDate ?? "").localeCompare(a.documentDate ?? ""));
  for (const row of ordered) {
    if (row.source !== "typed") continue;
    for (const line of row.lines ?? []) {
      if (line.itemId && !prices.has(line.itemId)) prices.set(line.itemId, { unitPrice: line.unitPrice, number: row.number, documentDate: row.documentDate ?? null });
    }
  }
  return prices;
}

/** Reminders on the Send / Confirm / Issue step. None blocks; the server still refuses what it must. */
export function issueChecklist(type: DocumentType, draft: {
  contactId: string; lines: readonly DocumentLine[]; dueDate: string; attention: string; deliveryAddress: string;
}) {
  const notes: string[] = [];
  if (!draft.contactId) notes.push("No customer is chosen.");
  if (!draft.lines.length) notes.push("There are no lines.");
  if (type === "quotation" && !draft.dueDate) notes.push("No valid-until date: the customer will not see how long the prices hold.");
  if (hasOutstanding(type) && !draft.dueDate) notes.push("No due date.");
  if (SALES_TYPES.includes(type as never) && PRINTED_TYPES.has(type) && type !== "payment" && !draft.attention.trim()) {
    notes.push("No attention person.");
  }
  if (type === "delivery-order" && !draft.deliveryAddress.trim()) notes.push("No delivery address: the billing address will print.");
  if (draft.lines.some((line) => line.taxCode && !(line.tax ?? "").trim())) {
    notes.push("A line has a tax code but no tax amount. Type it as printed; nothing is calculated.");
  }
  return notes;
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

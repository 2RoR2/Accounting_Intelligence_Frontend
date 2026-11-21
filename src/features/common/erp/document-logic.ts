import {
  ALLOCATES_TO, AMOUNT_ONLY_TYPES, BANK_TYPES, DOCUMENT_LABELS, POSTING_TYPES, PURCHASE_TYPES, SALES_TYPES, TRANSFERS,
  type DocumentLine, type DocumentStatus, type DocumentType, type ErpDocument,
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

export function hasOutstanding(type: DocumentType) {
  return type === "invoice" || type === "bill";
}

export const DOCUMENT_STATUSES: Record<DocumentStatus | "approved", string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  ready: "Ready",
  void: "Void",
  approved: "Approved (scanned)",
};

export type DocumentAction = { kind: "save" | "delete" | "duplicate"; label: string }
  | { kind: "transition"; label: string; status: DocumentStatus }
  | { kind: "transfer"; label: string; target: DocumentType };

export function documentActions(status: DocumentStatus, type: DocumentType, role: User["role"]): DocumentAction[] {
  const admin = role === "LOCAL_ADMIN";
  if (!admin && role !== "ACCOUNTANT") return [];
  const posts = POSTING_TYPES.has(type);
  const save = { kind: "save", label: "Save" } as const;
  const duplicate = { kind: "duplicate", label: "Duplicate" } as const;

  switch (status) {
    case "draft":
      return [
        save,
        { kind: "transition", status: "pending_approval", label: "Submit for approval" },
        ...(admin ? [{ kind: "transition", status: "ready", label: posts ? "Post to ledger" : "Mark ready" } as const] : []),
        { kind: "delete", label: "Delete" },
      ];
    case "pending_approval":
      return [
        save,
        { kind: "transition", status: "draft", label: "Back to draft" },
        ...(admin ? [{ kind: "transition", status: "ready", label: posts ? "Approve and post" : "Approve" } as const] : []),
      ];
    case "ready":
      return [
        ...(admin ? [{ kind: "transition", status: "void", label: "Void" } as const] : []),
        duplicate,
        ...(TRANSFERS[type] ?? []).map((target) => ({
          kind: "transfer" as const, target, label: `Turn into ${DOCUMENT_LABELS[target].toLowerCase()}`,
        })),
      ];
    case "void":
      return [duplicate];
  }
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
  const target = ALLOCATES_TO[type];
  const name = contact.legalName.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.type !== target || amountInCents(row.outstanding ?? "0") <= 0n) return false;
    if (row.source === "typed") return row.status === "ready" && row.contactId === contact.id;
    return acceptsScannedAllocations(type) && !!name && row.contactName?.trim().toLowerCase() === name;
  });
}

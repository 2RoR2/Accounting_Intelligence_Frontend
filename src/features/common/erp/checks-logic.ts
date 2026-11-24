import type { CheckFinding, CheckSeverity, CheckSuggestion } from "@/lib/api/checks.service";
import type { DocumentLine, DocumentType } from "@/lib/api/erp.service";

/** The typed documents the check engine looks at (services/routes/erp/checks.py CHECKED_TYPES). */
export const CHECKED_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>([
  "quotation", "sales-order", "delivery-order", "invoice", "credit-note", "debit-note",
  "purchase-order", "bill", "purchase-credit-note", "purchase-debit-note",
]);

/** Supplier documents typed from paper: the total printed on them is typed too, and checked against the lines. */
export const PRINTED_TOTAL_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>(["bill", "purchase-credit-note", "purchase-debit-note"]);

/** How long the form waits after the last keystroke before it checks again. */
export const CHECK_DELAY_MS = 600;

const SEVERITY_RANK: Record<CheckSeverity, number> = { block: 0, warn: 1, info: 2 };

/** One finding's identity for Ignore: the rule, the field and the line (a changed value keeps it ignored). */
export function findingKey(finding: Pick<CheckFinding, "code" | "field" | "lineIndex">) {
  return `${finding.code}:${finding.field}:${finding.lineIndex ?? ""}`;
}

/** Open findings (most severe first) and the ones the user chose to ignore. */
export function partitionFindings(findings: readonly CheckFinding[], ignored: ReadonlySet<string>) {
  const sorted = [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || (a.lineIndex ?? -1) - (b.lineIndex ?? -1));
  return { open: sorted.filter((f) => !ignored.has(findingKey(f))), ignored: sorted.filter((f) => ignored.has(findingKey(f))) };
}

/** What the Send / Issue confirm step lists: open blocks and warnings, not notes. */
export function openWarnings(findings: readonly CheckFinding[], ignored: ReadonlySet<string>) {
  return partitionFindings(findings, ignored).open.filter((f) => f.severity !== "info");
}

export function summaryLabel(findings: readonly CheckFinding[]) {
  const count = (severity: CheckSeverity) => findings.filter((f) => f.severity === severity).length;
  const parts: string[] = [];
  const blocks = count("block");
  const warnings = count("warn");
  const notes = count("info");
  if (blocks) parts.push(`${blocks} to fix before saving`);
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  if (notes) parts.push(`${notes} note${notes === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "No issues found";
}

/** The element a finding points at: the line section, or the header field. */
export function checkTarget(finding: Pick<CheckFinding, "field" | "lineIndex">) {
  return finding.lineIndex !== undefined && finding.lineIndex !== null ? `check-line-${finding.lineIndex}` : `check-field-${finding.field}`;
}

/** The worst open severity per target and, for lines, per field ("check-line-0:unitPrice"), for highlighting. */
export function flaggedTargets(findings: readonly CheckFinding[], ignored: ReadonlySet<string>) {
  const flags = new Map<string, CheckSeverity>();
  const mark = (key: string, severity: CheckSeverity) => {
    const current = flags.get(key);
    if (!current || SEVERITY_RANK[severity] < SEVERITY_RANK[current]) flags.set(key, severity);
  };
  for (const finding of partitionFindings(findings, ignored).open) {
    if (finding.severity === "info") continue;
    const target = checkTarget(finding);
    mark(target, finding.severity);
    if (finding.lineIndex !== undefined) mark(`${target}:${finding.field}`, finding.severity);
  }
  return flags;
}

const LINE_FIELDS = new Set(["unitPrice", "quantity", "description", "discount"]);
const HEADER_FIELDS = new Set(["dueDate"]);

/** Whether the form can apply this suggestion (a printed line amount, for example, is not a form field). */
export function canApply(suggestion: CheckSuggestion | undefined): boolean {
  if (!suggestion) return false;
  return suggestion.lineIndex !== undefined ? LINE_FIELDS.has(suggestion.field) : HEADER_FIELDS.has(suggestion.field);
}

export type AppliedChange =
  | { kind: "line"; key: number; changes: Partial<DocumentLine> }
  | { kind: "header"; changes: { dueDate: string; dueDateAuto: false } };

/** The form line keys in the order the lines are sent (blank lines dropped). */
export function sentLineKeys(lines: readonly { key: number; value: DocumentLine }[], isBlank: (line: DocumentLine) => boolean) {
  return lines.filter(({ value }) => !isBlank(value)).map(({ key }) => key);
}

/**
 * The change Apply makes, on the user's click only. Line indexes count the lines sent to the server (blank lines are
 * left out), so they are mapped back to the form's line keys. Null when it cannot be applied or the line is gone.
 */
export function applySuggestion(suggestion: CheckSuggestion, lines: readonly { key: number; value: DocumentLine }[],
  isBlank: (line: DocumentLine) => boolean): AppliedChange | null {
  if (!canApply(suggestion)) return null;  // also covers a missing field
  if (suggestion.lineIndex === undefined) return { kind: "header", changes: { dueDate: suggestion.value, dueDateAuto: false } };
  const key = sentLineKeys(lines, isBlank)[suggestion.lineIndex];
  if (key === undefined) return null;
  return { kind: "line", key, changes: { [suggestion.field]: suggestion.value } as Partial<DocumentLine> };
}

// ------------------------------------------------------------------ unsaved drafts kept on this device

export type StoredDraft<T> = { savedAt: string; baseUpdatedAt: string | null; draft: T };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function draftStorageKey(type: DocumentType, id?: string | null) {
  return `accordai:unsaved:${type}:${id ?? "new"}`;
}

/** localStorage, or null where it is blocked (private mode, disabled site data). */
export function deviceStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function keepDraft<T>(storage: StorageLike | null, key: string, draft: T, baseUpdatedAt: string | null, now = new Date()) {
  try {
    const stored: StoredDraft<T> = { savedAt: now.toISOString(), baseUpdatedAt, draft };
    storage?.setItem(key, JSON.stringify(stored));
    return !!storage;
  } catch {
    return false;  // full or blocked storage: the form still works, it just cannot keep a copy
  }
}

export function readDraft<T>(storage: StorageLike | null, key: string): StoredDraft<T> | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    return parsed && typeof parsed === "object" && "draft" in parsed && typeof parsed.savedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetDraft(storage: StorageLike | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clear
  }
}

/** Whether a link click leaves this page inside the app (and so should ask first while there are unsaved changes). */
export function leavesPage(anchor: { href: string; target?: string; download?: boolean },
  current: { origin: string; pathname: string; search: string }) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.download) return false;
  try {
    const url = new URL(anchor.href, current.origin);
    return url.origin === current.origin && (url.pathname !== current.pathname || url.search !== current.search);
  } catch {
    return false;
  }
}

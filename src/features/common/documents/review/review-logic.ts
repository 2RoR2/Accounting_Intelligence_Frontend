/**
 * Side-by-side review (plan v3 task B4b, spec P2.3): the rules behind the screen, kept free of React so they
 * can be unit tested. Which fields need the accountant, in what order the keyboard visits them, where a field's
 * evidence sits on the page, and which document opens next.
 */
import { fieldGroup } from "@/lib/api/document-contract";
import type { Document, ExtractedField, SourceEvidence } from "@/types";

export type ReviewSignal = "verified" | "check" | "suggestion" | "missing";

/** What the accountant reads beside each field. Plain words, never a score. */
export const SIGNAL_TEXT: Record<ReviewSignal, string> = {
  verified: "Read from the document",
  check: "Please check",
  suggestion: "Suggested",
  missing: "Not found",
};

const SIGNALS = new Set<string>(Object.keys(SIGNAL_TEXT));

/** Older stored results have no `reviewSignal`; map their evidence status the same way the backend does. */
const FROM_EVIDENCE: Record<string, ReviewSignal> = {
  source_backed: "verified",
  human_corrected: "verified",
  model_source_verified: "suggestion",
  model_suggested: "suggestion",
  ambiguous_candidate: "suggestion",
  missing: "missing",
  conflicting: "check",
  unsupported: "check",
};

type SignalInput = Pick<ExtractedField, "reviewSignal" | "evidenceStatus" | "state" | "correctedBy">;

/** True when a failed validation check names this field (the check may use an alias such as invoice_number). */
export function failedCheckNames(key: string, failedFields: Iterable<string>) {
  // fieldGroup resolves the aliases; a source-backed, uncorrected field is "attention" only when a check failed on it.
  return fieldGroup(key, { evidenceStatus: "source_backed", correctedBy: null }, failedFields) === "attention";
}

/**
 * The signal shown for one field. A person's correction settles it; a failed check on the field always asks for a check,
 * whatever the reading said; otherwise the backend's `reviewSignal`, else the evidence status, else the extraction state.
 */
export function fieldSignal(key: string, field: SignalInput, failedFields: Iterable<string> = []): ReviewSignal {
  if (field.correctedBy) return "verified";
  if (failedCheckNames(key, failedFields)) return "check";
  if (field.reviewSignal && SIGNALS.has(field.reviewSignal)) return field.reviewSignal;
  if (field.evidenceStatus && FROM_EVIDENCE[field.evidenceStatus]) return FROM_EVIDENCE[field.evidenceStatus];
  if (field.state === "resolved") return "verified";
  if (field.state === "missing") return "missing";
  return "check";
}

export const needsAttention = (signal: ReviewSignal) => signal !== "verified";

const SIGNAL_RANK: Record<ReviewSignal, number> = { check: 0, suggestion: 1, missing: 2, verified: 3 };

export interface ReviewEntry { key: string; signal: ReviewSignal }

/** Fields in review order: "Please check" first, then suggestions, then not found, then read fields. Stable within each group. */
export function reviewOrder(fields: Record<string, SignalInput>, failedFields: Iterable<string> = []): ReviewEntry[] {
  const failed = [...failedFields];
  return Object.entries(fields)
    .map(([key, field], index) => ({ key, signal: fieldSignal(key, field, failed), index }))
    .sort((a, b) => SIGNAL_RANK[a.signal] - SIGNAL_RANK[b.signal] || a.index - b.index)
    .map(({ key, signal }) => ({ key, signal }));
}

/**
 * The fields on screen. With "Only fields to check" on, read fields are hidden, except those in `keep`: fields that needed
 * a check when the document opened stay in place after the accountant corrects them, so the list does not jump.
 */
export function visibleEntries(order: ReviewEntry[], onlyToCheck: boolean, keep: ReadonlySet<string> = new Set()) {
  return onlyToCheck ? order.filter(entry => needsAttention(entry.signal) || keep.has(entry.key)) : order;
}

/** Tab / Shift+Tab: the next or previous field in `keys`, or null at either end (focus then leaves the list normally). */
export function stepField(keys: readonly string[], current: string | undefined, direction: 1 | -1): string | null {
  if (!keys.length) return null;
  const index = current ? keys.indexOf(current) : -1;
  if (index < 0) return direction === 1 ? keys[0] : keys[keys.length - 1];
  return keys[index + direction] ?? null;
}

export type ReviewShortcut = "submit" | "next-document" | "previous-document" | "next-field" | "previous-field" | "accept";

/** The review page's keyboard shortcuts. Field keys (Tab, Enter) apply only inside a field's input. */
export function reviewShortcut(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }, inField = false): ReviewShortcut | null {
  const command = !!(event.ctrlKey || event.metaKey);
  if (event.key === "Enter" && command && !event.altKey) return "submit";
  if (event.altKey && !command && !event.shiftKey && event.key === "ArrowRight") return "next-document";
  if (event.altKey && !command && !event.shiftKey && event.key === "ArrowLeft") return "previous-document";
  if (!inField || command || event.altKey) return null;
  if (event.key === "Tab") return event.shiftKey ? "previous-field" : "next-field";
  if (event.key === "Enter" && !event.shiftKey) return "accept";
  return null;
}

/** The value Enter accepts: a value printed on the document first, then a suggested one. Never invented. */
export function suggestedValue(candidates: { source: Array<{ value?: string | null }>; model: Array<{ value?: string | null }> }, current: string | null | undefined) {
  for (const item of [...candidates.source, ...candidates.model]) {
    if (item.value != null && item.value !== "" && item.value !== current) return item.value;
  }
  return null;
}

/* ---------- Evidence boxes over a page ---------- */

export interface BoxPercent { left: number; top: number; width: number; height: number }

/**
 * Where `item` sits on page `page`, in percent of the displayed page. `displayed` is the page as drawn (canvas or image
 * size, any unit). Boxes are drawn only for top-left coordinates with a known page size whose shape matches the drawn
 * page; anything else returns null rather than a guessed position.
 */
export function evidenceBox(item: SourceEvidence, page: number, displayed: { width: number; height: number }): BoxPercent | null {
  const box = item.bbox;
  if (!box || (item.page ?? 1) !== page) return null;
  if (box.coord_origin && box.coord_origin !== "TOPLEFT") return null;
  const units = item.coordinate_units ?? "pixels";
  if (!["pixels", "document_points"].includes(units)) return null;
  const size = item.page_size ?? (units === "pixels" ? displayed : null);
  if (!size) return null;
  const numbers = [size.width, size.height, displayed.width, displayed.height, box.l, box.t, box.r, box.b];
  if (!numbers.every(Number.isFinite) || size.width <= 0 || size.height <= 0 || displayed.width <= 0 || displayed.height <= 0) return null;
  // A different shape means the coordinates belong to another rendering (rotation, crop): do not draw.
  const shape = displayed.width / displayed.height;
  if (Math.abs(size.width / size.height - shape) > 0.02 * shape) return null;
  if (box.l < 0 || box.t < 0 || box.r > size.width * 1.001 || box.b > size.height * 1.001 || box.r <= box.l || box.b <= box.t) return null;
  const pct = (value: number, of: number) => Math.round(value / of * 10000) / 100;
  return { left: pct(box.l, size.width), top: pct(box.t, size.height), width: pct(box.r - box.l, size.width), height: pct(box.b - box.t, size.height) };
}

/* ---------- Next document in the same lane ---------- */

/** GET /api/review/lanes (backend #12). Only the ids are used here. */
export interface LanesResponse { lanes?: Record<string, Array<{ id: string }>> }

/** The lane that holds the current document, as an ordered list of ids; empty when no lane has it. */
export function laneQueue(response: LanesResponse | null | undefined, currentId: string): string[] {
  for (const items of Object.values(response?.lanes ?? {})) {
    const ids = items.map(item => String(item.id));
    if (ids.includes(currentId)) return ids;
  }
  return [];
}

/** Alt+Right / Alt+Left: the neighbouring document, or null at the ends. */
export function neighbourDocument(queue: readonly string[], currentId: string, direction: 1 | -1): string | null {
  const index = queue.indexOf(currentId);
  if (index < 0) return direction === 1 ? queue.find(id => id !== currentId) ?? null : null;
  return queue[index + direction] ?? null;
}

/**
 * After a submit: the document that followed this one when the page opened, if it still waits in the lane; otherwise the
 * first document still waiting. `fresh` is the lane re-read after the submit; null means nothing is left.
 */
export function nextAfterSubmit(before: readonly string[], fresh: readonly string[], currentId: string): string | null {
  const waiting = new Set(fresh.filter(id => id !== currentId));
  const start = before.indexOf(currentId);
  if (start >= 0) {
    for (let step = 1; step < before.length; step++) {
      const id = before[(start + step) % before.length];
      if (waiting.has(id)) return id;
    }
  }
  return fresh.find(id => id !== currentId) ?? null;
}

/** Fallback list when the lanes API is not deployed: documents still waiting for the accountant's check. */
export const toReviewIds = (documents: Array<Pick<Document, "id">>) => documents.map(item => String(item.id));

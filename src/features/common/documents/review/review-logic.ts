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

export const LINE_ITEM_FIELDS = [
  ["description", "description", "Description"],
  ["quantity", "quantity", "Quantity"],
  ["unit_price", "unitPrice", "Unit price"],
  ["amount", "amount", "Amount"],
] as const;

export function resolveLineItemField(path: string, lines: readonly { id?: string | null }[]) {
  const match = /^line_items\.(0|[1-9]\d*)\.([a-z_]+)$/.exec(path);
  if (!match) return undefined;
  const index = Number(match[1]);
  const field = LINE_ITEM_FIELDS.find(([key]) => key === match[2]);
  if (!field || !lines[index]?.id) return undefined;
  return { index, key: field[0], label: `Line ${index + 1} ${field[2]}` };
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
/**
 * The fields "Only fields to check" keeps: "Please check" and "Suggested". "Not found" fields are optional items the
 * document does not print (discount, tax ids, order number); a missing value a check needs already says "Please check"
 * through the failed check, so they are listed apart rather than in the keyboard order.
 */
export const isToCheck = (signal: ReviewSignal) => signal === "check" || signal === "suggestion";

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
 * The fields on screen, in keyboard order. With "Only fields to check" on, only "Please check" and "Suggested" fields
 * show, plus those in `keep`: fields that needed a check when the document opened stay in place after the accountant
 * corrects them, so the list does not jump.
 */
export function visibleEntries(order: ReviewEntry[], onlyToCheck: boolean, keep: ReadonlySet<string> = new Set()) {
  return onlyToCheck ? order.filter(entry => isToCheck(entry.signal) || keep.has(entry.key)) : order;
}

/** With the filter on: the "Not found" fields, shown apart in a closed group. Empty with the filter off. */
export function notFoundEntries(order: ReviewEntry[], onlyToCheck: boolean, keep: ReadonlySet<string> = new Set()) {
  return onlyToCheck ? order.filter(entry => entry.signal === "missing" && !keep.has(entry.key)) : [];
}

/**
 * Keeps the order the fields had when the document opened. A corrected field changes signal and would otherwise move
 * behind the fields still to check, so Enter after the last field would loop back to it. Fields not seen at opening go last.
 */
export function stableOrder(entries: ReviewEntry[], opening: readonly string[]): ReviewEntry[] {
  const rank = (key: string) => { const index = opening.indexOf(key); return index < 0 ? opening.length : index; };
  return entries.map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry.key) - rank(b.entry.key) || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * What Enter does in a field, in this order:
 * 1. a typed change is saved;
 * 2. a person's correction is never replaced: move on;
 * 3. an empty or "Suggested" field takes the printed or suggested value (a filled value is never swapped for a candidate);
 * 4. a filled "Please check" field is saved as the accountant's confirmation (recorded with their name);
 * 5. otherwise move on.
 */
export function enterAction(field: { dirty: boolean; value: string; suggestion: string | null; signal?: ReviewSignal; corrected: boolean }): { save: string } | "move" {
  if (field.dirty) return { save: field.value };
  if (field.corrected) return "move";
  const empty = field.value.trim() === "";
  if (field.suggestion != null && (empty || field.signal === "suggestion")) return { save: field.suggestion };
  // A value with line breaks (a printed address) cannot be saved unchanged: the API refuses control characters.
  if (field.signal === "check" && !empty && !CONTROL_CHARACTERS.test(field.value)) return { save: field.value };
  return "move";
}
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

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
 * size, any unit). Like `imageEvidenceBox`, nothing is assumed: the evidence must name its page, a top-left origin and
 * its units, and give a page size whose shape matches the drawn page. Only on an image may pixel coordinates without a
 * page size use the image's own size; a PDF page is drawn from points, so pixels need the size of the page they came
 * from. Anything else returns null rather than a guessed position.
 */
export function evidenceBox(item: SourceEvidence, page: number, displayed: { width: number; height: number }, source: "pdf" | "image"): BoxPercent | null {
  const box = item.bbox;
  if (!box || item.page !== page || box.coord_origin !== "TOPLEFT") return null;
  const units = item.coordinate_units;
  if (units !== "pixels" && units !== "document_points") return null;
  const size = item.page_size ?? (units === "pixels" && source === "image" ? displayed : null);
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

/**
 * The revision to send with a save or the submit: the one the accountant reviewed on screen, moved on only by their own
 * saves (each returns the next revision). Never a revision read from the server just before submitting, which could
 * hold someone else's change the accountant has not seen; the backend refuses a stale revision with 409.
 */
export const revisionToSubmit = (reviewed: number, ownSaves: readonly number[]) => ownSaves.length ? ownSaves[ownSaves.length - 1] : reviewed;

/** The page's note that it saved this draft itself (Ctrl+Enter). `id` is unique per save, so each note is used once. */
export interface SavedDraft { value: string; id: number }

/**
 * Whether a typed draft is settled (no longer unsaved), and which save note has been used. A draft is settled when the
 * stored value equals it, or when a save note not used before carries exactly this draft (the backend may normalise
 * what it stores). A note is used the first time it is seen, whatever the draft, so a later edit that happens to repeat
 * an old saved value stays unsaved instead of being wiped.
 */
export function settleDraft(draft: string, stored: string | null | undefined, note: SavedDraft | undefined, usedId: number | undefined): { settled: boolean; usedId: number | undefined } {
  const fresh = note && note.id !== usedId ? note : undefined;
  return { settled: draft === stored || (!!fresh && draft === fresh.value), usedId: fresh ? fresh.id : usedId };
}

/**
 * Unsaved fields (by label) that the submit would leave behind. Header fields are compared by value: a draft counts
 * as saved only if this submit sent exactly that value, so a newer value typed into a field that was also sent still
 * stops the submit. Other unsaved labels (line items, saved on their own) always stop it.
 */
export function unsavedOutside(input: {
  unsavedLabels: readonly string[];
  /** Header field key -> label as shown. */
  headerLabels: ReadonlyMap<string, string>;
  /** Header drafts still pending now (key -> value). */
  pending: ReadonlyMap<string, string>;
  /** What this submit saved (key -> value). */
  sent: ReadonlyMap<string, string>;
}): string[] {
  const header = new Set(input.headerLabels.values());
  const changed = [...input.pending].filter(([key, value]) => input.sent.get(key) !== value)
    .map(([key]) => input.headerLabels.get(key) ?? key);
  const others = input.unsavedLabels.filter(label => !header.has(label));
  return [...new Set([...changed, ...others])];
}

/** Alt+arrows and the Previous / Next buttons: the document to open, or null while a save or submit is running. */
export function documentTarget(queue: readonly string[], currentId: string, direction: 1 | -1, busy: boolean): string | null {
  return busy ? null : neighbourDocument(queue, currentId, direction);
}

/** The line above the original document saying where the selected field was read. A missing page is said, not assumed. */
export function evidenceCaption(selected: { label: string; evidence: SourceEvidence[] } | undefined, placeShown: boolean): string {
  if (!selected) return "Select a field to see where it was read.";
  const first = selected.evidence[0];
  if (!first) return `${selected.label}: where it was read is not recorded.`;
  const where = first.page != null ? `read on page ${first.page}` : "read on the document (page not recorded)";
  return `${selected.label}: ${where}${first.text ? `, "${first.text}"` : ""}.` + (placeShown ? "" : " Its place on the page is not recorded.");
}

/* ---------- Next document in the same lane ---------- */

/** GET /api/review/lanes (backend #12). Only the ids are used here. */
export interface LanesResponse { lanes?: Record<string, Array<{ id: string }>> }

/** The lane that holds the current document, as an ordered list of ids; empty when no lane has it. */
export function laneQueue(response: LanesResponse | null | undefined, currentId: string): string[] {
  return findLane(response, currentId)?.ids ?? [];
}

/** The lane that holds the current document, by name, so the same lane can be read again after a submit. */
export function findLane(response: LanesResponse | null | undefined, currentId: string): { lane: string; ids: string[] } | null {
  for (const [lane, items] of Object.entries(response?.lanes ?? {})) {
    const ids = items.map(item => String(item.id));
    if (ids.includes(currentId)) return { lane, ids };
  }
  return null;
}

/** The documents still in a named lane (the submitted one has left it). */
export const laneIds = (response: LanesResponse | null | undefined, lane: string) => (response?.lanes?.[lane] ?? []).map(item => String(item.id));

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

/* ---------- Blocking checks and fields a person may add (24 Nov demo bugs a and d) ---------- */

export interface CheckResult { rule: string; result: string; field?: string | null; message?: string | null; checkStatus?: string | null; preventsApproval?: boolean | null }

/** A check that stops submission or approval: it failed, or it could not run and is required for approval. */
export const isBlockingCheck = (item: CheckResult) => item.result === "FAIL" || item.preventsApproval === true;

/** Fields named by a blocking check, so they say "Please check" even when the check could not run (it did not FAIL). */
export function blockingFields(results: readonly CheckResult[], skip: (rule: string) => boolean = () => false): string[] {
  return results.filter(item => isBlockingCheck(item) && !!item.field && !skip(item.rule)).map(item => item.field as string);
}

/**
 * The blocking checks, for the list at the top of the Review tab. "Nothing to check" is shown only when this is empty:
 * a check that names no field (a receipt rule, a duplicate check) would otherwise block approval with nothing on screen.
 */
export function blockingChecks<T extends CheckResult>(results: readonly T[], skip: (rule: string) => boolean = () => false): T[] {
  return results.filter(item => isBlockingCheck(item) && !skip(item.rule));
}

/** Types whose payment terms and due date the accountant needs, whether or not the reader looked for them. */
const TERMS_KINDS = new Set(["INVOICE", "BILL", "CREDIT_NOTE", "DEBIT_NOTE"]);
/** Stored key → the label shown; the server creates the field on the first correction. */
export const ADDABLE_FIELDS: ReadonlyArray<readonly [string, string]> = [["due", "Due date"], ["payment_terms", "Payment terms"]];

/** Due date and payment terms the reader did not store for this type, offered as empty fields to fill in. */
export function addableFields(kind: string, fields: Readonly<Record<string, unknown>>): Array<readonly [string, string]> {
  if (!TERMS_KINDS.has(kind)) return [];
  const has = (key: string) => key === "due" ? ("due" in fields || "due_date" in fields) : key in fields;
  return ADDABLE_FIELDS.filter(([key]) => !has(key));
}

/** Fallback list when the lanes API is not deployed: documents still waiting for the accountant's check. */
export const toReviewIds = (documents: Array<Pick<Document, "id">>) => documents.map(item => String(item.id));

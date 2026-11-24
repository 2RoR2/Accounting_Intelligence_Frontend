/**
 * Review page layout rules (25 Nov review redesign), kept free of React so they can be unit tested:
 * the one-line status strip above the fields, when the per-field second reading shows, and the
 * "Change type" popover.
 */
import type { ValidationSummary } from "@/lib/api/document-contract";
import type { AiAssistResultField, AiAssistState } from "@/types";
import type { ReviewEntry } from "./review-logic";

/* ---------- Status strip ---------- */

export type StatusPartId = "to-check" | "read" | "not-found" | "checks";
export type StatusTone = "warning" | "danger" | "ok" | "neutral";

export interface StatusPart {
  id: StatusPartId;
  /** What the strip shows, e.g. "2 to check". */
  text: string;
  /** The longer wording, for the tooltip and screen readers. */
  title: string;
  tone: StatusTone;
}

export interface StatusCounts { check: number; suggestion: number; read: number; missing: number }

/** How many fields carry each signal. "Read" counts fields read from the document or corrected by a person. */
export function statusCounts(order: readonly ReviewEntry[]): StatusCounts {
  const count = (signal: ReviewEntry["signal"]) => order.filter(entry => entry.signal === signal).length;
  return { check: count("check"), suggestion: count("suggestion"), read: count("verified"), missing: count("missing") };
}

type ChecksSummary = Pick<ValidationSummary, "passed" | "failed" | "notChecked" | "blocking">;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The one-line strip, e.g. "0 to check · 13 read · 0 not found · Checks: 8 passed, 2 not run".
 * "To check" matches the "Only fields to check" filter: fields that say "Please check" plus those with a suggested value.
 * Without fields only the checks show; without a validation report the checks are left out.
 */
export function statusStrip(counts: StatusCounts, checks: ChecksSummary | null, fieldCount: number): StatusPart[] {
  const parts: StatusPart[] = [];
  if (fieldCount > 0) {
    const toCheck = counts.check + counts.suggestion;
    parts.push({
      id: "to-check", text: `${toCheck} to check`, tone: toCheck ? "warning" : "ok",
      title: `${plural(counts.check, "field says", "fields say")} "Please check"; ${plural(counts.suggestion, "field has", "fields have")} a suggested value. Nothing is applied until you accept it.`,
    });
    parts.push({ id: "read", text: `${counts.read} read`, tone: "neutral", title: `${plural(counts.read, "field was", "fields were")} read from the document or corrected by a person.` });
    parts.push({ id: "not-found", text: `${counts.missing} not found`, tone: counts.missing ? "danger" : "neutral",
      title: `${plural(counts.missing, "field was", "fields were")} not found on the document.` });
  }
  if (checks) {
    const detail = [`${checks.passed} passed`, checks.failed ? `${checks.failed} failed` : "", checks.notChecked ? `${checks.notChecked} not run` : ""].filter(Boolean);
    parts.push({ id: "checks", text: `Checks: ${detail.join(", ")}`, tone: checks.blocking ? "danger" : checks.failed ? "warning" : "ok",
      title: checks.blocking ? `${plural(checks.blocking, "check blocks", "checks block")} approval. Open the Checks tab to see what to fix.` : "Open the Checks tab to see every check." });
  }
  return parts;
}

/* ---------- Second reading, per field ---------- */

/** The second reading shows only when it is switched on for this installation; otherwise nothing of it is on screen. */
export const secondReadingOn = (state: Pick<AiAssistState, "available"> | null | undefined) => !!state?.available;

/** True when "Ask AI to re-read" is offered next to this field: switched on, the field is supported, and it can be edited. */
export function canAskSecondReading(state: Pick<AiAssistState, "available" | "supportedFields"> | null | undefined, storedKey: string, readonly: boolean) {
  return !readonly && secondReadingOn(state) && !!state?.supportedFields.some(item => item.storedKey === storedKey);
}

/** The latest second reading of this field, if the last attempt covered it. Shown under the field. */
export function secondReadingFor(state: Pick<AiAssistState, "available" | "latest"> | null | undefined, storedKey: string): AiAssistResultField | null {
  if (!secondReadingOn(state)) return null;
  return state?.latest?.fields.find(row => row.stored_key === storedKey) ?? null;
}

/** Results of the latest attempt whose field is not on screen (hidden by the filter, or not stored yet). */
export function secondReadingsElsewhere(state: Pick<AiAssistState, "available" | "latest"> | null | undefined, onScreen: ReadonlySet<string>): AiAssistResultField[] {
  if (!secondReadingOn(state)) return [];
  return (state?.latest?.fields ?? []).filter(row => !onScreen.has(row.stored_key));
}

/* ---------- "Change type" popover ---------- */

/** One line above the type picker: what changing the type does. */
export const TYPE_CHANGE_EXPLAINER = "Changing the type changes the expected fields, the checks that run and how the document will post. Nothing is approved or posted by this.";

export interface TypePopoverState { open: boolean; /** Return focus to the button that opened it. */ restoreFocus: boolean }
export const TYPE_POPOVER_CLOSED: TypePopoverState = { open: false, restoreFocus: false };
export type TypePopoverEvent = "toggle" | "keep" | "escape" | "saved";

/**
 * Open and close. The button toggles it; Escape or "Keep this type" closes it and returns focus to the button;
 * after the type is saved it closes and the page shows the new fields.
 */
export function typePopover(state: TypePopoverState, event: TypePopoverEvent): TypePopoverState {
  switch (event) {
    case "toggle": return state.open ? { open: false, restoreFocus: true } : { open: true, restoreFocus: false };
    case "keep":
    case "escape": return state.open ? { open: false, restoreFocus: true } : state;
    case "saved": return TYPE_POPOVER_CLOSED;
  }
}

/**
 * The type button beside the fields' title. "Choose type" while the type is unknown or not confirmed (so it shows where the
 * reviewer works, not only at the top of the page); "Change type" once a type was read or chosen. None without permission.
 */
export function typeButton({ canChoose, needsType }: { canChoose: boolean; needsType: boolean }) {
  if (!canChoose) return null;
  return needsType
    ? { label: "Choose type", close: "Not now", heading: "Choose the document type" }
    : { label: "Change type", close: "Keep this type", heading: "Change the document type" };
}

/** Pure rules behind the Ask AccordAI panel: link safety, answer parsing, fact formatting, keyboard. */
import type { AssistantAnswer, AssistantCitation, AssistantContext, AssistantFact } from "./types";
import { MAX_QUESTION_LENGTH } from "./types";

/**
 * A link is only used when it is an in-app path the server sent. Anything else (an absolute URL, a
 * protocol-relative `//host`, `javascript:`, a backslash trick, whitespace or control characters) is dropped, so a
 * confused or manipulated model can never send the user somewhere else.
 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.length > 512) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

const text = (value: unknown, max = 600): string => (typeof value === "string" ? value.slice(0, max) : "");

/** A response from the server is data: keep the fields we know, in the types we expect, and drop the rest. */
export function normaliseAnswer(raw: unknown): AssistantAnswer {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const facts: AssistantFact[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.facts) ? data.facts : []) {
    if (!item || typeof item !== "object") continue;
    const fact = item as Record<string, unknown>;
    const id = text(fact.id, 40);
    const label = text(fact.label, 120);
    const value = text(fact.value, 80);
    if (!id || !value || seen.has(id)) continue;
    seen.add(id);
    facts.push({ id, label: label || "Figure", value, unit: text(fact.unit, 24) || null, href: safeHref(fact.href) });
  }
  const citations: AssistantCitation[] = [];
  const citationKeys = new Set<string>();
  for (const item of Array.isArray(data.citations) ? data.citations : []) {
    if (!item || typeof item !== "object") continue;
    const citation = item as Record<string, unknown>;
    const label = text(citation.label, 160);
    if (!label) continue;
    const href = safeHref(citation.href);
    const key = `${label}|${href ?? ""}`;
    if (citationKeys.has(key)) continue;
    citationKeys.add(key);
    citations.push({ label, href });
  }
  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, MAX_QUESTION_LENGTH))
    .slice(0, 4);
  return {
    answer: text(data.answer, 4000),
    facts,
    citations,
    refused: data.refused === true,
    fallback: data.fallback === true,
    suggestions,
    auditId: text(data.auditId, 80) || null,
  };
}

export type AnswerSegment = { type: "text"; text: string } | { type: "fact"; fact: AssistantFact };

const FACT_MARK = /\{\{\s*(f\d+)\s*\}\}/g;

/**
 * Splits an answer at its `{{f1}}` markers. A marker that names a returned fact becomes a chip; a marker that names
 * nothing is dropped (it is never shown raw). Facts that no marker uses are returned in `loose` for a "Figures" row.
 */
export function splitAnswer(answer: string, facts: AssistantFact[]): { segments: AnswerSegment[]; loose: AssistantFact[] } {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const used = new Set<string>();
  const segments: AnswerSegment[] = [];
  let last = 0;
  for (const match of answer.matchAll(FACT_MARK)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", text: answer.slice(last, index) });
    const fact = byId.get(match[1]);
    if (fact) {
      segments.push({ type: "fact", fact });
      used.add(fact.id);
    }
    last = index + match[0].length;
  }
  if (last < answer.length) segments.push({ type: "text", text: answer.slice(last) });
  return { segments, loose: facts.filter((fact) => !used.has(fact.id)) };
}

const CURRENCY_UNIT = /^(RM|MYR|SGD|USD|EUR|GBP|CNY|JPY|AUD|THB|IDR|\$|€|£)$/i;

/** "RM 18,420.00", "42 bills", "12%": the unit goes before a currency and after anything else, never twice. */
export function formatFactValue(fact: Pick<AssistantFact, "value" | "unit">): string {
  const unit = fact.unit?.trim();
  if (!unit) return fact.value;
  const lower = fact.value.toLowerCase();
  if (lower.startsWith(unit.toLowerCase()) || lower.endsWith(unit.toLowerCase())) return fact.value;
  if (unit === "%") return `${fact.value}%`;
  return CURRENCY_UNIT.test(unit) ? `${unit} ${fact.value}` : `${fact.value} ${unit}`;
}

/** What an Enter key does in the composer: Enter sends, Shift+Enter adds a line, composing text (IME) is left alone. */
export function composerKeyAction(event: { key: string; shiftKey: boolean; isComposing?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): "send" | "newline" | "none" {
  if (event.key !== "Enter" || event.isComposing) return "none";
  if (event.shiftKey || event.altKey) return "newline";
  return "send";
}

/** The page the user is on, as the backend names it: the segment after the role prefix (`/company/reports` → `reports`). */
export function pageFromPath(pathname: string): string {
  return pathname.split("/")[2] ?? "";
}

const CONTEXT_KEYS = ["page", "recordId", "reportType", "period"] as const;

/** Only the four documented context keys leave the browser. The panel label stays here. */
export function wireContext(context: AssistantContext & { label?: string }): AssistantContext {
  const out: AssistantContext = {};
  for (const key of CONTEXT_KEYS) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 120);
  }
  return out;
}

export const FALLBACK_SUGGESTIONS = [
  "What needs my attention this month?",
  "Which bills are due in the next 7 days?",
  "How much cash do we have?",
  "Who are our top suppliers this year?",
];

export const FALLBACK_NOTE = "Answered without the AI model";

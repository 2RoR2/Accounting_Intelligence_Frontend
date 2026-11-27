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
    toolsUsed: (Array.isArray(data.toolsUsed) ? data.toolsUsed : [])
      .filter((item): item is string => typeof item === "string" && /^[a-z0-9_]{1,40}$/i.test(item))
      .slice(0, 8),
    model: text(data.model, 80) || null,
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

/** "4210.00" becomes "4,210.00". String work only: the digits are the server's, nothing is calculated here. */
function groupThousands(value: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(value.trim());
  if (!match) return value;
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${match[3] ?? ""}`;
}

/**
 * How a fact reads. The backend sends the unit `MYR` with a plain two-decimal string ("4210.00") → "RM 4,210.00";
 * `count`, `date` and `text` are shown as sent. Any other unit goes before a currency and after anything else
 * ("6 bills", "12%"), and is never shown twice.
 */
export function formatFactValue(fact: Pick<AssistantFact, "value" | "unit">): string {
  const unit = fact.unit?.trim();
  if (!unit || /^(count|date|text)$/i.test(unit)) return fact.value;
  const lower = fact.value.toLowerCase();
  if (lower.startsWith(unit.toLowerCase()) || lower.endsWith(unit.toLowerCase())) return fact.value;
  if (unit === "%") return `${fact.value}%`;
  if (CURRENCY_UNIT.test(unit)) {
    // A negative amount reads "-RM 2,200.70", the way the server words it in the text.
    const grouped = groupThousands(fact.value);
    const sign = grouped.startsWith("-") ? "-" : "";
    return `${sign}${/^MYR$/i.test(unit) ? "RM" : unit.toUpperCase()} ${sign ? grouped.slice(1) : grouped}`;
  }
  return `${fact.value} ${unit}`;
}

/**
 * A rule-based answer lists its figures as "- label: value" lines, and the same figures come back as facts (with links).
 * A list line that is exactly one fact (its label and its formatted value both appear in it) is dropped from the text,
 * because the fact is shown below it; every other line stays. Nothing is hidden: a dropped line is always shown as the fact.
 */
export function dropListedFacts(answer: string, facts: AssistantFact[]): string {
  if (!facts.length || !answer.includes("\n- ")) return answer;
  const kept = answer.split("\n").filter((line) => {
    if (!line.startsWith("- ")) return true;
    return !facts.some((fact) => line.includes(fact.label) && line.includes(formatFactValue(fact)));
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

const CONTEXT_KEYS = ["page", "documentId", "recordId", "reportType", "period"] as const;

/** Only the documented context keys leave the browser (the backend answers any other key with 422). The label stays here. */
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

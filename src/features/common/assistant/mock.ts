/**
 * A stand-in for the Ask AccordAI backend that follows the same contract. It is only loaded when
 * `NEXT_PUBLIC_ASSISTANT_MOCK` is set (never in a normal build), so the panel can be built, demoed and tested
 * before, or without, the backend branch. The figures below are sample values, not real data.
 */
import { ApiError } from "@/lib/api/client";
import type { AssistantAnswer, AssistantContext } from "./types";

/** Tests set `scale` to 0 so the mock answers at once. */
export const mockTiming = { scale: 1 };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms * mockTiming.scale));

const SUGGESTIONS: Record<string, string[]> = {
  reports: ["Why were expenses higher in November than October?", "What is our profit so far this year?", "Which accounts moved the most this month?", "Explain the balance sheet in plain words"],
  documents: ["Which documents are waiting for review?", "Why was INV-1042 flagged?", "Which suppliers sent us the most bills this month?", "What is still missing for month end?"],
  dashboard: ["What needs my attention this month?", "Which bills are due in the next 7 days?", "How much cash do we have?", "Who are our top suppliers this year?"],
};

export async function mockSuggestions(page: string, mode: string): Promise<string[]> {
  await wait(120);
  if (mode === "off") throw new ApiError("AI assistant is not enabled.", 403);
  return SUGGESTIONS[page] ?? SUGGESTIONS.dashboard;
}

const REFUSE = /\b(post|approve|pay|send|email|delete|remove|export|submit|sql|other compan|every company|what tax should|charge tax)\b/i;

export async function mockAsk(question: string, context: AssistantContext, mode: string): Promise<AssistantAnswer> {
  await wait(1100 + Math.min(question.length * 6, 700));
  if (mode === "off") throw new ApiError("AI assistant is not enabled.", 403);
  const q = question.toLowerCase();
  const base = { refused: false, fallback: false, toolsUsed: ["due_soon"], model: "gpt-oss-20b" as string | null, auditId: `a${Math.abs(hash(question + (context.page ?? ""))).toString(16).padStart(8, "0")}${"c0de".repeat(2)}` };

  if (q.includes("simulate error")) throw new ApiError("boom", 500);
  if (REFUSE.test(q)) {
    return {
      ...base, refused: true, toolsUsed: [], model: null, facts: [], citations: [{ label: "Review queue", href: "/workspace/review" }],
      answer: "I can only read your books, so I cannot post, pay, send or delete anything. A person can do that from the Review queue, where each item shows its checks first.",
      suggestions: ["Which documents are waiting for review?", "What needs my attention this month?"],
    };
  }
  if (q.includes("due") || q.includes("bill")) {
    return {
      ...base, fallback: q.includes("fallback"),
      answer: "You have {{f1}} bills due in the next 7 days, together {{f2}}. The largest is from Seladah Utilities ({{f3}}), due on 4 December.",
      facts: [
        { id: "f1", label: "Bills due in 7 days", value: "6", unit: "count", href: "/workspace/bills?due=7" },
        { id: "f2", label: "Total due in 7 days", value: "18420.00", unit: "MYR", href: "/workspace/bills?due=7" },
        { id: "f3", label: "Seladah Utilities, BILL-0231", value: "4810.50", unit: "MYR", href: "/workspace/bills/BILL-0231" },
      ],
      citations: [{ label: "Payables ageing, 27 Nov 2026", href: "/workspace/reports/ageing" }, { label: "Open bills by due date", href: "/workspace/bills" }],
      suggestions: ["Which of these are already overdue?", "Who are our top suppliers this year?"],
    };
  }
  if (q.includes("cash")) {
    return {
      ...base, fallback: true, toolsUsed: ["cash_position"], model: null,
      answer: "Here are the figures from the cash position report: cash at bank is {{f1}}, and receivables due this month are {{f2}}.",
      facts: [
        { id: "f1", label: "Cash at bank", value: "142306.18", unit: "MYR", href: "/workspace/bank" },
        { id: "f2", label: "Receivables due this month", value: "63900.00", unit: "MYR", href: "/workspace/reports/ageing?kind=receivables" },
      ],
      citations: [{ label: "Cash position, 27 Nov 2026", href: "/workspace/bank" }],
      suggestions: ["Which bills are due in the next 7 days?"],
    };
  }
  if (context.recordId || q.includes("explain") || q.includes("flag")) {
    return {
      ...base,
      answer: "This document was flagged because the printed total ({{f1}}) does not equal the lines plus the printed tax ({{f2}}). Tax is read as printed and never recalculated, so check the total against the source image.",
      facts: [
        { id: "f1", label: "Printed total", value: "1260.00", unit: "MYR", href: "/workspace/documents" },
        { id: "f2", label: "Printed tax", value: "70.00", unit: "MYR", href: "/workspace/documents" },
      ],
      citations: [{ label: "Document checks: totals agree", href: "/workspace/documents" }],
      suggestions: ["What is still missing for month end?"],
    };
  }
  return {
    ...base,
    answer: "Expenses were {{f1}} in November, up {{f2}} on October. Most of the rise is Seladah Utilities at {{f3}}. These are recorded figures from the profit and loss report.",
    facts: [
      { id: "f1", label: "Expenses, Nov 2026", value: "18420.00", unit: "MYR", href: "/workspace/reports/profit-and-loss?period=2026-11" },
      { id: "f2", label: "Change from October", value: "3160.00", unit: "MYR", href: "/workspace/reports/profit-and-loss?compare=2026-10" },
      { id: "f3", label: "Seladah Utilities", value: "2410.00", unit: "MYR", href: "/workspace/contacts" },
    ],
    citations: [{ label: "Profit and loss, November 2026", href: "/workspace/reports/profit-and-loss?period=2026-11" }, { label: "Expenses by supplier", href: "/workspace/reports" }],
    suggestions: ["Which bills are due in the next 7 days?", "What is our profit so far this year?"],
  };
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

import { ApiError, get, post } from "./client";
import { normaliseAnswer, wireContext } from "@/features/common/assistant/assistant-logic";
import type { AssistantAnswer, AssistantContext } from "@/features/common/assistant/types";

/**
 * Ask AccordAI (backend `services/assistant`). Accountants and local admins only; the backend answers 403 when the
 * `AI_ASSIST` flag is off, and the panel then hides itself.
 *
 * `NEXT_PUBLIC_ASSISTANT_MOCK=1` answers from a local mock that follows the same contract (for building the UI
 * without the backend branch); `NEXT_PUBLIC_ASSISTANT_MOCK=off` makes the mock behave like the flag being off.
 */
const MOCK = process.env.NEXT_PUBLIC_ASSISTANT_MOCK?.trim();

/** True when the assistant is not offered here: the flag is off (403), or this backend has no such endpoint (404). */
export function isAssistantOff(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export async function askAssistant(question: string, context: AssistantContext): Promise<AssistantAnswer> {
  if (MOCK) {
    const { mockAsk } = await import("@/features/common/assistant/mock");
    return normaliseAnswer(await mockAsk(question, wireContext(context), MOCK));
  }
  return normaliseAnswer(await post<unknown>("/api/assistant/ask", { question, context: wireContext(context) }));
}

export async function getAssistantSuggestions(page: string): Promise<string[]> {
  if (MOCK) {
    const { mockSuggestions } = await import("@/features/common/assistant/mock");
    return mockSuggestions(page, MOCK);
  }
  const data = await get<unknown>(`/api/assistant/suggestions?page=${encodeURIComponent(page)}`);
  const list = Array.isArray(data) ? data : (data as { suggestions?: unknown } | null)?.suggestions;
  return (Array.isArray(list) ? list : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 6);
}

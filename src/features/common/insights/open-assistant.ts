/**
 * Local stand-in for FE-1's assistant module (PR #50, `@/features/common/assistant`), with the same signatures:
 * `openAssistant(options?)` and `useAssistantAvailable()`. When that PR is merged, delete this file and import both
 * from "@/features/common/assistant" instead; nothing else changes. The stand-in announces the request on `window`
 * so a panel that listens for it can open, and otherwise does nothing.
 */
export type AssistantContextInput = {
  page?: string;
  documentId?: string;
  recordId?: string;
  reportType?: "profit-and-loss" | "balance-sheet" | "ageing" | "business-summary";
  /** YYYY-MM */
  period?: string;
  /** Shown only in the panel ("About: ..."); never sent to the backend. */
  label?: string;
};
export type OpenAssistantOptions = { context?: AssistantContextInput; question?: string };

export const OPEN_ASSISTANT_EVENT = "ai:assistant-open";

export function openAssistant(options: OpenAssistantOptions = {}): boolean {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: options }));
  return true;
}

/** The real hook is false when the assistant is switched off or the role may not use it; the stand-in is always true. */
export function useAssistantAvailable(): boolean {
  return true;
}

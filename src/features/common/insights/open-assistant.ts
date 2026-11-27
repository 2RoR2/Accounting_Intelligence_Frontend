/**
 * Local stand-in for FE-1's `openAssistant({ context, question? })` (src/features/common/assistant/).
 * When the assistant branch is merged, delete this file and import `openAssistant` from there instead:
 * only the import in insights-page.tsx changes. The shim announces the request on `window` so a panel
 * that listens for it can open, and does nothing otherwise.
 */
export type ReportContext = { kind: "report"; period: string; label: string };
export type OpenAssistantRequest = { context: ReportContext; question?: string };

export const OPEN_ASSISTANT_EVENT = "ai:assistant-open";

export function openAssistant(request: OpenAssistantRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: request }));
}

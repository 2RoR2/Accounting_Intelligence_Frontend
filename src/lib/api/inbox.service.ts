import { ApiError, api, get, post } from "./client";
import {
  actionIsRunnable, callsOf, normaliseFraud, normaliseInbox,
  type FraudResult, type InboxAction, type InboxItem,
} from "@/features/common/inbox/inbox-contract";
import { mockFraud, mockInbox } from "@/features/common/inbox/inbox-mock";

/**
 * AI Inbox (F3) and Fraud Shield (F2). With AI_ASSIST off the backend answers 404 {detail:{code:"AI_ASSIST_OFF"}}
 * (an older backend may answer 403 or a plain 404 for the inbox). The app treats all of that as "this feature does
 * not exist": nothing is shown and nothing is retried.
 */
export class AiAssistOffError extends Error {
  constructor() { super("The AI assistant is not turned on for this workspace."); this.name = "AiAssistOffError"; }
}

/** Set NEXT_PUBLIC_AI_INBOX_MOCK=1 to use built-in sample data instead of the backend (local checks only). */
const MOCK = process.env.NEXT_PUBLIC_AI_INBOX_MOCK === "1";

export function isAssistOff(error: unknown, route: "inbox" | "fraud"): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.details?.code === "AI_ASSIST_OFF" || error.status === 403) return true;
  // A backend without the inbox at all answers a bare 404; a fraud 404 can also mean "no such document".
  return error.status === 404 && route === "inbox";
}

async function guarded<T>(route: "inbox" | "fraud", request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (isAssistOff(error, route)) throw new AiAssistOffError();
    throw error;
  }
}

export const getInbox = (): Promise<InboxItem[]> =>
  guarded("inbox", async () => normaliseInbox(MOCK ? await mockInbox.list() : await get<unknown>("/api/inbox")));

/** Hides one proposal for this user for 30 days. */
export const dismissInboxItem = (id: string): Promise<void> =>
  guarded("inbox", async () => {
    if (MOCK) return mockInbox.dismiss(id);
    await post(`/api/inbox/${encodeURIComponent(id)}/dismiss`);
  });

/**
 * Runs one listed accept as the signed-in user: the main call, then each follow-up in order, stopping at the first
 * failure. Only call this after the person confirmed it.
 */
export async function runInboxAction(action: InboxAction): Promise<void> {
  if (!actionIsRunnable(action)) throw new Error("This suggestion cannot be run from here. Open the page it points to and make the change there.");
  if (MOCK) { await mockInbox.run(action.path); return; }
  const calls = callsOf(action);
  for (const [index, call] of calls.entries()) {
    try {
      await api(call.path, { method: call.method, body: call.body == null ? undefined : JSON.stringify(call.body) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The request failed.";
      throw new Error(index === 0 ? reason : `The first step worked, but step ${index + 1} of ${calls.length} (${call.method} ${call.path}) failed: ${reason}`);
    }
  }
}

export const getDocumentFraud = (documentId: string): Promise<FraudResult> =>
  guarded("fraud", async () => normaliseFraud(MOCK ? mockFraud(documentId) : await get<unknown>(`/api/insights/fraud?documentId=${encodeURIComponent(documentId)}`)));

/** The "approve anyway" reason. Call it before the normal approval; it writes an audit row and changes nothing else. */
export async function acknowledgeFraud(documentId: string, codes: string[], reason: string): Promise<void> {
  if (MOCK) return;
  await post(`/api/insights/fraud/${encodeURIComponent(documentId)}/acknowledge`, { codes, reason: reason.trim() });
}

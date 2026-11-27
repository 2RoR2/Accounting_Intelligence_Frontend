"use client";
import { useEffect, useSyncExternalStore } from "react";
import { dismissInboxItem, getInbox, runInboxAction } from "@/lib/api/inbox.service";
import { InboxFlow, type InboxState } from "./inbox-flow";

/** One inbox for the whole tab: the menu badge and the page read the same list, so Accept updates both. */
export const inboxFlow = new InboxFlow({ load: getInbox, run: runInboxAction, dismiss: dismissInboxItem });

const serverState: InboxState = inboxFlow.getState();

export function useInbox(): InboxState {
  return useSyncExternalStore(inboxFlow.subscribe, inboxFlow.getState, () => serverState);
}

/**
 * For the menu. `available` is true only after the backend answered: a 403 (AI_ASSIST off), an error, or a
 * signed-out user all leave it false, so the AI links never point at a feature that is not there.
 */
export function useAiNav(enabled: boolean): { available: boolean; count: number } {
  const state = useInbox();
  useEffect(() => { if (enabled) void inboxFlow.ensureLoaded(); }, [enabled]);
  return { available: enabled && state.phase === "ready", count: state.items.length };
}

/**
 * The Ask AccordAI conversation and panel state. One store per browser tab: the panel, the Ask button and any
 * "Explain this" button read the same state, and `openAssistant()` works from anywhere without a provider.
 * The conversation is kept in sessionStorage (per tab) and nothing here posts, pays or sends anything.
 */
import { useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import { askAssistant, getAssistantSuggestions, isAssistantOff } from "@/lib/api/assistant.service";
import { FALLBACK_SUGGESTIONS, wireContext } from "./assistant-logic";
import { MAX_QUESTION_LENGTH, type AssistantAnswer, type AssistantContext, type AssistantContextInput, type Availability, type OpenAssistantOptions, type Turn } from "./types";

export type AssistantClient = {
  ask(question: string, context: AssistantContext): Promise<AssistantAnswer>;
  suggestions(page: string): Promise<string[]>;
  /** True when the error means the assistant is not offered (403 flag off, 404 no endpoint). */
  isOff(error: unknown): boolean;
};

export type TextStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AssistantState = {
  availability: Availability;
  open: boolean;
  /** The Ask button / panel host is on screen for an allowed role. */
  hosted: boolean;
  page: string;
  /** Context from an "Explain this" button; it applies to the next questions until cleared or the page changes. */
  pinned: AssistantContextInput | null;
  turns: Turn[];
  suggestions: Record<string, string[]>;
};

const STORAGE_PREFIX = "accordai-assistant:v1:";
const MAX_TURNS = 30;
const MAX_STORED_BYTES = 250_000;

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "AccordAI has answered a lot of questions just now. Wait a moment, then try again.";
    if (error.status === 401) return "Your session ended. Sign in again, then ask again.";
    return "AccordAI could not answer that just now. Your question is kept, so you can try again.";
  }
  // The shared client already words connection problems and time-outs in plain language.
  if (error instanceof Error && /^(Unable to reach|The request timed out)/.test(error.message)) return error.message;
  return "AccordAI could not answer that just now. Your question is kept, so you can try again.";
}

const defaultClient: AssistantClient = { ask: askAssistant, suggestions: getAssistantSuggestions, isOff: isAssistantOff };

function browserStorage(): TextStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function createAssistantStore(client: AssistantClient = defaultClient, getStorage: () => TextStorage | null = browserStorage) {
  let state: AssistantState = { availability: "checking", open: false, hosted: false, page: "", pinned: null, turns: [], suggestions: {} };
  let storageKey: string | null = null;
  let queued: OpenAssistantOptions | null = null;
  let counter = 0;
  let epoch = 0;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());
  const set = (patch: Partial<AssistantState>) => {
    state = { ...state, ...patch };
    emit();
  };

  function persist() {
    if (!storageKey) return;
    try {
      const storage = getStorage();
      if (!storage) return;
      const keep = state.turns.slice(-MAX_TURNS);
      const json = JSON.stringify(keep);
      if (json.length > MAX_STORED_BYTES) storage.setItem(storageKey, JSON.stringify(keep.slice(-8)));
      else storage.setItem(storageKey, json);
    } catch {
      /* Storage is optional: a full or blocked store only means the chat is not kept after a reload. */
    }
  }

  function load(): Turn[] {
    if (!storageKey) return [];
    try {
      const raw = getStorage()?.getItem(storageKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item): item is Turn => !!item && typeof item === "object" && typeof (item as Turn).id === "string" && typeof (item as Turn).question === "string")
        .map((turn): Turn => (turn.state === "pending"
          // A reload cut this question off: offer a retry rather than a spinner that never ends.
          ? { ...turn, state: "error", error: "This question was interrupted. Try again.", answer: undefined }
          : turn))
        .slice(-MAX_TURNS);
    } catch {
      return [];
    }
  }

  function setTurns(turns: Turn[], persistNow = true) {
    set({ turns });
    if (persistNow) persist();
  }

  function patchTurn(id: string, patch: Partial<Turn>) {
    if (!state.turns.some((turn) => turn.id === id)) return;
    setTurns(state.turns.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }

  function goOff() {
    queued = null;
    epoch += 1;
    try {
      if (storageKey) getStorage()?.removeItem(storageKey);
    } catch { /* optional */ }
    set({ availability: "off", open: false, turns: [], pinned: null });
  }

  async function run(turnId: string) {
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const mine = epoch;
    patchTurn(turnId, { state: "pending", error: undefined, answer: undefined });
    try {
      const answer = await client.ask(turn.question, turn.context);
      if (mine !== epoch) return;
      patchTurn(turnId, { state: "done", answer });
    } catch (error) {
      if (mine !== epoch) return;
      if (client.isOff(error)) {
        goOff();
        return;
      }
      patchTurn(turnId, { state: "error", error: friendlyError(error) });
    }
  }

  async function ensureSuggestions(page: string) {
    if (state.suggestions[page]) return;
    try {
      const list = await client.suggestions(page);
      set({ suggestions: { ...state.suggestions, [page]: list.length ? list : FALLBACK_SUGGESTIONS } });
      if (state.availability === "checking") flushOn();
    } catch (error) {
      if (client.isOff(error)) {
        goOff();
        return;
      }
      if (error instanceof ApiError && error.status === 401) return;
      set({ suggestions: { ...state.suggestions, [page]: FALLBACK_SUGGESTIONS } });
      if (state.availability === "checking") flushOn();
    }
  }

  function flushOn() {
    state = { ...state, availability: "on" };
    emit();
    if (queued) {
      const options = queued;
      queued = null;
      open(options);
    }
  }

  function currentContext(): { context: AssistantContext; label?: string } {
    const pinned = state.pinned;
    const context = wireContext({ page: state.page, ...(pinned ?? {}) });
    return { context, label: pinned?.label };
  }

  function send(question: string): boolean {
    const text = question.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!text || state.availability !== "on" || state.turns.some((turn) => turn.state === "pending")) return false;
    const { context, label } = currentContext();
    const id = `t${Date.now().toString(36)}${(counter += 1)}`;
    setTurns([...state.turns, { id, question: text, context, label, state: "pending" }]);
    void run(id);
    return true;
  }

  function open(options: OpenAssistantOptions = {}): boolean {
    if (!state.hosted || state.availability === "off") return false;
    if (state.availability === "checking") {
      // The first suggestions request has not answered yet: do this once it says the assistant is on.
      queued = options;
      return true;
    }
    const patch: Partial<AssistantState> = { open: true };
    if (options.context) patch.pinned = options.context;
    set(patch);
    void ensureSuggestions(state.page);
    if (options.question) send(options.question);
    return true;
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The host component mounted for a signed-in accountant or local admin. Returns the unmount function. */
    mount(userId: string, page: string) {
      const key = `${STORAGE_PREFIX}${userId}`;
      const changed = key !== storageKey;
      storageKey = key;
      state = { ...state, hosted: true, page };
      if (changed) state = { ...state, turns: load(), availability: "checking", suggestions: {}, pinned: null, open: false };
      emit();
      void ensureSuggestions(page);
      // The shell remounts when the user opens another area, and the panel should stay open through that.
      return () => set({ hosted: false });
    },
    setPage(page: string) {
      if (page === state.page) return;
      // An "Explain this" context belongs to the page it was opened on.
      set({ page, pinned: null });
      if (state.availability === "on") void ensureSuggestions(page);
    },
    open,
    close: () => set({ open: false }),
    toggle() {
      return state.open ? (set({ open: false }), false) : open();
    },
    send,
    retry(id: string): boolean {
      if (state.turns.some((turn) => turn.state === "pending")) return false;
      if (!state.turns.some((turn) => turn.id === id && turn.state === "error")) return false;
      void run(id);
      return true;
    },
    newChat() {
      epoch += 1;
      queued = null;
      set({ turns: [], pinned: null });
      persist();
    },
    clearPinned: () => set({ pinned: null }),
    /** Test hook: waits for the answer to the last question. */
    async settled() {
      for (let i = 0; i < 50 && (state.turns.some((turn) => turn.state === "pending") || state.availability === "checking"); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}

export type AssistantStore = ReturnType<typeof createAssistantStore>;

/** The store the app uses. */
export const assistantStore = createAssistantStore();

const SERVER_STATE: AssistantState = { availability: "checking", open: false, hosted: false, page: "", pinned: null, turns: [], suggestions: {} };

export function useAssistantState(store: AssistantStore = assistantStore): AssistantState {
  return useSyncExternalStore(store.subscribe, store.getState, () => SERVER_STATE);
}

/**
 * Opens the Ask AccordAI panel, optionally about one record or report and with a question to send at once.
 * Returns false when the assistant is not offered (role, or the `AI_ASSIST` flag is off), so callers can ignore it.
 * Example (an "Explain this report" button): `openAssistant({ context: { page: "reports", reportType: "profit-and-loss",
 * period: "2026-11", label: "Profit and loss, November 2026" }, question: "Explain this report" })`.
 */
export function openAssistant(options: OpenAssistantOptions = {}): boolean {
  return assistantStore.open(options);
}

/** True when the assistant is on for this user. Use it to hide an "Explain this" button when it is off. */
export function useAssistantAvailable(): boolean {
  const state = useAssistantState();
  return state.hosted && state.availability === "on";
}

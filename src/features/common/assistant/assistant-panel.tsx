"use client";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, CornerDownRight, RefreshCw, Sparkles, SquarePen, TriangleAlert, X } from "lucide-react";
import { AnswerView } from "./answer-view";
import { composerKeyAction, pageFromPath } from "./assistant-logic";
import { assistantStore, openAssistant, useAssistantAvailable, useAssistantState } from "./assistant-store";
import { MAX_QUESTION_LENGTH, type Availability, type OpenAssistantOptions, type Turn } from "./types";

/** The panel's id, so the Ask button can say what it controls. */
export const ASSISTANT_PANEL_ID = "ask-accordai-panel";

const SHEET_QUERY = "(max-width: 760px)";

function useSheetMode(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(SHEET_QUERY);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(SHEET_QUERY).matches,
    () => false,
  );
}

/* ---------- Entry points ---------- */

/** The Ask button, as a plain view: nothing at all unless the assistant is on for this user. */
export function AskButtonView({ availability, hosted, open, onClick }: { availability: Availability; hosted: boolean; open: boolean; onClick: () => void }) {
  if (!hosted || availability !== "on") return null;
  return (
    <button type="button" className="ask-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={ASSISTANT_PANEL_ID}
      title="Ask AccordAI (Ctrl+/)" onClick={onClick}>
      <Sparkles size={15} aria-hidden="true" />
      <span>Ask AccordAI</span>
    </button>
  );
}

/** The "Ask AccordAI" button for the top bar. Hidden until the backend confirms the assistant is on (and when it is off). */
export function AskAssistantButton() {
  const state = useAssistantState();
  return <AskButtonView availability={state.availability} hosted={state.hosted} open={state.open} onClick={() => assistantStore.toggle()} />;
}

/** An "Explain this" button for a document, a report line or a flag. Hidden when the assistant is not on for this user. */
export function ExplainThisButton({ context, question = "Explain this", label = "Explain this", className = "" }: OpenAssistantOptions & { label?: string; className?: string }) {
  const available = useAssistantAvailable();
  if (!available) return null;
  return (
    <button type="button" className={`ask-explain ${className}`.trim()} onClick={() => openAssistant({ context, question })}>
      <Sparkles size={14} aria-hidden="true" /> {label}
    </button>
  );
}

/* ---------- The host: probes availability, keeps the page in step, owns Ctrl+/ ---------- */

export function AssistantHost({ user, pathname }: { user: { id: string }; pathname: string }) {
  const state = useAssistantState();
  const userId = user.id;
  useEffect(() => assistantStore.mount(userId, pageFromPath(pathname)),
    // The page is passed once; later changes go through setPage below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId]);
  useEffect(() => { assistantStore.setPage(pageFromPath(pathname)); }, [pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.ctrlKey || event.metaKey) && !event.altKey && assistantStore.getState().availability === "on") {
        event.preventDefault();
        assistantStore.toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  if (state.availability !== "on" || !state.open) return null;
  return <AssistantPanel />;
}

/* ---------- The panel ---------- */

let unsentDraft = "";

const WORKING_NOTES = ["Reading your reports…", "Checking the figures…", "Putting the answer together…"];

function TypingIndicator() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((value) => Math.min(value + 1, WORKING_NOTES.length - 1)), 2200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="ask-bot">
      <span className="ask-avatar" aria-hidden="true"><Sparkles size={14} /></span>
      <div className="ask-typing" role="status">
        <span className="ask-sr">AccordAI is working on your question.</span>
        <span className="ask-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="ask-typing-note" aria-hidden="true">{WORKING_NOTES[step]}</span>
      </div>
    </div>
  );
}

function TurnView({ turn, last, onNavigate, onAsk, onRetry, busy }: {
  turn: Turn; last: boolean; onNavigate: () => void; onAsk: (question: string) => void; onRetry: () => void; busy: boolean;
}) {
  return (
    <li className="ask-turn">
      <div className="ask-user">
        <p>{turn.question}</p>
        {turn.label && <small>About: {turn.label}</small>}
      </div>
      {turn.state === "pending" && <TypingIndicator />}
      {turn.state === "done" && turn.answer && (
        <div className="ask-bot">
          <span className="ask-avatar" aria-hidden="true"><Sparkles size={14} /></span>
          <AnswerView answer={turn.answer} onNavigate={onNavigate} onAsk={last ? onAsk : undefined} disabled={busy} />
        </div>
      )}
      {turn.state === "error" && (
        <div className="ask-bot">
          <span className="ask-avatar is-error" aria-hidden="true"><TriangleAlert size={14} /></span>
          <div className="ask-error" role="alert">
            <p>{turn.error ?? "AccordAI could not answer that just now."}</p>
            <button type="button" className="ask-retry" onClick={onRetry} disabled={busy}><RefreshCw size={13} aria-hidden="true" /> Try again</button>
          </div>
        </div>
      )}
    </li>
  );
}

export function AssistantPanel() {
  const state = useAssistantState();
  const sheet = useSheetMode();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraftState] = useState(unsentDraft);
  const setDraft = (value: string) => { unsentDraft = value; setDraftState(value); };
  const pending = state.turns.some((turn) => turn.state === "pending");
  const empty = state.turns.length === 0;
  const suggestions = state.suggestions[state.page] ?? [];
  const lastId = state.turns[state.turns.length - 1]?.id;

  // Focus: into the question box on open; back to whatever had it (the Ask or Explain button) on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  // Escape closes. On a phone the panel is a full-screen sheet, so Tab stays inside it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        assistantStore.close();
        return;
      }
      if (event.key !== "Tab" || !sheet || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea:not([disabled])"))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const end = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end.focus(); }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  // A sheet covers the page, so it holds the page still.
  useEffect(() => {
    if (!sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [sheet]);

  // Keep the newest message in view.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [state.turns]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }, [draft]);

  const closeSheet = useCallback(() => { if (sheet) assistantStore.close(); }, [sheet]);

  const submit = (text: string) => {
    if (assistantStore.send(text)) {
      setDraft("");
      inputRef.current?.focus();
    }
  };

  const pinned = state.pinned;

  return (
    <>
      <div className="ask-backdrop" onClick={() => assistantStore.close()} aria-hidden="true" />
      <aside ref={panelRef} id={ASSISTANT_PANEL_ID} className="ask-panel" role="dialog" aria-modal={sheet} aria-labelledby={titleId}>
        <header className="ask-head">
          <span className="ask-mark" aria-hidden="true"><Sparkles size={18} /></span>
          <div className="ask-head-text">
            <h2 id={titleId}>Ask AccordAI</h2>
            <p>Answers come from your books.</p>
          </div>
          {!empty && (
            <button type="button" className="ask-icon" onClick={() => { assistantStore.newChat(); inputRef.current?.focus(); }} title="Start a new chat" aria-label="Start a new chat">
              <SquarePen size={16} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="ask-icon" onClick={() => assistantStore.close()} title="Close (Esc)" aria-label="Close Ask AccordAI">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        {pinned && (
          <div className="ask-context">
            <span><strong>About:</strong> {pinned.label || (pinned.reportType ? `this ${pinned.reportType.replaceAll("-", " ")}` : "this page")}</span>
            <button type="button" onClick={() => assistantStore.clearPinned()} aria-label="Stop asking about this" title="Stop asking about this"><X size={13} aria-hidden="true" /></button>
          </div>
        )}

        <div className="ask-thread" ref={threadRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with AccordAI" tabIndex={-1}>
          {empty ? (
            <div className="ask-empty">
              <span className="ask-orb" aria-hidden="true"><Sparkles size={26} /></span>
              <h3>What would you like to know?</h3>
              <p>Ask about reports, bills, cash or month end. Every figure is read from your books, and each one links to where it comes from.</p>
              {suggestions.length > 0 && (
                <ul className="ask-suggest" aria-label="Suggested questions">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button type="button" onClick={() => submit(suggestion)} disabled={pending}>
                        <CornerDownRight size={14} aria-hidden="true" /> <span>{suggestion}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ol className="ask-turns">
              {state.turns.map((turn) => (
                <TurnView key={turn.id} turn={turn} last={turn.id === lastId} busy={pending}
                  onNavigate={closeSheet} onAsk={submit} onRetry={() => assistantStore.retry(turn.id)} />
              ))}
            </ol>
          )}
        </div>

        <form className="ask-composer" onSubmit={(event) => { event.preventDefault(); submit(draft); }}>
          <div className="ask-field">
            <textarea ref={inputRef} rows={1} value={draft} maxLength={MAX_QUESTION_LENGTH} placeholder="Ask about your books…"
              aria-label="Ask a question about your books" aria-describedby={`${titleId}-note`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (composerKeyAction({ key: event.key, shiftKey: event.shiftKey, altKey: event.altKey, isComposing: event.nativeEvent.isComposing }) === "send") {
                  event.preventDefault();
                  submit(draft);
                }
              }} />
            <button type="submit" className="ask-send" aria-label="Send question" title="Send (Enter)" disabled={!draft.trim() || pending}>
              <ArrowUp size={17} aria-hidden="true" />
            </button>
          </div>
          <p className="ask-note" id={`${titleId}-note`}>
            {draft.length > MAX_QUESTION_LENGTH - 100
              ? `${MAX_QUESTION_LENGTH - draft.length} characters left`
              : "Read-only. It cannot post, pay or send anything. Enter to send, Shift+Enter for a new line."}
          </p>
        </form>
      </aside>
    </>
  );
}

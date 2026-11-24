"use client";
/**
 * Second reading by the AI model, offered per field ("Ask AI to re-read") instead of a panel above the fields
 * (25 Nov review redesign). Everything here is a suggestion: a value is stored only when the reviewer accepts it,
 * through the normal correction route. When the second reading is not switched on, nothing of it is on screen.
 */
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { AiAssistResultField, AiAssistState, SourceEvidence, User } from "@/types";
import { aiAssistCanApply, aiAssistOutcomeLabel, modelIdentity } from "@/lib/api/document-contract";
import { decideAiAssist, getAiAssist, requestAiAssist, updateExtractedField } from "@/lib/api/document.service";
import { canAskSecondReading, secondReadingFor, secondReadingOn } from "./review-status";

export interface SecondReading {
  /** False while loading, on any error, and when the installation has it switched off. */
  on: boolean;
  state: AiAssistState | null;
  /** The stored key being read again, if any. One field at a time. */
  running: string;
  saving: string;
  /** Message for one field (stored key): a failure or what an accept did. */
  messages: Record<string, { text: string; error: boolean }>;
  ask: (storedKey: string) => Promise<void>;
  decide: (row: AiAssistResultField, accept: boolean, value: string) => Promise<void>;
}

export function useSecondReading({ user, documentId, contentRevision, labelFor, onSaved }: {
  user: User; documentId: string; contentRevision?: number; labelFor: (storedKey: string) => string; onSaved: () => Promise<void> | void;
}): SecondReading {
  const [state, setState] = useState<AiAssistState | null>(null);
  const [running, setRunning] = useState("");
  const [saving, setSaving] = useState("");
  const [messages, setMessages] = useState<SecondReading["messages"]>({});
  const say = (key: string, text: string, error = false) => setMessages(current => ({ ...current, [key]: { text, error } }));

  const load = useCallback(async () => {
    try { setState(await getAiAssist(user, documentId)); } catch { setState(null); }
  }, [user, documentId]);
  useEffect(() => { void load(); }, [load]);

  const ask = async (storedKey: string) => {
    const field = state?.supportedFields.find(item => item.storedKey === storedKey)?.field;
    if (!field || running) return;
    setRunning(storedKey); say(storedKey, "");
    try { await requestAiAssist(user, documentId, [field]); await load(); }
    catch (e) { say(storedKey, (e as Error).message, true); }
    finally { setRunning(""); }
  };
  const decide = async (row: AiAssistResultField, accept: boolean, value: string) => {
    setSaving(row.stored_key); say(row.stored_key, "");
    try {
      if (accept) await updateExtractedField(user, documentId, row.stored_key, value.trim(), contentRevision!);
      await decideAiAssist(user, documentId, { field: row.field, decision: accept ? "accepted" : "rejected", attemptId: state?.latest?.attempt_id });
      await load();
      if (accept) {
        say(row.stored_key, `${labelFor(row.stored_key)} saved as your correction. Run the checks again before submitting.`);
        await onSaved();
      }
    } catch (e) { say(row.stored_key, (e as Error).message, true); }
    finally { setSaving(""); }
  };
  return { on: secondReadingOn(state), state, running, saving, messages, ask, decide };
}

/** The small action beside a field's label. Nothing shows when the second reading is off or the field is not supported. */
export function AskSecondReading({ reading, storedKey, label, readonly, disabled }: {
  reading: SecondReading; storedKey: string; label: string; readonly: boolean; disabled?: boolean;
}) {
  if (!canAskSecondReading(reading.state, storedKey, readonly)) return null;
  const busy = reading.running === storedKey;
  return <button type="button" className="text-link review-ask-ai" disabled={disabled || !!reading.running || !!reading.saving}
    aria-label={`Ask AI to re-read ${label}`} onClick={() => void reading.ask(storedKey)}>
    <Sparkles size={13} aria-hidden="true" /> {busy ? "Reading…" : "Ask AI to re-read"}
  </button>;
}

/** The latest second reading of one field, under that field, with Accept and Reject. */
export function SecondReadingResult({ reading, storedKey, label, readonly, onShowSource }: {
  reading: SecondReading; storedKey: string; label: string; readonly: boolean;
  onShowSource: (label: string, evidence: SourceEvidence[]) => void;
}) {
  const row = secondReadingFor(reading.state, storedKey);
  const [edit, setEdit] = useState<string>();
  const message = reading.messages[storedKey];
  const running = reading.running === storedKey;
  if (!reading.on || (!row && !running && !message?.text)) return null;
  const latest = reading.state?.latest;
  const outcome = row ? (reading.state?.decisions ?? []).filter(item => item.attempt_id === latest?.attempt_id && item.field === row.field).at(-1)?.decision : undefined;
  const value = edit ?? row?.candidate ?? "";
  return <div className="review-second-reading" aria-label={`Second reading of ${label}`} data-outcome={row?.outcome}>
    {running && <p role="status">Reading this field again. Nothing changes until you accept a value.</p>}
    {message?.text && <p role={message.error ? "alert" : "status"}>{message.text}</p>}
    {row && !running && <>
      <p><strong><Sparkles size={13} aria-hidden="true" /> Second reading</strong> <span className="ai-assist-outcome">{aiAssistOutcomeLabel(row.outcome)}</span></p>
      {row.candidate != null && <p>Reads: <b>{row.candidate}</b>{row.current_value ?? row.parser_value ? ` (current value: ${row.current_value ?? row.parser_value})` : ""}</p>}
      {row.explanation && <p>{row.explanation}</p>}
      <small>A suggestion only; no value changes until you accept it.{row.request_reason ? ` Asked because: ${row.request_reason}` : ""}</small>
      {!!row.evidence?.length && <button type="button" className="text-link" onClick={() => onShowSource(label, row.evidence!)}>View source</button>}
      {latest?.model && <details className="ai-assist-details"><summary>Details</summary><small>{modelIdentity(latest)}</small></details>}
      {outcome && <p role="status">{outcome === "accepted" ? "Accepted by reviewer." : "Rejected by reviewer."}</p>}
      {!readonly && !outcome && aiAssistCanApply(row) && <div className="ai-assist-actions">
        <label>Value to save<input value={value} onChange={event => setEdit(event.target.value)} /></label>
        <button type="button" className="btn small" disabled={reading.saving === storedKey || !value.trim()} onClick={() => void reading.decide(row, true, value)}>Accept and save</button>
        <button type="button" className="btn small" disabled={reading.saving === storedKey} onClick={() => void reading.decide(row, false, value)}>Reject</button>
      </div>}
    </>}
  </div>;
}

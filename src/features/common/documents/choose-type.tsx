"use client";
import { useId, useState } from "react";
import { CHOOSABLE_DOCUMENT_KINDS, documentKindLabel, formatChosenBy } from "@/lib/glossary";
import type { KindDecision } from "@/types";

/** Lets a person set the document type. Nothing is saved until "Save type"; the backend then runs the checks again. */
export function ChooseTypeControl({ current, busy, onChoose }: { current?: string; busy: boolean; onChoose: (kind: string) => void }) {
  const selectId = useId();
  const [kind, setKind] = useState("");
  const unchanged = !kind || kind === current;
  return <div className="choose-type">
    <label htmlFor={selectId}>Choose type</label>
    <select id={selectId} value={kind} disabled={busy} onChange={event => setKind(event.target.value)}>
      <option value="">Select a type</option>
      {CHOOSABLE_DOCUMENT_KINDS.map(option => <option key={option} value={option}>{documentKindLabel(option)}</option>)}
    </select>
    <button type="button" className="btn small primary" disabled={busy || unchanged} onClick={() => onChoose(kind)}>
      {busy ? "Saving..." : "Save type"}
    </button>
  </div>;
}

/**
 * Top of the document page: why the type or the details are missing, in plain words, and the control to choose
 * the type. After a person chose it, says who chose it, so nobody mistakes it for a type read from the document.
 */
export function DocumentTypeNotice({ reason, decision, needsType, canChoose, current, busy, onChoose }: {
  reason: string | null; decision?: KindDecision | null; needsType: boolean; canChoose: boolean; current?: string;
  busy: boolean; onChoose: (kind: string) => void;
}) {
  if (!needsType && !decision && !reason) return null;
  return <section className={`review-blocking-notice document-type-notice${decision ? " is-chosen" : ""}`} aria-label="Document type" role="status">
    <div className="document-type-notice-copy">
      <strong>{decision ? `Type: ${documentKindLabel(decision.value)}, chosen by a person` : needsType ? "Type not certain" : "How this document was read"}</strong>
      {decision && <span>{formatChosenBy(decision)} Reading did not settle the type, so check it matches the document.</span>}
      {reason && <span>{reason}</span>}
      {needsType && !canChoose && <span>Only the accountant working on this document or a local admin can choose its type, before it is submitted.</span>}
    </div>
    {canChoose && (needsType || decision) && <ChooseTypeControl current={current} busy={busy} onChoose={onChoose} />}
  </section>;
}

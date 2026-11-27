"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/common/ui";
import { AiAssistOffError, getDocumentFraud } from "@/lib/api/inbox.service";
import {
  APPROVE_ANYWAY_MAX, APPROVE_ANYWAY_MIN, approveAnywayReady, resolveEvidenceHref, shieldLabel, shieldTone,
  type FraudAcknowledgement, type FraudFlag,
} from "./inbox-contract";
// Styles: src/styles/ai-inbox.css, imported by both route-content files.

/** off: AI_ASSIST is not on (403), so the review page shows nothing. error: the check could not run; approval still works. */
export interface ShieldState { status: "loading" | "off" | "on" | "error"; flags: FraudFlag[]; acknowledgements?: FraudAcknowledgement[] }

export function useFraudShield(documentId: string, revision?: number): ShieldState & { refresh: () => void } {
  const [state, setState] = useState<ShieldState>({ status: "loading", flags: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    getDocumentFraud(documentId).then(
      (result) => { if (live) setState({ status: "on", flags: result.flags, acknowledgements: result.acknowledgements }); },
      (error) => { if (live) setState({ status: error instanceof AiAssistOffError ? "off" : "error", flags: [] }); },
    );
    return () => { live = false; };
  }, [documentId, revision, tick]);
  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, refresh };
}

/** Fraud flags are advice. They never block a person from approving; they make the approval say why. */
export const hasFraudWarnings = (shield: Pick<ShieldState, "status" | "flags">) => shield.status === "on" && shield.flags.length > 0;

const SEVERITY_TEXT = { high: "High", medium: "Medium", low: "Low" } as const;

export function ShieldChip({ shield, onOpen }: { shield: ShieldState; onOpen: () => void }) {
  if (shield.status === "loading" || shield.status === "off") return null;
  if (shield.status === "error") {
    return <button type="button" className="shield-chip is-unknown" onClick={onOpen} title="The fraud check could not run. Select to see why.">
      <ShieldAlert size={14} aria-hidden="true" /> Shield unavailable</button>;
  }
  const tone = shieldTone(shield.flags);
  const Icon = tone === "clear" ? ShieldCheck : ShieldAlert;
  return <button type="button" className={`shield-chip is-${tone}`} onClick={onOpen} aria-haspopup="dialog"
    aria-label={`Fraud Shield: ${shieldLabel(shield.flags)}. Select to see details.`}>
    <Icon size={14} aria-hidden="true" /> {shieldLabel(shield.flags)}</button>;
}

export function ShieldFlagList({ flags, prefix }: { flags: readonly FraudFlag[]; prefix: string }) {
  if (flags.length === 0) return <p>No warnings. These checks compare this document with your earlier ones: supplier bank account, near-duplicates, new suppliers with large amounts, and who submitted and approved.</p>;
  return <ul className="shield-flags">
    {flags.map((flag, index) => <li key={`${flag.code}-${index}`} className={`shield-flag is-${flag.severity}`}>
      <div className="shield-flag-head"><span className="shield-sev">{SEVERITY_TEXT[flag.severity]}</span><strong>{flag.title || flag.message}</strong></div>
      {flag.title && flag.message && <p className="shield-message">{flag.message}</p>}
      {flag.evidence.length > 0 && <ul className="shield-evidence" aria-label="Evidence">
        {flag.evidence.map((entry, i) => {
          const href = resolveEvidenceHref(entry.href, prefix);
          return <li key={`${entry.label}-${i}`}><span>{entry.label}</span>{href ? <Link href={href}>{entry.value || "Open"}</Link> : <strong>{entry.value}</strong>}</li>;
        })}
      </ul>}
      {flag.action && <p className="shield-action"><strong>Suggested: </strong>{flag.action}</p>}
    </li>)}
  </ul>;
}

export function ShieldPanel({ shield, prefix, onClose, onRetry }: { shield: ShieldState; prefix: string; onClose: () => void; onRetry: () => void }) {
  return <Modal title="Fraud Shield" onClose={onClose}>
    <div className="shield-panel">
      {shield.status === "error"
        ? <div role="alert"><p>The fraud check could not run, so nothing is known about this document either way. You can still review and approve it.</p>
          <button type="button" className="btn small" onClick={onRetry}>Try again</button></div>
        : <ShieldFlagList flags={shield.flags} prefix={prefix} />}
      {!!shield.acknowledgements?.length && <div className="shield-acks"><strong>Earlier reasons recorded for approving anyway</strong>
        <ul>{shield.acknowledgements.map((ack, index) => <li key={index}>{ack.codes.join(", ")}: {ack.reason} <small>({ack.by}{ack.at ? `, ${ack.at.slice(0, 10)}` : ""})</small></li>)}</ul></div>}
      <p className="shield-note"><small>Warnings are advice from automatic checks. They do not block anything, and a person decides.</small></p>
    </div>
  </Modal>;
}

/** The reason box. Approve anyway stays disabled until the reason is long enough to mean something. */
export function ApproveAnywayForm({ flags, prefix, busy, onConfirm, onCancel }: {
  flags: readonly FraudFlag[]; prefix: string; busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const inputId = useId();
  return <div className="shield-anyway">
    <p>This document has {flags.length === 1 ? "a fraud warning" : `${flags.length} fraud warnings`}. You can still approve it, but say why it is safe.</p>
    <ShieldFlagList flags={flags} prefix={prefix} />
    <label htmlFor={inputId}>Why is it safe to approve this anyway?</label>
    <textarea id={inputId} rows={3} value={reason} maxLength={APPROVE_ANYWAY_MAX} disabled={busy} onChange={(event) => setReason(event.target.value)}
      placeholder="For example: confirmed the new bank account with the supplier by phone." />
    <small>At least {APPROVE_ANYWAY_MIN} characters. This goes on the approval record with your name.</small>
    <div className="shield-anyway-buttons">
      <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="btn danger" disabled={busy || !approveAnywayReady(reason)} onClick={() => onConfirm(reason)}>Approve anyway</button>
    </div>
  </div>;
}

export function ApproveAnywayDialog(props: { flags: readonly FraudFlag[]; prefix: string; busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  return <Modal title="Approve despite warnings?" onClose={props.onCancel} closeDisabled={props.busy}><ApproveAnywayForm {...props} /></Modal>;
}

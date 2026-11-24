"use client";
/**
 * Setting a wrong upload aside (a duplicate, another company's document, our own sales copy, an unreadable photo).
 * It leaves every list, count and report with a reason, and a local admin can restore it (audit 24 Nov).
 * The same reason form is used at the bottom of the review tab (SetAsideControl) and as a row action on
 * All documents and Exceptions (SetAsideRowAction), both calling POST /api/documents/{id}/exclude.
 */
import Link from "next/link";
import { useState } from "react";
import { DataTable, ErrorState, LoadingState, Modal, formatDate } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { excludeDocument, listExcludedDocuments, restoreDocument, type ExcludedDocument } from "@/lib/api/document.service";
import { documentKindLabel } from "@/lib/glossary";

/** Document statuses the backend lets a person set aside (not submitted, approved or being read). */
export const SET_ASIDE_STATUSES = new Set(["UPLOADED", "FAILED", "EXTRACTED", "CORRECTED", "EXCEPTION"]);
/** The backend's minimum reason length (ExcludeInput). */
export const SET_ASIDE_REASON_MIN = 5;
export const SET_ASIDE_DONE = "Set aside. It no longer appears in lists, counts or reports; a local admin can restore it.";

/** A row may offer "Set aside…" only for a status the backend accepts. */
export function canSetAside(status: string | undefined | null) {
  return SET_ASIDE_STATUSES.has(String(status ?? "").toUpperCase());
}

export function setAsideReasonReady(reason: string) {
  return reason.trim().length >= SET_ASIDE_REASON_MIN;
}

/** The reason input and Set aside / Cancel buttons; calls the API and reports the outcome. */
function SetAsideReasonForm({ documentId, onDone, onCancel, inputId, stacked = false }: {
  documentId: string; onDone: (message: string) => void; onCancel: () => void; inputId: string; stacked?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const setAside = <button type="button" className="btn danger" disabled={saving || !setAsideReasonReady(reason)} onClick={async () => {
    setSaving(true); setFailure("");
    try { await excludeDocument(documentId, reason.trim()); onDone(SET_ASIDE_DONE); }
    catch (error) { setFailure((error as Error).message); }
    finally { setSaving(false); }
  }}>{saving ? "Saving…" : "Set aside"}</button>;
  const cancel = <button type="button" className="btn" disabled={saving} onClick={onCancel}>Cancel</button>;
  // Inline under the review tab; stacked (label, full-width input, then the buttons) inside the row-action dialog.
  return <div className={stacked ? "set-aside-form" : "review-set-aside"} role="group" aria-label="Set this document aside">
    <label htmlFor={inputId}>Why? (a duplicate, not this company’s, unreadable…)</label>
    <input id={inputId} value={reason} disabled={saving} maxLength={500} autoFocus={stacked} onChange={(event) => setReason(event.target.value)} />
    {stacked ? <div className="modal-actions">{cancel}{setAside}</div> : <>{setAside}{cancel}</>}
    {failure && <p className="notice danger" role="alert">{failure}</p>}
  </div>;
}

export function SetAsideControl({ documentId, busy, onDone }: { documentId: string; busy: boolean; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn" disabled={busy} onClick={() => setOpen(true)}>Set aside…</button>;
  return <SetAsideReasonForm documentId={documentId} inputId="set-aside-reason" onCancel={() => setOpen(false)}
    onDone={(message) => { setOpen(false); onDone(message); }} />;
}

/** "Set aside…" in a list's Action column: opens the reason form in a dialog, then the list refreshes (onDone). */
export function SetAsideRowAction({ documentId, label, onDone }: { documentId: string; label: string; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="text-link" aria-label={`Set aside ${label}`} onClick={() => setOpen(true)}>Set aside…</button>
    {open && <Modal title={`Set aside ${label}`} onClose={() => setOpen(false)}>
      <div className="panel-body set-aside-dialog">
        <p>It leaves every list, count and report, and nothing is posted from it. The reason and your name are kept in the audit trail; a local admin can restore it from Set-aside documents at the bottom of All documents.</p>
        <SetAsideReasonForm stacked documentId={documentId} inputId={`set-aside-reason-${documentId}`} onCancel={() => setOpen(false)}
          onDone={(message) => { setOpen(false); onDone(message); }} />
      </div>
    </Modal>}
  </>;
}

export function SetAsideBanner({ excludedAt, reason, canRestore, documentId, onRestored }: {
  excludedAt: string; reason?: string | null; canRestore: boolean; documentId: string; onRestored: () => void;
}) {
  const [failure, setFailure] = useState("");
  return <div className="notice warning" role="status">
    <strong>Set aside on {formatDate(excludedAt)}</strong>{reason ? `: ${reason}` : ""}. It is left out of every list, count and report.
    {canRestore && <> <button type="button" className="btn small" onClick={async () => {
      try { await restoreDocument(documentId); onRestored(); } catch (error) { setFailure((error as Error).message); }
    }}>Restore</button></>}
    {failure && <p role="alert">{failure}</p>}
  </div>;
}

/** The set-aside documents, newest first, with Restore for a local admin. Loaded only when opened.
 * `version` changes when a row action sets a document aside, so an open list reloads. */
export function SetAsideList({ base, canRestore, version = 0, onRestored }: {
  base: string; canRestore: boolean; version?: number; onRestored?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <details className="review-field-group set-aside-list" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>Set-aside documents</span><small>Duplicates and wrong uploads left out of the lists</small></summary>
    {open && <SetAsideRows base={base} canRestore={canRestore} version={version} onRestored={onRestored} />}
  </details>;
}

function SetAsideRows({ base, canRestore, version, onRestored }: { base: string; canRestore: boolean; version: number; onRestored?: () => void }) {
  const { data, loading, error, refresh } = useResource(listExcludedDocuments, `excluded-documents:${version}`);
  const [failure, setFailure] = useState("");
  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return <>
    {failure && <p className="notice danger" role="alert">{failure}</p>}
    <DataTable rows={data} rowKey={(row) => row.id} emptyMessage="No document is set aside." columns={[
      { label: "Document", render: (row) => <Link className="text-link" href={`${base}/documents/${encodeURIComponent(row.id)}`}>{row.code || row.name}</Link> },
      { label: "Type", render: (row) => documentKindLabel(row.kind) },
      { label: "Set aside", render: (row) => formatDate(row.excludedAt) },
      { label: "By", render: (row) => row.excludedBy || "—" },
      { label: "Reason", render: (row) => row.reason || "—" },
      ...(canRestore ? [{ label: "Action", render: (row: ExcludedDocument) => <button type="button" className="btn small" onClick={async () => {
        setFailure("");
        try { await restoreDocument(row.id); await refresh(); onRestored?.(); } catch (e) { setFailure((e as Error).message); }
      }}>Restore</button> }] : []),
    ]} />
  </>;
}

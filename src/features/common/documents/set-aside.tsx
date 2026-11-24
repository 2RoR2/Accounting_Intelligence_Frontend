"use client";
/**
 * Setting a wrong upload aside (a duplicate, another company's document, our own sales copy, an unreadable photo).
 * It leaves every list, count and report with a reason, and a local admin can restore it (audit 24 Nov).
 */
import Link from "next/link";
import { useState } from "react";
import { DataTable, ErrorState, LoadingState, formatDate } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { excludeDocument, listExcludedDocuments, restoreDocument, type ExcludedDocument } from "@/lib/api/document.service";
import { documentKindLabel } from "@/lib/glossary";

/** Document statuses the backend lets a person set aside (not submitted, approved or being read). */
export const SET_ASIDE_STATUSES = new Set(["UPLOADED", "FAILED", "EXTRACTED", "CORRECTED", "EXCEPTION"]);

export function SetAsideControl({ documentId, busy, onDone }: { documentId: string; busy: boolean; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  if (!open) return <button type="button" className="btn" disabled={busy} onClick={() => setOpen(true)}>Set aside…</button>;
  return <div className="review-set-aside" role="group" aria-label="Set this document aside">
    <label htmlFor="set-aside-reason">Why? (a duplicate, not this company’s, unreadable…)</label>
    <input id="set-aside-reason" value={reason} disabled={saving} maxLength={500} onChange={(event) => setReason(event.target.value)} />
    <button type="button" className="btn danger" disabled={saving || reason.trim().length < 5} onClick={async () => {
      setSaving(true); setFailure("");
      try { await excludeDocument(documentId, reason.trim()); setOpen(false); onDone("Set aside. It no longer appears in lists, counts or reports; a local admin can restore it."); }
      catch (error) { setFailure((error as Error).message); }
      finally { setSaving(false); }
    }}>{saving ? "Saving…" : "Set aside"}</button>
    <button type="button" className="btn" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
    {failure && <p className="notice danger" role="alert">{failure}</p>}
  </div>;
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

/** The set-aside documents, newest first, with Restore for a local admin. Loaded only when opened. */
export function SetAsideList({ base, canRestore }: { base: string; canRestore: boolean }) {
  const [open, setOpen] = useState(false);
  return <details className="review-field-group set-aside-list" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>Set-aside documents</span><small>Duplicates and wrong uploads left out of the lists</small></summary>
    {open && <SetAsideRows base={base} canRestore={canRestore} />}
  </details>;
}

function SetAsideRows({ base, canRestore }: { base: string; canRestore: boolean }) {
  const { data, loading, error, refresh } = useResource(listExcludedDocuments, "excluded-documents");
  const [failure, setFailure] = useState("");
  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return <>
    {failure && <p className="notice danger" role="alert">{failure}</p>}
    <DataTable rows={data} rowKey={(row) => row.id} emptyMessage="No document is set aside." columns={[
      { label: "Document", render: (row) => <Link className="text-link" href={`${base}/documents/${encodeURIComponent(row.id)}`}>{row.code || row.name}</Link> },
      { label: "Type", render: (row) => documentKindLabel(row.kind) },
      { label: "Set aside", render: (row) => formatDate(row.excludedAt) },
      { label: "Reason", render: (row) => row.reason || "—" },
      ...(canRestore ? [{ label: "Action", render: (row: ExcludedDocument) => <button type="button" className="btn small" onClick={async () => {
        setFailure("");
        try { await restoreDocument(row.id); await refresh(); } catch (e) { setFailure((e as Error).message); }
      }}>Restore</button> }] : []),
    ]} />
  </>;
}

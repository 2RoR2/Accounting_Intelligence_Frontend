"use client";

import { useState, type FormEvent } from "react";
import { DataTable, EmptyState, Field, LoadingState, Modal, Panel, formatDate } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  createDocumentShare, getSharingStatus, listDocumentShares, revokeDocumentShare,
  type DocumentShare, type DocumentType, type ShareStatus, type TypedDocument,
} from "@/lib/api/erp.service";
import type { User } from "@/types";

const SHARE_STATUSES = {
  active: { label: "Active", tone: "green" },
  expired: { label: "Expired", tone: "amber" },
  revoked: { label: "Revoked", tone: "neutral" },
} as const;

export function shareLinkStatus(status: ShareStatus) {
  return SHARE_STATUSES[status];
}

export function ShareLinksPanel({ user, type, document }: {
  user: Pick<User, "role">; type: DocumentType; document: TypedDocument;
}) {
  if (document.status !== "ready") return null;
  return <ShareLinksGate key={`${user.role}:${type}:${document.id}`} type={type} id={document.id} />;
}

function ShareLinksGate({ type, id }: { type: DocumentType; id: string }) {
  const { data } = useResource(getSharingStatus, "share-links-status");
  return data?.shareLinks ? <EnabledShareLinks type={type} id={id} /> : null;
}

function EnabledShareLinks({ type, id }: { type: DocumentType; id: string }) {
  const { data, error, loading, refresh, setData } = useResource(() => listDocumentShares(type, id), id);
  const [recipient, setRecipient] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [newUrl, setNewUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const { url, ...share } = await createDocumentShare(type, id, { expiresInDays, recipient: recipient.trim() || undefined });
      setNewUrl(shareUrlForThisSite(url, window.location.origin));
      setRecipient("");
      setData((rows) => [share, ...(rows ?? []).filter((row) => row.id !== share.id)]);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to create the share link.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(share: DocumentShare) {
    if (busy || !window.confirm("Revoke this share link? Anyone with the link will lose access.")) return;
    setBusy(true);
    setActionError("");
    try {
      const revoked = await revokeDocumentShare(share.id);
      setData((rows) => rows?.map((row) => row.id === revoked.id ? revoked : row));
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to revoke the share link.");
    } finally {
      setBusy(false);
    }
  }

  return <Panel title="Share links">
    {loading && <LoadingState variant="table" />}
    {error && <div className="notice danger error-state" role="alert">
      <p>{error}</p>
      <button type="button" className="btn small" onClick={() => void refresh()}>Try again</button>
    </div>}
    {data && (data.length ? <DataTable rows={data} rowKey={(row) => row.id} columns={[
      { label: "Recipient", render: (row) => row.recipient || "—" },
      { label: "Status", render: (row) => {
        const { label, tone } = shareLinkStatus(row.status);
        return <span className={`badge ${tone}`}><span className="badge-dot" />{label}</span>;
      } },
      { label: "Expires", render: (row) => formatDate(row.expiresAt.replace(" ", "T")) },
      { label: "Opened", render: (row) => row.openCount },
      { label: "Actions", render: (row) => row.status === "active" &&
        <button type="button" className="btn small" disabled={busy} onClick={() => void revoke(row)}>Revoke</button> },
    ]} /> : <EmptyState message="No share links have been created." />)}
    <form className="p-5" aria-busy={busy} onSubmit={create}>
      {actionError && <div className="notice danger error-state" role="alert">{actionError}</div>}
      <fieldset className="grid min-w-0 gap-x-4 border-0 p-0 sm:grid-cols-2" disabled={busy}>
        <Field label="Recipient (optional)">
          <input value={recipient} maxLength={254} onChange={(event) => setRecipient(event.target.value)} />
        </Field>
        <Field label="Expires after">
          <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
            {[1, 7, 14, 30].map((days) => <option key={days} value={days}>{days} {days === 1 ? "day" : "days"}</option>)}
          </select>
        </Field>
      </fieldset>
      <button type="submit" className="btn primary" disabled={busy}>Create share link</button>
    </form>
    {newUrl && <NewShareLink url={newUrl} onClose={() => setNewUrl(undefined)} />}
  </Panel>;
}

function NewShareLink({ url, onClose }: { url: string; onClose: () => void }) {
  const [copyMessage, setCopyMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Select the link and copy it manually.");
    }
  }

  return <Modal title="Share link created" onClose={onClose}>
    <Field label="Share link" hint="Copy this link before closing. It will not be shown again.">
      <input value={url} readOnly onFocus={(event) => event.target.select()} />
    </Field>
    <p role="status">{copyMessage}</p>
    <div className="modal-actions">
      <button type="button" className="btn" onClick={onClose}>Done</button>
      <button type="button" className="btn primary" onClick={() => void copy()}>Copy</button>
    </div>
  </Modal>;
}

/** The backend builds the link from its own setting; keep only its /share/<token> path and use this site's address,
 *  so a hosted copy never hands out a loopback (127.0.0.1) link. */
export function shareUrlForThisSite(url: string, origin: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith("/share/") ? new URL(pathname, origin).toString() : url;
  } catch {
    return url;
  }
}

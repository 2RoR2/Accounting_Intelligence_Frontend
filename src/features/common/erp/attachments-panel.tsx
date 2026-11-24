"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { EmptyState, Field, LoadingState, Panel, formatDate } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { openInNewTab } from "@/lib/api/client";
import {
  addAttachmentLink, listAttachments, removeAttachment, uploadAttachment, type Attachment,
} from "@/lib/api/attachments.service";
import {
  ATTACHMENT_ACCEPT, ATTACHMENTS_CHANGED, canAttach, fileProblem, formatBytes, isImage, linkHost, linkProblem,
  showsSupplierCopy, type AttachmentsChanged,
} from "./attachments-logic";

/** Tell the other view of this record's attachments (the supplier's copy beside a bill) that they changed. */
export function announceAttachments(type: string, id: string) {
  globalThis.dispatchEvent(new CustomEvent<AttachmentsChanged>(ATTACHMENTS_CHANGED, { detail: { type, id } }));
}

/** Refresh when another view of this record's attachments changed them. */
export function useAttachmentsChanged(type: string, id: string, refresh: () => unknown) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AttachmentsChanged>).detail;
      if (detail?.type === type && detail.id === id) void refresh();
    };
    globalThis.addEventListener(ATTACHMENTS_CHANGED, handler);
    return () => globalThis.removeEventListener(ATTACHMENTS_CHANGED, handler);
  }, [type, id, refresh]);
}

/** Proof for a payment, refund, money in/out, bank transfer or manual journal: receipt photos, bank slips, PDFs or https links. */
export function AttachmentsPanel({ type, id }: { type: string; id: string }) {
  if (!canAttach(type) || id === "new") return null;
  return <AttachmentsBox key={`${type}:${id}`} type={type} id={id} />;
}

function AttachmentsBox({ type, id }: { type: string; id: string }) {
  const { data, error, loading, refresh, setData } = useResource(() => listAttachments(type, id), `attachments:${type}:${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const items = data?.items ?? [];
  const full = !!data && items.length >= data.maxItems;
  useAttachmentsChanged(type, id, refresh);

  async function run(action: () => Promise<{ items: Attachment[] }>, failure: string) {
    if (busy) return false;
    setBusy(true);
    setActionError("");
    try {
      const changed = await action();
      setData((current) => current ? { ...current, items: changed.items } : current);
      announceAttachments(type, id);
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setActionError(problem);
      return;
    }
    await run(() => uploadAttachment(type, id, file), "Unable to attach the file.");
  }

  async function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = linkProblem(url);
    if (problem) {
      setActionError(problem);
      return;
    }
    const added = await run(() => addAttachmentLink(type, id, { url: url.trim(), name: name.trim() || undefined }), "Unable to attach the link.");
    if (added) {
      setUrl("");
      setName("");
    }
  }

  async function remove(item: Attachment) {
    if (busy || !window.confirm(`Remove "${item.name}" from this record? It will no longer be listed.`)) return;
    await run(() => removeAttachment(item.id), "Unable to remove the attachment.");
  }

  const supplier = showsSupplierCopy(type);
  return <Panel title="Attachments" subtitle={supplier
    ? "The supplier's own copy (PDF or photo), or a link to it. The first file shows beside the form."
    : "Receipt photo, bank slip, PDF or a link that backs this record."}>
    {loading && <LoadingState variant="table" />}
    {error && <div className="notice danger error-state" role="alert">
      <p>{error}</p>
      <button type="button" className="btn small" onClick={() => void refresh()}>Try again</button>
    </div>}
    {data && (items.length
      ? <ul className="m-0 grid list-none gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Attached proof">
        {items.map((item) => <AttachmentCard key={item.id} item={item} busy={busy} onRemove={() => void remove(item)} />)}
      </ul>
      : <EmptyState message={supplier ? "No supplier copy attached yet." : "No proof attached yet."} />)}
    {data && <div className="p-5" aria-busy={busy}>
      {actionError && <div className="notice danger error-state" role="alert">{actionError}</div>}
      {full
        ? <p role="status">This record holds {data.maxItems} attachments. Remove one to add another.</p>
        : <>
          <div className="mb-4">
            <input ref={picker} type="file" className="sr-only" aria-label="Attach a file" accept={ATTACHMENT_ACCEPT}
              disabled={busy} onChange={(event) => void chooseFile(event)} />
            <button type="button" className="btn" disabled={busy} onClick={() => picker.current?.click()}>
              {busy ? "Working…" : "Add file"}
            </button>
            <span className="ml-3 text-sm">PDF, PNG, JPEG or WebP, up to {Math.round(data.maxBytes / (1024 * 1024))} MB.</span>
          </div>
          <form onSubmit={(event) => void addLink(event)}>
            <fieldset className="grid min-w-0 gap-x-4 border-0 p-0 sm:grid-cols-2" disabled={busy}>
              <Field label="Link (https://)">
                <input type="url" inputMode="url" value={url} maxLength={2000} placeholder="https://"
                  onChange={(event) => setUrl(event.target.value)} />
              </Field>
              <Field label="Label (optional)">
                <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
              </Field>
            </fieldset>
            <button type="submit" className="btn" disabled={busy || !url.trim()}>Add link</button>
          </form>
        </>}
    </div>}
  </Panel>;
}

function AttachmentCard({ item, busy, onRemove }: { item: Attachment; busy: boolean; onRemove: () => void }) {
  const [broken, setBroken] = useState(false);
  const [openError, setOpenError] = useState("");
  const fileUrl = item.fileUrl;

  async function open() {
    if (!fileUrl) return;
    setOpenError("");
    try {
      await openInNewTab(fileUrl, item.name);
    } catch (caught) {
      setOpenError(caught instanceof Error ? caught.message : "Unable to open this file.");
    }
  }

  return <li className="flex min-w-0 flex-col gap-2 rounded border p-3" data-attachment={item.kind}>
    {fileUrl && isImage(item.mediaType) && !broken
      ? <button type="button" className="block w-full border-0 bg-transparent p-0" onClick={() => void open()} aria-label={`Open ${item.name}`}>
        {/* A same-site, cookie-authenticated image; next/image cannot fetch it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl} alt={`Preview of ${item.name}`} loading="lazy" className="h-32 w-full rounded object-cover"
          onError={() => setBroken(true)} />
      </button>
      : <div className="flex h-32 w-full items-center justify-center rounded bg-black/5 text-sm font-semibold" aria-hidden="true">
        {item.kind === "link" ? "LINK" : item.mediaType === "application/pdf" ? "PDF" : "FILE"}
      </div>}
    <div className="min-w-0">
      <p className="m-0 truncate font-semibold" title={item.name}>{item.name}</p>
      <p className="m-0 text-sm">
        {item.kind === "link" && item.url
          ? <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">{linkHost(item.url)}</a>
          : formatBytes(item.sizeBytes)}
        {" · "}{item.uploadedBy ?? "Unknown"} · {formatDate(item.createdAt)}
      </p>
      {openError && <p className="m-0 text-sm" role="alert">{openError}</p>}
    </div>
    <div className="flex gap-2">
      {fileUrl && <button type="button" className="btn small" onClick={() => void open()}>Open</button>}
      <button type="button" className="btn small" disabled={busy} onClick={onRemove} aria-label={`Remove ${item.name}`}>Remove</button>
    </div>
  </li>;
}

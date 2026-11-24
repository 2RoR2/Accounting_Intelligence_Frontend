"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useResource } from "@/features/common/hooks/use-resource";
import { fetchBlob } from "@/lib/api/client";
import { listAttachments, uploadAttachment } from "@/lib/api/attachments.service";
import { ATTACHMENT_ACCEPT, fileProblem, isImage, linkHost, viewableCopies } from "./attachments-logic";
import { announceAttachments, useAttachmentsChanged } from "./attachments-panel";

/** Beside a typed bill or supplier note: the supplier's own copy (the first PDF or image under Attachments), so whoever
 * checks or approves it compares the figures with the paper, as on the scanned-document review page. Nothing here is
 * drawn by us: a bill is the supplier's document, so there is no printed preview of it. */
export function SupplierCopy({ type, documentId }: { type: string; documentId?: string }) {
  if (!documentId) {
    return <aside className="doc-preview" aria-label="Supplier's copy">
      <div className="doc-preview-bar"><strong>Supplier&apos;s copy</strong></div>
      <p className="doc-preview-empty">Save first, then attach the supplier&apos;s copy (PDF or photo) here so it can be
        compared with these figures.</p>
    </aside>;
  }
  return <SupplierCopyView key={`${type}:${documentId}`} type={type} id={documentId} />;
}

function SupplierCopyView({ type, id }: { type: string; id: string }) {
  const { data, error, loading, refresh } = useResource(() => listAttachments(type, id), `supplier-copy:${type}:${id}`);
  useAttachmentsChanged(type, id, refresh);
  const items = data?.items ?? [];
  const copies = viewableCopies(items);
  const links = items.filter((item) => item.kind === "link" && item.url);
  const [chosen, setChosen] = useState(0);
  const index = Math.min(chosen, Math.max(copies.length - 1, 0));
  const copy = copies[index];
  const [url, setUrl] = useState<string | null>(null);
  const [viewError, setViewError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const fileUrl = copy?.fileUrl ?? null;

  useEffect(() => {
    if (!fileUrl) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    setViewError("");
    setUrl(null);
    fetchBlob(fileUrl).then((blob) => {
      if (cancelled) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    }).catch((problem: unknown) => {
      if (!cancelled) setViewError(problem instanceof Error ? problem.message : "Unable to show the supplier's copy.");
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [fileUrl]);

  async function attach(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    const problem = fileProblem(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setBusy(true);
    setUploadError("");
    try {
      await uploadAttachment(type, id, file);
      announceAttachments(type, id);
      await refresh();
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : "Unable to attach the file.");
    } finally {
      setBusy(false);
    }
  }

  return <aside className="doc-preview" aria-label="Supplier's copy">
    <div className="doc-preview-bar">
      <strong>Supplier&apos;s copy</strong>
      {/* With several files the picker names the one shown; with one, its name sits here. */}
      <span role="status" className="min-w-0 truncate" title={copy?.name}>
        {busy ? "Attaching…" : copy && copies.length === 1 ? copy.name : ""}</span>
      {copies.length > 1 && <select className="min-w-0 max-w-[16rem] truncate" aria-label="Choose the attached file to show" value={index}
        onChange={(event) => setChosen(Number(event.target.value))}>
        {copies.map((item, position) => <option key={item.id} value={position}>{position + 1}. {item.name}</option>)}
      </select>}
      {url && <a className="btn small" href={url} target="_blank" rel="noreferrer">Open full size</a>}
    </div>
    {loading && <p className="doc-preview-empty">Loading the supplier&apos;s copy…</p>}
    {error && <p className="notice warning" role="status">{error}</p>}
    {viewError && <p className="notice warning" role="status">{viewError}</p>}
    {copy && url && (isImage(copy.mediaType)
      // A blob URL made from the stored file; next/image cannot load it.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={url} alt={`Supplier's copy: ${copy.name}`} className="doc-preview-frame" style={{ objectFit: "contain" }} />
      : <iframe title={`Supplier's copy: ${copy.name}`} className="doc-preview-frame" src={`${url}#view=FitH`} />)}
    {copy && !url && !viewError && <p className="doc-preview-empty">Opening {copy.name}…</p>}
    {data && !copy && <div className="doc-preview-empty">
      <p className="m-0"><strong>No supplier copy attached yet.</strong></p>
      <p>Attach the bill the supplier sent (PDF or photo) so it can be compared with these figures before approval.</p>
      {links.length > 0 && <p>Linked:{" "}
        {links.map((item, position) => <span key={item.id}>{position ? ", " : ""}
          <a href={item.url!} target="_blank" rel="noopener noreferrer nofollow">{item.name || linkHost(item.url!)}</a></span>)}
      </p>}
      <input ref={picker} type="file" className="sr-only" aria-label="Attach the supplier's copy" accept={ATTACHMENT_ACCEPT}
        disabled={busy} onChange={(event) => void attach(event)} />
      <button type="button" className="btn primary" disabled={busy} onClick={() => picker.current?.click()}>
        {busy ? "Attaching…" : "Attach the supplier's copy"}</button>
      {uploadError && <p className="notice danger" role="alert">{uploadError}</p>}
    </div>}
  </aside>;
}

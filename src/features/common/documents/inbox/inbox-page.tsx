"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Camera, FileText, FolderOpen, RotateCcw, UploadCloud } from "lucide-react";
import type { User } from "@/types";
import { Field, PageHeader, Panel } from "@/components/common/ui";
import { documentKindLabel } from "@/lib/glossary";
import { getDocument, retryDocumentProcessing, uploadDocument } from "@/lib/api/document.service";
import { CameraCapture } from "@/features/common/documents/camera-capture";
import { filesFromDrop, keepFromFolder, namePasted } from "./collect-files";
import {
  InboxQueue,
  PENDING_CODE_PREFIX,
  isFinal,
  queueOwnerKey,
  summarise,
  type InboxCategory,
  type InboxItem,
  type InboxState,
} from "./inbox-queue";

const POLL_MS = 2500;

/** Plain words for each file's state (same voice as the glossary: what is happening, what to do). */
const STATE_LABEL: Record<InboxState, string> = {
  waiting: "Waiting to upload",
  uploading: "Uploading",
  queued: "In line to be read",
  reading: "Reading",
  ready: "Ready to check",
  needs_fixing: "Needs fixing",
  duplicate: "Already uploaded",
  failed: "Not uploaded",
};
const STATE_TONE: Record<InboxState, "green" | "red" | "amber" | "neutral"> = {
  waiting: "neutral", uploading: "neutral", queued: "neutral", reading: "neutral",
  ready: "green", needs_fixing: "amber", duplicate: "amber", failed: "red",
};

function stateLabel(item: InboxItem) {
  if (item.retrying) return "Sending again";
  if (item.state === "failed" && item.retry === "refresh") return "Status unknown";
  if (item.state === "failed" && item.documentId) return "Could not read";
  return STATE_LABEL[item.state];
}

function stateTone(item: InboxItem) {
  // Status unknown is not a failure of the file: the server may still be reading it.
  if (item.retrying || (item.state === "failed" && item.retry === "refresh")) return "amber";
  return STATE_TONE[item.state];
}

function typeText(item: InboxItem) {
  const pending = item.kindDetected === false || item.code?.startsWith(PENDING_CODE_PREFIX);
  if (item.kind && !pending) return documentKindLabel(item.kind);
  if (item.state === "queued" || item.state === "reading" || item.state === "uploading") return "Type: detecting";
  if (pending) return "Type not detected";
  return null;
}

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function InboxPage({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const searchParams = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<InboxCategory>("ACCOUNTS_PAYABLE");
  const [camera, setCamera] = useState(() => searchParams.get("source") === "camera");
  const [dragging, setDragging] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [tooDeep, setTooDeep] = useState(0);
  const [chosenKind, setChosenKind] = useState<"INVOICE" | "BILL" | "RECEIPT">("BILL");

  // The signed-in user is re-fetched as a new object on some events (a theme or sidebar change in another
  // tab fires `storage`). The queue belongs to the person and company, not to that object, so it survives;
  // calls always use the latest user object.
  const latestUser = useRef(user);
  useEffect(() => { latestUser.current = user; }, [user]);
  const owner = queueOwnerKey(user);
  const queue = useMemo(() => {
    void owner;
    return new InboxQueue<File>({
      upload: (file, kind, chosenCategory) => uploadDocument(latestUser.current, file, "real", chosenCategory, kind),
      getDocument: (documentId) => getDocument(latestUser.current, documentId),
      retryReading: (documentId) => retryDocumentProcessing(latestUser.current, documentId),
    });
  }, [owner]);
  // No dispose on unmount: uploads already started keep going if the accountant moves to another page.
  const items = useSyncExternalStore(
    (listener) => queue.subscribe(listener),
    () => queue.getItems(),
    () => queue.getItems(),
  );
  const summary = summarise(items);
  const open = items.some((item) => !isFinal(item.state));
  const sending = items.some((item) => item.state === "waiting" || item.state === "uploading");

  // Follow files the server holds until each reaches a final state.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => { void queue.tick(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, queue]);

  // Closing the tab stops uploads that have not been sent yet; reading continues on the server.
  useEffect(() => {
    if (!sending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

  // Paste anywhere on the page (Ctrl+V), except into a text field.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (!pasted.length) return;
      event.preventDefault();
      queue.add(pasted.map((file) => namePasted(file)), category);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [queue, category]);

  // React has no typed prop for folder picking; set the attribute directly.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  const addFolder = (files: File[]) => {
    const folder = keepFromFolder(files);
    setSkipped(folder.skipped);
    setTooDeep(0);
    queue.add(folder.files, category);
  };

  return (
    <div className="upload-reference-page inbox-page">
      <PageHeader
        title="Upload documents"
        description="Drop the day’s bills, invoices and receipts, many at once. We work out the type and read each one; you only check what needs you."
      />
      <div className="upload-layout">
        <Panel title="Add your documents" subtitle="PDFs and phone photos · up to 20 MB each">
          <div className="panel-body">
            <Field label="Who sent these?" hint="Applies to the files you add next. The document type is detected for you.">
              <select value={category} onChange={(event) => setCategory(event.target.value as InboxCategory)}>
                <option value="ACCOUNTS_PAYABLE">Suppliers: bills and receipts we pay (money out)</option>
                <option value="ACCOUNTS_RECEIVABLE">Us: invoices we sent to customers (money in)</option>
              </select>
            </Field>
            <div className="upload-sources">
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                <UploadCloud size={16} /> Choose files
              </button>
              <button type="button" className="btn" onClick={() => folderInput.current?.click()}>
                <FolderOpen size={16} /> Choose a folder
              </button>
              <button type="button" className="btn primary" onClick={() => setCamera(true)}>
                <Camera size={16} /> Use camera
              </button>
            </div>
            {camera ? (
              <CameraCapture
                onClose={() => setCamera(false)}
                onConfirm={(file) => {
                  queue.add([file], category);
                  setCamera(false);
                }}
              />
            ) : (
              <button
                type="button"
                className={`drop-zone ${dragging ? "dragging" : ""}`}
                aria-label="Drop files or a folder here, or press Ctrl+V to paste. Opens the file picker."
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void filesFromDrop(event.dataTransfer).then((dropped) => {
                    setSkipped(dropped.skipped);
                    setTooDeep(dropped.tooDeep);
                    queue.add(dropped.files, category);
                  });
                }}
                onClick={() => fileInput.current?.click()}
              >
                <span className="upload-icon"><UploadCloud size={30} /></span>
                <strong>Drop files or a whole folder here</strong>
                <span>Or press Ctrl+V to paste a copied file or photo, or <b>browse files</b></span>
                <small>No need to choose the type. Each file starts uploading as soon as you add it.</small>
              </button>
            )}
            <input ref={fileInput} hidden multiple type="file" accept=".pdf,.png,.jpg,.jpeg"
              onChange={(event) => { queue.add(Array.from(event.target.files ?? []), category); event.target.value = ""; }} />
            <input ref={folderInput} hidden multiple type="file"
              onChange={(event) => { addFolder(Array.from(event.target.files ?? [])); event.target.value = ""; }} />

            {queue.needsType && (
              <div className="processing-banner inbox-type-needed" role="alert">
                <span>This server cannot detect the type yet. Choose one type for the waiting files:</span>
                <select aria-label="Type for the waiting files" value={chosenKind} onChange={(event) => setChosenKind(event.target.value as typeof chosenKind)}>
                  <option value="BILL">Bill</option>
                  <option value="INVOICE">Invoice</option>
                  <option value="RECEIPT">Receipt</option>
                </select>
                <button type="button" className="btn small primary" onClick={() => queue.chooseKind(chosenKind)}>Continue</button>
              </div>
            )}
            {skipped > 0 && (
              <p className="inbox-skipped" role="status">
                Left out {skipped} item{skipped === 1 ? "" : "s"} from the folder: not a PDF or photo, or could not be opened.
                {tooDeep > 0 && ` Some folders are nested too deeply (${tooDeep}); upload them separately.`}
              </p>
            )}

            {items.length > 0 && (
              <div className="inbox-summary" role="status" aria-live="polite">
                <div className="upload-queue-header">
                  <strong>{summary.done} of {summary.total} finished</strong>
                  <span>
                    {[summary.ready && `${summary.ready} ready to check`, summary.needs_fixing && `${summary.needs_fixing} need fixing`,
                      summary.duplicate && `${summary.duplicate} already uploaded`, summary.failed && `${summary.failed} not uploaded`]
                      .filter(Boolean).join(" · ") || "Working…"}
                  </span>
                </div>
                <div className="upload-progress-track"><span style={{ width: `${summary.total ? Math.round((summary.done / summary.total) * 100) : 0}%` }} /></div>
                <div className="inbox-summary-actions">
                  {summary.ready + summary.needs_fixing > 0 && <Link className="btn small primary" href={`${base}/documents`}>Check documents</Link>}
                  {summary.done > 0 && <button type="button" className="btn small" onClick={() => queue.clearFinished()}>Clear finished from list</button>}
                </div>
              </div>
            )}
            <ul className="inbox-list" aria-label="Files in this upload">
              {items.map((item) => (
                <li key={item.key} className="selected-file inbox-row">
                  <FileText size={19} aria-hidden="true" />
                  <div className="inbox-row-main">
                    <strong title={item.path ?? item.name}>{item.name}</strong>
                    {item.path && <small className="inbox-row-note">in {item.path.slice(0, item.path.length - item.name.length).replace(/\/$/, "") || "/"}</small>}
                    <small>
                      {[size(item.size), item.code && !item.code.startsWith(PENDING_CODE_PREFIX) ? item.code : null, typeText(item)].filter(Boolean).join(" · ")}
                    </small>
                    {item.note && <small className="inbox-row-note">{item.note}</small>}
                  </div>
                  <span className={`badge ${stateTone(item)}`}>
                    <span className="badge-dot" />
                    {stateLabel(item)}
                  </span>
                  <div className="inbox-row-actions">
                    {(item.state === "ready" || item.state === "needs_fixing") && item.documentId && (
                      <Link className="text-link" href={`${base}/documents/${item.documentId}`}>{item.state === "ready" ? "Check" : "Fix"}</Link>
                    )}
                    {item.state === "duplicate" && item.existing && (
                      <Link className="text-link" href={`${base}/documents/${item.existing.id}`}>Open {item.existing.code ?? "earlier copy"}</Link>
                    )}
                    {item.state === "failed" && item.retry && !item.retrying && (
                      <button type="button" className="text-link" onClick={() => void queue.retry(item.key)}>
                        <RotateCcw size={13} aria-hidden="true" /> {item.retry === "refresh" ? "Refresh" : "Try again"}
                      </button>
                    )}
                    {item.state === "failed" && item.documentId && (
                      <Link className="text-link" href={`${base}/documents/${item.documentId}`}>Open</Link>
                    )}
                    {(item.state === "waiting" || (item.state === "failed" && (!item.documentId || item.retry === "refresh") && !item.retrying) || item.state === "duplicate") && (
                      <button type="button" className="text-link" aria-label={`Remove ${item.name} from the list`} onClick={() => queue.remove(item.key)}>Remove</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel title="What happens next">
          <div className="panel-body upload-guide">
            {[
              ["01", "Upload", "Three files go up at a time; the rest wait their turn."],
              ["02", "Read", "Each file is read and its type detected: invoice, bill, receipt or note."],
              ["03", "Check", "“Ready to check” files need a quick look. “Needs fixing” files say what to fix."],
              ["04", "Approve", "Nothing is approved or posted until a person approves it."],
            ].map(([number, title, text], index) => (
              <div key={number} className={`step-item${index === 0 ? " is-active" : ""}`}>
                <span className="step-dot" />
                <div className="step-body"><strong>{title}</strong><p>{text}</p></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="upload-reference-note"><strong>For clearer results</strong><span>Keep all document edges visible.</span><span>Use sharp, well-lit photos.</span><span>Upload complete documents, one per file.</span></div>
    </div>
  );
}

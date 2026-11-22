"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  FileText,
  Plus,
  MoreHorizontal,
  UploadCloud,
  Camera,
  Trash2,
} from "lucide-react";
import type { DocumentKind, RecordCategory, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  getDocuments,
  getDocument,
  getSuggestedFixes,
  uploadDocument,
} from "@/lib/api/document.service";
import { getProcessingJob } from "@/lib/api/processing.service";
import { ApiError } from "@/lib/api/client";
import {
  DataTable,
  ErrorState,
  Field,
  Filter,
  LoadingState,
  PageHeader,
  Panel,
  SearchInput,
  formatDate,
  StatusBadge,
} from "@/components/common/ui";
import { documentKindLabel, statusLabel } from "@/lib/glossary";
import { DOCUMENT_LANES, isDocumentLane } from "@/lib/today";
import { CameraCapture } from "@/features/common/documents/camera-capture";
import { bulkSubmitReviews, cancelAccountantBatch, createDocumentBatch } from "@/lib/api/workflow.service";
import { BulkControls, useBulkSelection } from "@/features/common/bulk-actions";
import { bulkResultSummary } from "@/features/common/bulk-selection";

function NeedsFixing({ id, revision }: { id: string; revision?: number }) {
  const { data, error, loading } = useResource(() => getSuggestedFixes(id), `${id}:${revision}`);
  if (loading) return <small>Loading problems…</small>;
  if (error) return <small className="notice danger">{error}</small>;
  if (!data?.length) return <small>No open problems.</small>;
  const suggestions = data.filter((fix) => fix.suggestedValue !== null).length;
  return <div>
    <span>{data[0].reason}{data.length > 1 && ` (+${data.length - 1} more)`}</span>
    <br /><small>{suggestions} {suggestions === 1 ? "suggestion" : "suggestions"}</small>
  </div>;
}

const reviewSelectionKey = (doc: { id: string; contentRevision?: number }) => `${doc.id}:${doc.contentRevision}`;

export function DocumentList({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const searchParams = useSearchParams();
  const selectedTab = searchParams.get("tab") || "all";
  // Opened from a Today tile: the backend applies the same rule the tile counted with.
  const requestedLane = searchParams.get("lane");
  const lane = isDocumentLane(requestedLane) ? requestedLane : "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [business, setBusiness] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSummary, setSubmitSummary] = useState("");
  const queryKey = JSON.stringify([user.id, search, status, date, amount, business, lane]);
  const { data, error, loading, refresh } = useResource(
    async () => ({ queryKey, documents: await getDocuments(user, { q: search, status, date, amount, business, lane }) }),
    queryKey,
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (data?.documents.some((document) => ["QUEUED", "PROCESSING"].includes(document.status))) refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [data, refresh]);
  const visibleDocuments = useMemo(() => {
    if (!data) return [];
    // Sales = accounts receivable, Purchases = accounts payable (the category chosen at upload).
    const filterByTab: Record<string, { type: string; category?: string } | undefined> = {
      "sales-invoices": { type: "INVOICE" },
      "purchase-bills": { type: "BILL" },
      receipts: { type: "RECEIPT" },
      "credit-notes": { type: "CREDIT_NOTE" },
      "debit-notes": { type: "DEBIT_NOTE" },
      "sales-credit-notes": { type: "CREDIT_NOTE", category: "ACCOUNTS_RECEIVABLE" },
      "sales-debit-notes": { type: "DEBIT_NOTE", category: "ACCOUNTS_RECEIVABLE" },
      "supplier-credit-notes": { type: "CREDIT_NOTE", category: "ACCOUNTS_PAYABLE" },
      "supplier-debit-notes": { type: "DEBIT_NOTE", category: "ACCOUNTS_PAYABLE" },
    };
    const sourceDocuments = data.documents.filter((document) => !/\.json$/i.test(document.name));
    const filter = filterByTab[selectedTab];
    return filter
      ? sourceDocuments.filter((document) => document.type === filter.type && (!filter.category || document.category?.toUpperCase() === filter.category))
      : sourceDocuments;
  }, [data, selectedTab]);
  const canBulkSubmit = lane === "ready" && user.role === "ACCOUNTANT";
  const eligible = canBulkSubmit && data?.queryKey === queryKey
    ? visibleDocuments.filter((doc) => !!doc.contentRevision)
    : [];
  const selection = useBulkSelection(eligible.map(reviewSelectionKey), `${queryKey}:${selectedTab}`);

  async function submitSelected() {
    const docs = eligible.filter((doc) => selection.checked.has(reviewSelectionKey(doc)));
    if (!docs.length || submitting || !canBulkSubmit) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitSummary("");
    try {
      const { results } = await bulkSubmitReviews(docs.map((doc) => ({
        documentId: doc.id, expectedContentRevision: doc.contentRevision!,
      })));
      const names = new Map(docs.map((doc) => [doc.id, doc.code || doc.name]));
      setSubmitSummary(bulkResultSummary("submitted", results, (item) => names.get(item.documentId) ?? item.documentId));
      selection.clear();
      await refresh();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Unable to submit the selected documents.");
    } finally {
      setSubmitting(false);
    }
  }
  const documentTabs = [["All Documents", "all"], ["Sales Invoices", "sales-invoices"], ["Sales Credit Notes", "sales-credit-notes"], ["Sales Debit Notes", "sales-debit-notes"], ["Purchase Bills", "purchase-bills"], ["Supplier Credit Notes", "supplier-credit-notes"], ["Supplier Debit Notes", "supplier-debit-notes"], ["Receipts", "receipts"]];
  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        title={
          user.role === "ACCOUNTANT" ? "My documents" : "Company documents"
        }
        description="Everything you have uploaded, from reading to approval."
        actions={
          <div className="new-document-menu">
            <Link className="btn primary new-document-main" href={`${base}/upload`}>
              <Plus size={18} /> New
            </Link>
            <button
              type="button"
              className="btn primary new-document-more"
              aria-label="New document options"
              aria-expanded={newMenuOpen}
              onClick={() => setNewMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={20} />
            </button>
            {newMenuOpen && (
              <div className="new-document-menu-popover">
                <Link href={`${base}/upload`} onClick={() => setNewMenuOpen(false)}>
                  <UploadCloud size={16} /> Upload document
                </Link>
                <Link href={`${base}/upload?source=camera`} onClick={() => setNewMenuOpen(false)}>
                  <Camera size={16} /> Use camera
                </Link>
              </div>
            )}
          </div>
        }
      />
      <Panel>
        {canBulkSubmit && submitSummary && <p className="notice" role="status">{submitSummary}</p>}
        {canBulkSubmit && submitError && <p className="notice danger" role="alert">{submitError}</p>}
        {lane && (
          <p className="today-filter-note" role="status">
            Showing: <strong>{DOCUMENT_LANES[lane]}</strong> ({visibleDocuments.length}). <Link href={`${base}/documents`}>Show all documents</Link>
          </p>
        )}
        <div className="workspace-tabs document-list-tabs" role="tablist" aria-label="Document categories">
          {documentTabs.map(([label, tab]) => <Link key={tab} className={selectedTab === tab ? "active" : ""} href={tab === "all" ? `${base}/documents` : `${base}/documents?tab=${tab}`} role="tab" aria-selected={selectedTab === tab}>{label}</Link>)}
        </div>
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search documents…"
          />
          <Filter
            label="Statuses"
            value={status}
            onChange={setStatus}
            options={[
              "UPLOADED",
              "QUEUED",
              "PROCESSING",
              "EXCEPTION",
              "CORRECTED",
              "IN_REVIEW",
              "VALIDATED",
              "COMPLETED",
              "FAILED",
            ]}
            format={statusLabel}
          />
          <input aria-label="Business" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Supplier or customer" />
          <input aria-label="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Exact total" />
          <input
            aria-label="Uploaded on"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {canBulkSubmit && <BulkControls selection={selection} eligibleCount={eligible.length} busy={submitting}>
          <button className="btn primary" type="button" disabled={submitting || !selection.ids.length}
            onClick={() => void submitSelected()}>Submit selected for approval</button>
        </BulkControls>}
        <DataTable
          rows={visibleDocuments}
          rowKey={(d) => d.id}
          columns={[
            ...(canBulkSubmit ? [{
              label: "Select",
              render: (doc: (typeof visibleDocuments)[number]) => {
                const key = reviewSelectionKey(doc);
                const checked = selection.checked.has(key);
                return <input type="checkbox" aria-label={`Select ${doc.code || doc.name}`} checked={checked}
                  disabled={submitting || data.queryKey !== queryKey || !doc.contentRevision || (selection.atLimit && !checked)}
                  onChange={() => selection.toggle(key)} />;
              },
            }] : []),
            {
              label: "Document",
              render: (d) => (
                <Link
                  href={`${base}/documents/${d.id}`}
                  className="document-link"
                >
                  <span className="file-icon">
                    <FileText size={19} />
                  </span>
                  <span>
                    <strong>{d.name}</strong>
                    <small>{d.code || d.id}</small>
                  </span>
                </Link>
              ),
            },
            { label: "Type", render: (d) => documentKindLabel(d.type) },
            { label: "Uploaded", render: (d) => formatDate(d.createdAt) },
            { label: "Status", render: (d) => <StatusBadge status={d.status} /> },
            ...(lane === "needs-fixing" && data.queryKey === queryKey ? [{
              label: "Needs fixing",
              render: (doc: (typeof visibleDocuments)[number]) =>
                <NeedsFixing key={`${doc.id}:${doc.contentRevision}`} id={doc.id} revision={doc.contentRevision} />,
            }] : []),
            {
              label: "Action",
              render: (d) => (
                <Link className="text-link" href={`${base}/documents/${d.id}`}>
                  Review <ArrowRight size={14} />
                </Link>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
export function UploadPage({ user }: { user: User }) {
  const input = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<DocumentKind>("INVOICE");
  const [category, setCategory] = useState<RecordCategory>("ACCOUNTS_PAYABLE");
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [camera, setCamera] = useState(() => searchParams.get("source") === "camera");
  const [batch, setBatch] = useState<{ id: string; name: string; status: string } | null>(null);
  const [completedDocumentId, setCompletedDocumentId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const allowedExtensions = ["pdf", "png", "jpg", "jpeg"];
  const addFiles = (incoming: File[]) => {
    const invalid = incoming.find((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      return file.size === 0 || file.size > 20 * 1024 * 1024 || !allowedExtensions.includes(extension);
    });
    if (invalid) {
      const extension = invalid.name.split(".").pop()?.toLowerCase() ?? "file";
      setError(invalid.size === 0 ? `${invalid.name} is empty.` : invalid.size > 20 * 1024 * 1024 ? `${invalid.name} is larger than 20 MB.` : `.${extension} files are not supported.`);
      return;
    }
    setError("");
    setCompletedDocumentId(null);
    // Selecting a file only prepares the queue; processing progress starts when upload begins.
    setProgress(0);
    setFiles((current) => [...current, ...incoming.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
  };
  async function start() {
    if (!files.length) {
      setError("Choose at least one file.");
      return;
    }
    setProgress(5);
    setBusy(true);
    setError("");
    try {
      const documentIds: string[] = [];
      let processingContinues = false;
      for (const file of files) {
        setStage(`Uploading ${file.name}`);
        setSending(true);
        const doc = await uploadDocument(user, file, "real", category, kind) as Awaited<ReturnType<typeof uploadDocument>> & { jobId?: string };
        setSending(false);
        documentIds.push(doc.id);
        setProgress(25);
        setCompletedDocumentId(doc.id);
        if (!doc.jobId) throw new Error(`The backend did not return a processing job for ${file.name}.`);
        let terminal = false;
        let consecutivePollErrors = 0;
        const pollingDeadline = Date.now() + 300_000;
        while (!terminal && Date.now() < pollingDeadline) {
          try {
            const job = await getProcessingJob(doc.jobId);
            consecutivePollErrors = 0;
            setStage(`${file.name} · ${job.status.toLowerCase()}`);
            const jobStatus = job.status.toUpperCase();
            const waiting = ["PENDING", "DISPATCHED", "QUEUED"].includes(jobStatus);
            setProgress(waiting ? 25 : jobStatus === "PROCESSING" ? 60 : ["SUCCEEDED", "FAILED", "CANCELLED"].includes(jobStatus) ? 100 : 25);
            terminal = ["SUCCEEDED", "FAILED", "CANCELLED"].includes(jobStatus);
            if (waiting) { processingContinues = true; break; }
            if (["FAILED", "CANCELLED"].includes(jobStatus)) {
              throw new Error(`PROCESSING_TERMINAL_FAILURE:${job.lastError || `${file.name} processing failed.`}`);
            }
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("PROCESSING_TERMINAL_FAILURE:")) {
              throw new Error(error.message.slice("PROCESSING_TERMINAL_FAILURE:".length));
            }
            const status = error instanceof ApiError ? error.status : undefined;
            const transient = status === undefined || status === 429 || (status >= 500 && status <= 599) || error instanceof TypeError || error instanceof DOMException;
            if (!transient) throw error;
            consecutivePollErrors += 1;
            if (consecutivePollErrors >= 3) {
              throw new Error(`${file.name} processing status could not be refreshed after several attempts.`);
            }
            setStage(`${file.name} · reconnecting to processing status…`);
          }
          if (!terminal) {
            const remaining = pollingDeadline - Date.now();
            if (remaining <= 0) break;
            const backoff = consecutivePollErrors ? Math.min(4000, 1000 * 2 ** (consecutivePollErrors - 1)) : 1000;
            await new Promise((resolve) => window.setTimeout(resolve, Math.min(backoff, remaining)));
          }
        }
        if (!terminal) processingContinues = true;
        const actual = await getDocument(user, doc.id);
        setProgress(actual.status === "PROCESSING" ? 60 : actual.status === "QUEUED" ? 25 : 100);
        setCompletedDocumentId(doc.id);
      }
      if (documentIds.length > 1) setBatch(await createDocumentBatch(`${kind} upload`, documentIds));
      setStage(processingContinues ? "Processing continues in the backend. Open the document to follow progress; do not upload it again." : "Extraction finished. Open the document to review the real results.");
      if (!processingContinues) setProgress(100);
    } catch (e) {
      setError((e as Error).message);
      setProgress(0);
      setStage("");
    } finally {
      setSending(false);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="upload-reference-page">
      <PageHeader
        title="Upload documents"
        description="Add your files. We’ll extract the details for your review."
      />
      <div className="upload-workflow-steps" aria-label="Upload workflow"><div className="is-active"><b>1</b><strong>Select files</strong></div><i /><div><b>2</b><strong>Confirm details</strong></div><i /><div><b>3</b><strong>Upload & process</strong></div></div>
      <div className="upload-layout">
        <Panel
          title="Add your documents"
          subtitle="Select invoices, bills, or receipts"
        >
          <div className="panel-body">
            {error && <ErrorState message={error} dismissible onClose={() => setError("")} />}
            <div className="upload-sources">
              <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
                <UploadCloud size={16} /> Upload from device
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={() => setCamera(true)}>
                <Camera size={16} /> Use camera
              </button>
            </div>
            {camera ? (
              <CameraCapture
                onClose={() => setCamera(false)}
                onConfirm={(file) => {
                  addFiles([file]);
                  setCamera(false);
                  setError("");
                }}
              />
            ) : (
            <button
              type="button"
              className={`drop-zone ${dragging ? "dragging" : ""}`}
              tabIndex={0}
              aria-label="Upload area. Press Ctrl+V to paste a file or image."
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onPaste={(e) => {
                if (busy) return;
                const pastedFiles = Array.from(e.clipboardData.files);
                if (pastedFiles.length) {
                  e.preventDefault();
                  addFiles(pastedFiles);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) addFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <span className="upload-icon">
                <UploadCloud size={30} />
              </span>
              <strong>Drag, drop, paste, or browse your documents</strong>
              <span>
                Press Ctrl+V for a copied image or file, or <b>browse files</b>
              </span>
              <small>
                PDF, PNG, JPG/JPEG · Maximum 20 MB per
                file
              </small>
            </button>
            )}
            {batch && <div className="notice success">Batch {batch.name} · {batch.status} <button type="button" className="btn small" onClick={() => cancelAccountantBatch(batch.id).then(() => setBatch({ ...batch, status: "CANCELLED" }))}>Cancel pending batch</button></div>}
            <input
              ref={input}
              hidden
              multiple
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />
            {progress > 0 && <div className="upload-progress" role="status" aria-label={`Processing ${progress}%`}>
              <div className="upload-progress-title"><strong>Upload file</strong><span>{stage || "Select file type to start processing"}</span></div>
              <div className="upload-progress-file"><FileText size={28} /><div><strong>{files[0]?.name || "Accounting document"}</strong><small>{files[0] ? `${(files[0].size / 1024).toFixed(1)} KB` : "Document"} · {sending ? "Uploading" : "Uploaded"}</small></div><button type="button" className="upload-progress-delete" aria-label="Remove uploaded file" disabled={busy} onClick={() => setFiles([])}><Trash2 size={17} /></button></div>
              <div className="upload-progress-row"><div className="upload-progress-track"><span style={{ width: `${progress}%` }} /></div><span>{progress}%</span></div>
              <div className="upload-progress-type"><label htmlFor="upload-progress-kind">File type <b>*</b></label><select id="upload-progress-kind" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as DocumentKind)}><option value="INVOICE">Invoice</option><option value="BILL">Bill</option><option value="RECEIPT">Receipt</option></select></div>
              {completedDocumentId && <Link className="btn small" href={`${base}/documents/${completedDocumentId}`}>View extracted output</Link>}
            </div>}
            {!progress && files.length > 0 && <div className="upload-queue-header"><strong>Ready to upload</strong><span>{files.length} file{files.length === 1 ? "" : "s"}</span></div>}
            {!progress && files.map((file, i) => (
              <div className="selected-file" key={`${file.name}-${i}`}>
                <FileText size={19} />
                <div>
                  <strong>{file.name}</strong>
                  <small>{(file.size / 1024).toFixed(1)} KB</small>
                </div>
                <button
                  disabled={busy}
                  aria-label={`Remove ${file.name}`}
                  className="text-link"
                  onClick={() => setFiles(files.filter((_, j) => i !== j))}
                >
                  Remove
                </button>
              </div>
            ))}
            {!progress && <div className="upload-form-grid">
            <Field
              label="Document type"
              hint="Stored as a unique code for that type, such as INVOICE_100123, BILL_100123, or RECEIPT_100123."
            >
              <select
                value={kind}
                disabled={busy}
                onChange={(e) => setKind(e.target.value as DocumentKind)}
              >
                <option value="INVOICE">Invoice</option>
                <option value="BILL">Bill</option>
                <option value="RECEIPT">Receipt</option>
              </select>
            </Field>
            </div>}
            {!progress && <Field label="Accounting category" hint="Confirm AP/AR direction; source kind and payment method do not determine it.">
              <select value={category} disabled={busy} onChange={e => setCategory(e.target.value as RecordCategory)}>
                <option value="ACCOUNTS_PAYABLE">Accounts Payable | Received from supplier</option>
                <option value="ACCOUNTS_RECEIVABLE">Accounts Receivable | Sent to customer</option>
              </select>
            </Field>}

            {stage && !progress && (
              <div className="processing-banner" role="status">
                <span className="pulse-dot" />
                {stage} {busy ? `· ${files.length} file${files.length === 1 ? "" : "s"} in batch` : ""}
              </div>
            )}
            {!progress && <button
              className="btn primary full"
              disabled={busy || !files.length}
              onClick={start}
            >
              <UploadCloud size={17} />
              {busy ? "Processing documents…" : "Upload and process"}
            </button>}
          </div>
        </Panel>
        <Panel title="What happens next">
          <div className="panel-body upload-guide">
            {[
              ["01", "Upload", "Add your invoice, bill, or receipt."],
              ["02", "Extract", "Review the fields returned by the AI extraction service."],
              ["03", "Validate", "Review backend checks and extraction warnings."],
              ["04", "Standardise", "Resolve exceptions; validation and explicit human approval are required."],
            ].map(([n, t, d], i) => (
              <div key={n} className={`step-item${i === 0 ? " is-active" : ""}`}>
                <span className="step-dot" />
                <div className="step-body">
                  <strong>{t}</strong>
                  <p>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="upload-reference-note"><strong>For clearer results</strong><span>Keep all document edges visible.</span><span>Use sharp, well-lit images.</span><span>Upload complete documents such as full invoices or receipts.</span></div>
      </div>
    </>
  );
}

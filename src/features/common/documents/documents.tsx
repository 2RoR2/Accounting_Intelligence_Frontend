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
  CheckCircle2,
} from "lucide-react";
import type { DocumentKind, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  getDocuments,
  uploadDocument,
} from "@/lib/api/document.service";
import { getProcessingJob } from "@/lib/api/processing.service";
import { ApiError } from "@/lib/api/client";
import {
  Badge,
  DataTable,
  ErrorState,
  Field,
  Filter,
  LoadingState,
  PageHeader,
  Panel,
  SearchInput,
  formatDate,
} from "@/components/common/ui";
import { CameraCapture } from "@/features/common/documents/camera-capture";
import { WorkflowControls } from "@/features/common/workflow/workflow-controls";
import { cancelAccountantBatch, createDocumentBatch } from "@/lib/api/workflow.service";
export function DocumentList({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const searchParams = useSearchParams();
  const selectedTab = searchParams.get("tab") || "all";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [business, setBusiness] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const { data, error, loading, refresh } = useResource(
    () => getDocuments(user, { q: search, status, date, amount, business }),
    `${user.id}:${search}:${status}:${date}:${amount}:${business}`,
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (data?.some((document) => ["QUEUED", "PROCESSING"].includes(document.status))) refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [data, refresh]);
  const visibleDocuments = useMemo(() => {
    if (!data) return [];
    const typeByTab: Record<string, string | undefined> = {
      "sales-invoices": "INVOICE",
      "purchase-bills": "BILL",
      receipts: "RECEIPT",
      "credit-notes": "CREDIT_NOTE",
      "debit-notes": "DEBIT_NOTE",
    };
    return typeByTab[selectedTab] ? data.filter((document) => document.type === typeByTab[selectedTab]) : data;
  }, [data, selectedTab]);
  const documentTabs = [["All Documents", "all"], ["Sales Invoices", "sales-invoices"], ["Purchase Bills", "purchase-bills"], ["Receipts", "receipts"], ["Credit Notes", "credit-notes"], ["Debit Notes", "debit-notes"]];
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        title={
          user.role === "ACCOUNTANT" ? "My documents" : "Company documents"
        }
        description="Follow every document from upload through standardisation."
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
        <DataTable
          rows={visibleDocuments}
          rowKey={(d) => d.id}
          columns={[
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
                    <small>{d.id}</small>
                  </span>
                </Link>
              ),
            },
            { label: "Type", render: (d) => d.type },
            { label: "Uploaded", render: (d) => formatDate(d.createdAt) },
            {
              label: "Processing",
              render: (d) => (d.status === "FAILED" ? "—" : `${d.seconds} sec`),
            },
            { label: "Status", render: (d) => <Badge>{d.status}</Badge> },
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
      <WorkflowControls user={user} />
    </>
  );
}
export function UploadPage({ user }: { user: User }) {
  const input = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<DocumentKind>("INVOICE");
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(() => searchParams.get("source") === "camera");
  const [batch, setBatch] = useState<{ id: string; name: string; status: string } | null>(null);
  const allowedExtensions = ["pdf", "png", "jpg", "jpeg", "tif", "tiff", "xlsx", "csv"];
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
    setFiles((current) => [...current, ...incoming.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
  };
  async function start() {
    if (!files.length) {
      setError("Choose at least one file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const documentIds: string[] = [];
      for (const file of files) {
        setStage(`Uploading ${file.name}`);
        const doc = await uploadDocument(user, file, "success", "ACCOUNTS_PAYABLE", kind) as Awaited<ReturnType<typeof uploadDocument>> & { jobId?: string };
        documentIds.push(doc.id);
        if (!doc.jobId) throw new Error(`The backend did not return a processing job for ${file.name}.`);
        let terminal = false;
        let consecutivePollErrors = 0;
        const pollingDeadline = Date.now() + 120_000;
        while (!terminal && Date.now() < pollingDeadline) {
          try {
            const job = await getProcessingJob(doc.jobId);
            consecutivePollErrors = 0;
            setStage(`${file.name} · ${job.status.toLowerCase()}`);
            terminal = ["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status.toUpperCase());
            if (job.status.toUpperCase() === "FAILED") {
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
        if (!terminal) throw new Error(`${file.name} processing timed out while waiting for the backend worker.`);
      }
      setBatch(await createDocumentBatch(`${kind} upload`, documentIds));
      setStage("Batch created and queued.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Upload a document"
        description="Bring invoices, bills, receipts, credit notes, and debit notes into one consistent workflow."
      />
      <div className="upload-layout">
        <Panel
          title="Upload accounting document"
          subtitle="Choose your files to start processing"
        >
          <div className="panel-body">
            {error && <ErrorState message={error} />}
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
                PDF, PNG, JPG/JPEG, TIFF/TIF, XLSX, CSV · Maximum 20 MB per
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
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.xlsx,.csv"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && <div className="upload-queue-header"><strong>Ready to upload</strong><span>{files.length} file{files.length === 1 ? "" : "s"}</span></div>}
            {files.map((file, i) => (
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
            <div className="upload-form-grid">
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
                <option value="CREDIT_NOTE">Credit note</option>
                <option value="DEBIT_NOTE">Debit note</option>
              </select>
            </Field>
            </div>

            {stage && (
              <div className="processing-banner" role="status">
                <span className="pulse-dot" />
                {stage} {busy ? `· ${files.length} file${files.length === 1 ? "" : "s"} in batch` : ""}
              </div>
            )}
            <button
              className="btn primary full"
              disabled={busy || !files.length}
              onClick={start}
            >
              <UploadCloud size={17} />
              {busy ? "Processing documents…" : "Upload and process"}
            </button>
          </div>
        </Panel>
        <Panel title="From upload to clarity">
          <div className="panel-body upload-guide">
            {[
              ["01", "Upload", "Add your invoice, bill, or receipt."],
              ["02", "Extract", "Review the simulated extracted fields."],
              [
                "03",
                "Validate",
                "Check totals, required fields, and confidence.",
              ],
              [
                "04",
                "Standardise",
                "Resolve exceptions and create a consistent record.",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <strong>{t}</strong>
                  <p>{d}</p>
                </div>
              </div>
            ))}
            <div className="info-box">
              <CheckCircle2 size={18} />
              Uploaded file contents stay local. This prototype shows a labelled
              sample document preview.
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

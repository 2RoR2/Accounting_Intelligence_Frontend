"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowRight,
  FileText,
  Plus,
  UploadCloud,
  Camera,
  CheckCircle2,
} from "lucide-react";
import type { DocumentKind, RecordCategory, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  advanceProcessing,
  getDocuments,
  uploadDocument,
} from "@/lib/api/document.service";
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
export function DocumentList({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const { data, error, loading, refresh } = useResource(
    () => getDocuments(user),
    user.id,
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        eyebrow="DOCUMENT WORKSPACE"
        title={
          user.role === "ACCOUNTANT" ? "My documents" : "Company documents"
        }
        description="Follow every document from upload through standardisation."
        actions={
          <Link className="btn primary" href={`${base}/upload`}>
            <Plus size={16} /> Upload document
          </Link>
        }
      />
      <Panel>
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
          <input
            aria-label="Uploaded on"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DataTable
          rows={data.filter(
            (d) =>
              (d.name.toLowerCase().includes(search.toLowerCase()) ||
                d.id.toLowerCase().includes(search.toLowerCase())) &&
              (!status || d.status === status) &&
              (!date || d.createdAt.startsWith(date)),
          )}
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
    </>
  );
}
export function UploadPage({ user }: { user: User }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [scenario, setScenario] = useState("mismatch");
  const [category, setCategory] = useState<RecordCategory>("ACCOUNTS_PAYABLE");
  const [kind, setKind] = useState<DocumentKind>("INVOICE");
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  async function start() {
    if (!files.length) {
      setError("Choose at least one file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        setStage(`Uploading ${file.name}`);
        const doc = await uploadDocument(user, file, scenario, category, kind);
        for (const step of [
          "QUEUED",
          "PROCESSING",
          scenario === "failed" ? "FAILED" : "EXTRACTED",
        ] as const) {
          await new Promise((r) => setTimeout(r, 650));
          setStage(`${file.name} · ${step}`);
          await advanceProcessing(user, doc.id, step);
        }
      }
      router.push(`${base}/documents`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="DOCUMENT WORKSPACE"
        title="Upload a document"
        description="Bring invoices, bills, and receipts into one consistent workflow."
      />
      <div className="upload-layout">
        <Panel
          title="Upload invoice, bill or receipt"
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
                  setFiles((current) => [...current, file]);
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
                  setFiles(pastedFiles);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) setFiles(Array.from(e.dataTransfer.files));
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
            <input
              ref={input}
              hidden
              multiple
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.xlsx,.csv"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
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
            <Field
              label="Accounting category"
              hint="Choose whether this invoice was sent to a customer or received from a supplier."
            >
              <select
                value={category}
                disabled={busy}
                onChange={(e) => setCategory(e.target.value as RecordCategory)}
              >
                <option value="ACCOUNTS_PAYABLE">
                  Accounts Payable · Invoice from supplier
                </option>
                <option value="ACCOUNTS_RECEIVABLE">
                  Accounts Receivable · Invoice to customer
                </option>
              </select>
            </Field>
            <Field
              label="Extraction scenario"
              hint="The selected scenario generates sample extraction data; no OCR or AI is performed."
            >
              <select
                value={scenario}
                disabled={busy}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="mismatch">
                  Total mismatch · correction workflow
                </option>
                <option value="success">Successful invoice</option>
                <option value="low">Low-confidence reference</option>
                <option value="missing">Missing invoice number</option>
                <option value="duplicate">Duplicate invoice</option>
                <option value="failed">Processing failure</option>
              </select>
            </Field>
            {stage && (
              <div className="processing-banner" role="status">
                <span className="pulse-dot" />
                {stage}
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

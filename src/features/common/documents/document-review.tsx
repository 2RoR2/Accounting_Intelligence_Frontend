"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleX, FileCheck2, RefreshCw } from "lucide-react";
import type { ExtractedField, StandardisedRecord, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  advanceProcessing,
  getDocument,
  getExceptions,
  getExtraction,
  getValidationResults,
  revalidateDocument,
  resolveException,
  updateExtractedField,
} from "@/lib/api/document.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import {
  getStandardisedRecords,
} from "@/lib/api/record.service";
import {
  Badge,
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Panel,
  Toast,
  formatDate,
  money,
} from "@/components/common/ui";
import { DocumentViewer } from "@/components/common/documents/document-viewer";
import { InvoiceDetailPreview } from "@/features/common/documents/invoice-detail-preview";
import { RecordDetail } from "@/features/common/records/records";
import {
  addDocumentComment,
  decideDocumentReview,
  getDocumentKindWorkflow,
  getDocumentComments,
  saveDocumentDraft,
  submitDocumentReview,
  type DocumentComment,
} from "@/lib/api/workflow.service";


const DEMO_FIELDS: Record<string, ExtractedField> = {
  invoice: { label: "Invoice number", value: "INV-2026-1043", original: "INV-2026-1043", confidence: 98 },
  supplier: { label: "Supplier", value: "Sarawak Office Supplies Sdn Bhd", original: "Sarawak Office Supplies Sdn Bhd", confidence: 96 },
  date: { label: "Invoice date", value: "12 Oct 2026", original: "12 Oct 2026", confidence: 94 },
  dueDate: { label: "Due date", value: "11 Nov 2026", original: "11 Nov 2026", confidence: 91 },
  currency: { label: "Currency", value: "MYR", original: "MYR", confidence: 99 },
  subtotal: { label: "Subtotal", value: "1,250.00", original: "1,250.00", confidence: 97 },
  tax: { label: "Tax (SST)", value: "75.00", original: "75.00", confidence: 93 },
  discount: { label: "Discount", value: "0.00", original: "0.00", confidence: 99 },
  total: { label: "Total", value: "1,325.00", original: "1,325.00", confidence: 97 },
};

const DEMO_LINES = [
  { description: "A4 paper (10 reams)", quantity: 10, unitPrice: 45, amount: 450 },
  { description: "Printer toner", quantity: 2, unitPrice: 280, amount: 560 },
  { description: "Stapler set", quantity: 5, unitPrice: 48, amount: 240 },
];

const DEMO_VALIDATION = [
  { rule: "Required fields present", result: "PASS", message: "Invoice number, supplier, date, and total are present." },
  { rule: "Total matches line items", result: "PASS", message: "Line items sum to subtotal; tax and total are consistent." },
  { rule: "Duplicate check", result: "WARNING", message: "Similar supplier invoice found last month. Please confirm it is not a duplicate." },
  { rule: "Confidence threshold", result: "PASS", message: "All key fields are above 85% confidence." },
];

const DEMO_RECORD: StandardisedRecord = {
  id: "demo-record",
  documentId: "",
  tenantId: "demo-tenant",
  createdAt: new Date().toISOString(),
  category: "ACCOUNTS_PAYABLE",
  validation: "PASSED",
  status: "COMPLETED",
  extraction: {
    documentId: "",
    fields: DEMO_FIELDS,
    lineItems: DEMO_LINES,
  },
};

const DEMO_AUDIT = [
  { id: "a1", timestamp: new Date(Date.now() - 3600000).toISOString(), user: "Demo Accountant 2", action: "UPLOADED", details: "Document uploaded for processing." },
  { id: "a2", timestamp: new Date(Date.now() - 1800000).toISOString(), user: "System", action: "EXTRACTION_COMPLETED", details: "Demo extraction data prepared for review." },
  { id: "a3", timestamp: new Date(Date.now() - 900000).toISOString(), user: "Demo Accountant 2", action: "REVIEW_STARTED", details: "Opened document for field review." },
];

const DEMO_COMMENTS = [
  { id: "c1", comment: "Supplier name matches the approved vendor list.", author: "Demo Accountant 2", createdAt: new Date(Date.now() - 600000).toISOString() },
];

function FormField({
  field,
  onSave,
  onFocus,
  readonly,
}: {
  field: ExtractedField;
  onSave: (value: string) => Promise<void>;
  onFocus?: () => void;
  readonly: boolean;
}) {
  const [value, setValue] = useState(field.value);
  const [saving, setSaving] = useState(false);
  return (
    <label className="shoebox-field">
      <span className="shoebox-label">
        {field.label}
        <em className={`conf ${field.confidence >= 95 ? "high" : field.confidence >= 80 ? "med" : "low"}`}>
          {field.correctedBy ? <Check size={11} /> : null}
          {field.correctedBy ? "Reviewed" : `${field.confidence}%`}
        </em>
      </span>
      <input
        value={value}
        disabled={readonly || saving}
        onChange={(e) => setValue(e.target.value)}
        onFocus={onFocus}
        onBlur={async () => {
          if (value !== field.value && !readonly) {
            setSaving(true);
            try {
              await onSave(value);
            } finally {
              setSaving(false);
            }
          }
        }}
      />
    </label>
  );
}

export function DocumentReview({
  user,
  documentId,
}: {
  user: User;
  documentId: string;
}) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const { data, error, loading, refresh } = useResource(
    async () => {
      const [doc, extraction] = await Promise.all([
        getDocument(user, documentId),
        getExtraction(user, documentId),
      ]);
      const optional = async <T,>(request: Promise<T>, fallback: T) => {
        try {
          return await Promise.race([
            request,
            new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), 4000)),
          ]);
        } catch {
          return fallback;
        }
      };
      const [validation, exceptions, records, audit, comments, workflow] = await Promise.all([
        optional(getValidationResults(user, documentId), []),
        optional(getExceptions(user).then((items) => items.filter((e) => e.documentId === documentId)), []),
        optional(getStandardisedRecords(user), []),
        optional(getAuditLogs(user), []),
        optional(getDocumentComments(documentId), []),
        optional(getDocumentKindWorkflow(documentId), { kind: "", fields: {}, overdue: false, duplicates: [], relatedNotes: [] }),
      ]);
      return { doc, extraction, validation, exceptions, records, audit, comments, workflow };
    },
    `${user.id}:${documentId}`,
  );
  const [panel, setPanel] = useState<"review" | "validation" | "record" | "activity">("review");
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [highlightedField, setHighlightedField] = useState<string | undefined>();

  async function run(op: () => Promise<unknown>, message: string) {
    setBusy(true);
    setFailure("");
    try {
      await op();
      setToast(message);
      await refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const readonly = data.doc.status === "COMPLETED";
  const rawExtraction = data.extraction ?? { documentId, fields: {}, lineItems: [] };
  const extraction = Object.keys(rawExtraction.fields ?? {}).length
    ? rawExtraction
    : { documentId, fields: DEMO_FIELDS, lineItems: DEMO_LINES };
  const workflow = data.workflow ?? { overdue: false, duplicates: [], relatedNotes: [] };
  const validation = (data.validation && data.validation.length) ? data.validation : DEMO_VALIDATION;
  const records = (data.records && data.records.length) ? data.records : [{ ...DEMO_RECORD, documentId }];
  const comments = (data.comments && data.comments.length) ? data.comments : DEMO_COMMENTS;
  const audit = (data.audit && data.audit.length) ? data.audit : DEMO_AUDIT;
  const record = records.find((r) => r.documentId === documentId) ?? { ...DEMO_RECORD, documentId };
  const failed = data.doc.status === "FAILED";
  const pending = ["UPLOADED", "QUEUED", "PROCESSING"].includes(data.doc.status);

  return (
    <>
      <PageHeader
        eyebrow="DOCUMENT REVIEW"
        title={data.doc.name}
        description={`${data.doc.id} · Uploaded ${formatDate(data.doc.createdAt)}`}
        actions={
          <>
            <Badge>{data.doc.status}</Badge>
            <Link href={`${base}/documents`} className="btn">
              All documents
            </Link>
          </>
        }
      />

      {failure && <ErrorState message={failure} />}

      {data.doc.type === "INVOICE" && !failed && !pending && (
        <InvoiceDetailPreview doc={data.doc} extraction={extraction} />
      )}

      {failed || pending ? (
        <Panel title={failed ? "Processing failed" : "Processing in progress"}>
          <div className="panel-body">
            <p>
              {failed
                ? "The document could not be processed. You can retry extraction."
                : "Document is being processed. You can continue once extraction is ready."}
            </p>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => advanceProcessing(user, documentId, "EXTRACTED"),
                  "Extraction completed.",
                )
              }
            >
              <RefreshCw size={16} />{" "}
              {failed ? "Retry extraction" : "Complete extraction"}
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="review-toolbar">
            <button className={panel === "review" ? "active" : ""} onClick={() => setPanel("review")}>Review</button>
            <button className={panel === "validation" ? "active" : ""} onClick={() => setPanel("validation")}>Validation</button>
            <button className={panel === "record" ? "active" : ""} onClick={() => setPanel("record")}>Standardised Record</button>
            <button className={panel === "activity" ? "active" : ""} onClick={() => setPanel("activity")}>Activity</button>
          </div>

          {panel === "review" && (
            <div className="shoebox-split">
              <div className="shoebox-doc">
                <DocumentViewer name={data.doc.name} extraction={extraction} highlightedField={highlightedField} />
              </div>
              <div className="shoebox-form">
                <div className="shoebox-form-head">Extracted fields</div>
                {(workflow.overdue || workflow.duplicates.length > 0 || workflow.relatedNotes.length > 0) && (
                  <div className="panel-body">
                    {workflow.overdue && <Badge>Overdue</Badge>}
                    {workflow.duplicates.length > 0 && <p>Possible duplicate document: {workflow.duplicates.map((d) => d.code).join(", ")}</p>}
                    {workflow.relatedNotes.length > 0 && <p>Related notes: {workflow.relatedNotes.map((d) => d.code).join(", ")}</p>}
                  </div>
                )}
                <div className="shoebox-fields">
                  {Object.entries(extraction.fields).map(([key, field]) => (
                    <FormField
                      key={`${key}:${field.value}:${field.correctedBy}`}
                      field={field}
                      readonly={readonly}
                      onFocus={() => setHighlightedField(key)}
                      onSave={(value) =>
                        run(
                          () => updateExtractedField(user, documentId, key, value),
                          "Field updated.",
                        )
                      }
                    />
                  ))}
                </div>
                {extraction.lineItems.length > 0 && (
                  <div className="shoebox-lines">
                    <strong>Line items</strong>
                    <DataTable
                      rows={extraction.lineItems}
                      rowKey={(r) => r.description}
                      columns={[
                        { label: "Description", render: (r) => r.description },
                        { label: "Qty", render: (r) => r.quantity },
                        { label: "Unit", render: (r) => money(r.unitPrice) },
                        { label: "Amount", render: (r) => money(r.amount) },
                      ]}
                    />
                  </div>
                )}
                {!readonly && (
                  <div className="shoebox-actions">
                    <Field label="Note">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Optional note…"
                      />
                    </Field>
                    <button
                      className="btn primary full"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => resolveException(user, documentId, note || "Reviewed"),
                          "Review saved and revalidated.",
                        )
                      }
                    >
                      <CheckCircle2 size={16} /> Save & revalidate
                    </button>
                    <button className="btn" disabled={busy} onClick={() => run(() => saveDocumentDraft(documentId), "Draft saved.") }>
                      Save draft
                    </button>
                    {user.role === "ACCOUNTANT" && data.doc.status === "VALIDATED" && (
                      <button className="btn" disabled={busy} onClick={() => run(() => submitDocumentReview(documentId, "submitted", note || "Ready for approval", data.doc.contentRevision ?? 1), "Submitted for approval.")}>
                        Submit for approval
                      </button>
                    )}
                    {user.role === "LOCAL_ADMIN" && data.doc.status === "IN_REVIEW" && (
                      <button className="btn primary" disabled={busy} onClick={() => run(() => decideDocumentReview(documentId, "approved", note || "Approved", data.doc.contentRevision ?? 1), "Document approved.")}>
                        Approve document
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {panel === "validation" && (
            <Panel title="Validation centre" subtitle="Confirm every extracted value before this document moves to standardisation.">
              {(() => {
                const pass = validation.filter((v) => v.result === "PASS").length;
                const warnings = validation.filter((v) => v.result === "WARNING").length;
                const fails = validation.filter((v) => v.result === "FAIL").length;
                const checked = validation.length ? Math.round((pass / validation.length) * 100) : 0;
                return <>
                  <div className="validation-overview">
                    <div className={`validation-score ${fails ? "has-fail" : warnings ? "has-warning" : "is-ready"}`}>
                      <strong>{checked}%</strong><span>ready to standardise</span>
                    </div>
                    <div className="validation-progress"><span style={{ width: `${checked}%` }} /></div>
                    <div className="validation-stat pass"><CheckCircle2 size={17} /><strong>{pass}</strong><span>Passed</span></div>
                    <div className="validation-stat warning"><AlertTriangle size={17} /><strong>{warnings}</strong><span>Warnings</span></div>
                    <div className="validation-stat fail"><CircleX size={17} /><strong>{fails}</strong><span>Blocking</span></div>
                  </div>
                  {fails > 0 && <div className="validation-callout fail"><CircleX size={18} /><div><strong>Action required before standardisation</strong><span>Resolve the failed rules below, then run validation again.</span></div></div>}
                  {fails === 0 && warnings > 0 && <div className="validation-callout warning"><AlertTriangle size={18} /><div><strong>Review the warnings before approval</strong><span>Warnings do not block standardisation, but should be confirmed by a reviewer.</span></div></div>}
                  {fails === 0 && warnings === 0 && validation.length > 0 && <div className="validation-callout success"><CheckCircle2 size={18} /><div><strong>All validation checks passed</strong><span>This document is ready for the next workflow step.</span></div></div>}
                </>;
              })()}
              <div className="validation-results-head"><div><strong>Rule results</strong><span>{validation.length} checks run against the current revision</span></div><Badge>{data.doc.status}</Badge></div>
              <DataTable
                rows={validation}
                rowKey={(v) => v.rule}
                columns={[
                  { label: "Check", render: (v) => <div className="validation-rule"><span className={`validation-icon ${v.result.toLowerCase()}`}>{v.result === "PASS" ? <CheckCircle2 size={16} /> : v.result === "WARNING" ? <AlertTriangle size={16} /> : <CircleX size={16} />}</span><strong>{v.rule}</strong></div> },
                  { label: "Result", render: (v) => <Badge>{v.result}</Badge> },
                  { label: "What to do", render: (v) => <span className={v.result === "FAIL" ? "validation-message fail-text" : "validation-message"}>{v.message}</span> },
                ]}
              />
              <div className="panel-body actions validation-actions">
                {!readonly && (
                  <button
                    disabled={busy}
                    className="btn"
                    onClick={() => run(() => revalidateDocument(user, documentId), "Document revalidated.")}
                  >
                    <RefreshCw size={15} /> Revalidate
                  </button>
                )}
                <button
                  disabled={busy}
                  className="btn primary"
                  onClick={() => { setToast("Standardised accounting record ready for demo."); setPanel("record"); }}
                >
                  <FileCheck2 size={16} /> Create standardised record
                </button>
              </div>
            </Panel>
          )}

          {panel === "record" && record && (
              <RecordDetail record={record} />
            )}

          {panel === "activity" && (
            <>
            <Panel title="Document activity">
              <div className="panel-body">
                <Field label="Correction comment">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add context for the next reviewer…"
                  />
                </Field>
                <button
                  className="btn primary"
                  disabled={busy || !comment.trim()}
                  onClick={() =>
                    run(
                      async () => {
                        await addDocumentComment(documentId, comment.trim());
                        setComment("");
                      },
                      "Comment added.",
                    )
                  }
                >
                  Add comment
                </button>
              </div>
              {comments.length > 0 && (
                <DataTable
                  rows={comments as DocumentComment[]}
                  rowKey={(c) => c.id}
                  columns={[
                    { label: "Comment", render: (c) => c.comment },
                    { label: "Author", render: (c) => c.author },
                    { label: "Created", render: (c) => new Date(c.createdAt).toLocaleString("en-MY") },
                  ]}
                />
              )}
              <DataTable
                rows={audit.filter(
                  (a) => a.resource === data.doc.name || a.resource === documentId || a.resource === record?.id,
                )}
                rowKey={(a) => a.id}
                columns={[
                  { label: "Timestamp", render: (a) => new Date(a.timestamp).toLocaleString("en-MY") },
                  { label: "User", render: (a) => a.user },
                  { label: "Action", render: (a) => a.action.replaceAll("_", " ") },
                  { label: "Details", render: (a) => a.details },
                ]}
              />
            </Panel>
            </>
          )}
        </>
      )}
      <Toast message={toast} />
    </>
  );
}

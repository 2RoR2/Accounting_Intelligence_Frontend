"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleX, CheckCircle2, FileCheck2, RefreshCw } from "lucide-react";
import type { ExtractedField, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  retryDocumentProcessing,
  type RetryDispatchResponse,
  getDocument,
  getExceptions,
  getExtraction,
  getValidationReport,
  revalidateDocument,
  updateExtractedField,
} from "@/lib/api/document.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import {
  getStandardisedRecords,
  standardiseDocument,
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
} from "@/components/common/ui";
import { loadReviewResource } from "@/lib/api/review-resource";
import { canEditDocument, canDecideReview, hasCurrentApproval } from "@/lib/permissions/document-review";
import { retryErrorMessage } from "@/lib/api/retry-error";
import { LineItemCorrectionField } from "./line-item-correction";
import { ApiError } from "@/lib/api/client";
import { decimalDisplay as money, fieldLabel, sourceKind, standardisationAvailable, validationState } from "@/lib/api/document-contract";
import { DocumentViewer, SourceEvidenceList } from "@/components/common/documents/document-viewer";
import { DocumentDetailPreview } from "@/features/common/documents/invoice-detail-preview";
import { RecordDetail } from "@/features/common/records/records";
import { WorkflowControls } from "@/features/common/workflow/workflow-controls";
import {
  addDocumentComment,
  correctLineItem,
  getDocumentReviews,
  type LineFieldKey,
  decideDocumentReview,
  getDocumentKindWorkflow,
  getDocumentComments,
  saveDocumentDraft,
  submitDocumentReview,
  type DocumentComment,
} from "@/lib/api/workflow.service";

function FormField({ field, onSave, onFocus, readonly }: {
  field: ExtractedField; onSave: (value: string) => Promise<unknown>; onFocus?: () => void; readonly: boolean;
}) {
  const [value, setValue] = useState(field.value ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  useEffect(() => { if (!dirty) setValue(field.value ?? ""); }, [field.value, dirty]);
  return <div className="shoebox-field">
    <label className="shoebox-label" htmlFor={"field-" + field.label}>{field.label}
      <em className="conf">{field.correctedBy ? "Reviewed correction" : field.confidence === null ? "Confidence not provided" : (field.confidence * 100).toFixed(1) + "%"}</em>
    </label>
    <input id={"field-" + field.label} aria-label={field.label} value={value} disabled={readonly || saving}
      onFocus={onFocus} onChange={e => { setValue(e.target.value); setDirty(true); setConflict(false); setError(""); }} />
    <small>Raw: {field.rawValue ?? "Not provided"}<br/>Extracted: {field.original ?? "Not provided"}<br/>Saved: {field.value ?? "Not provided"} | {field.method ?? "Method not provided"}</small>
    {!readonly && <button type="button" className="btn small" aria-label={"Save " + field.label} disabled={!dirty || saving || conflict} onClick={async () => {
      setSaving(true); setError("");
      try { await onSave(value); setDirty(false); }
      catch (e) { setError((e as Error).message); setConflict(e instanceof ApiError && e.status === 409); }
      finally { setSaving(false); }
    }}>{saving ? "Saving..." : "Save field"}</button>}
    {error && <p role="alert">{error}{conflict ? " Latest data refreshed; your draft is retained. Edit again after reviewing the saved value." : ""}</p>}
  </div>;
}

export function DocumentReview({
  user,
  documentId,
}: {
  user: User;
  documentId: string;
}) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const { data, error, loading, refresh, setData } = useResource(
    async () => {
      const [doc, extraction] = await Promise.all([
        getDocument(user, documentId),
        getExtraction(user, documentId),
      ]);
      const validationReport = ["UPLOADED","QUEUED","PROCESSING","FAILED"].includes(doc.status) ? null : await getValidationReport(user, documentId);
      const [exceptionResult, recordResult, auditResult, commentResult, workflowResult, reviewResult] = await Promise.all([
        loadReviewResource(getExceptions(user).then((items) => items.filter((e) => e.documentId === documentId)), "Exceptions", []),
        loadReviewResource(getStandardisedRecords(user), "Standardised records", []),
        loadReviewResource(getAuditLogs(user), "Audit history", []),
        loadReviewResource(getDocumentComments(documentId), "Comments", []),
        loadReviewResource(getDocumentKindWorkflow(documentId), "Document workflow", { kind: "", fields: {}, overdue: false, duplicates: [], relatedNotes: [] }),
        loadReviewResource(getDocumentReviews(documentId), "Review history", null),
      ]);
      return { doc, extraction, validation: validationReport?.results ?? [], validationReport,
        exceptions: exceptionResult.data, records: recordResult.data, audit: auditResult.data,
        comments: commentResult.data, workflow: workflowResult.data, reviews: reviewResult.data,
        resourceErrors: [exceptionResult, recordResult, auditResult, commentResult, workflowResult, reviewResult].flatMap(result => result.error ? [result.error] : []),
        recordError: recordResult.error, commentError: commentResult.error, auditError: auditResult.error,
      };
    },
    `${user.id}:${documentId}`,
  );
  const [panel, setPanel] = useState<"review" | "validation" | "record" | "activity">("review");
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const retryInFlight = useRef(false);
  const [retryDispatch, setRetryDispatch] = useState<RetryDispatchResponse | null>(null);
  const [comment, setComment] = useState("");
  const [highlightedField, setHighlightedField] = useState<string | undefined>();

  async function run<T,>(op: () => Promise<T>, message: string, propagate = false) {
    setBusy(true);
    setFailure("");
    setToast("");
    try {
      const result = await op();
      setToast(message);
      await refresh();
      return result;
    } catch (e) {
      setFailure((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await refresh();
      if (propagate) throw e;
    } finally {
      setBusy(false);
    }
  }

  async function saveLine(lineId: string, fieldKey: LineFieldKey, value: string): Promise<string> {
    const result = await run(async () => {
      const confirmed = await correctLineItem(documentId, lineId, fieldKey, value, data?.extraction.contentRevision ?? 0);
      const property = fieldKey === "unit_price" ? "unitPrice" : fieldKey;
      setData(current => current ? { ...current,
        doc: { ...current.doc, contentRevision: confirmed.contentRevision },
        extraction: { ...current.extraction, contentRevision: confirmed.contentRevision,
          lineItems: current.extraction.lineItems.map(line => line.id === confirmed.lineItemId ? { ...line, [property]: confirmed.value } : line) },
        validationReport: null, validation: [], reviews: null,
      } : current);
      return confirmed;
    }, "Line correction confirmed by the backend. Revalidate before review.", true);
    if (!result) throw new Error("The line correction was not confirmed.");
    return result.value;
  }
  async function requestRetry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setBusy(true); setFailure(""); setToast(""); setRetryDispatch(null);
    try { setRetryDispatch(await retryDocumentProcessing(user, documentId)); }
    catch (error) { setFailure(retryErrorMessage(error)); }
    finally {
      await refresh();
      retryInFlight.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!data || !["UPLOADED","QUEUED","PROCESSING"].includes(data.doc.status)) return;
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [data, refresh]);

  if (loading) return <LoadingState />;
  if (!data) return <ErrorState message={error} retry={refresh} />;

  const extraction = data.extraction ?? { documentId, fields: {}, lineItems: [] };
  const kind = sourceKind(extraction, data.doc.type);
  const hasRecord = data.records.some(record => record.documentId === documentId);
  const canReview = canEditDocument(user, data.doc, hasRecord);
  const revision = extraction.contentRevision;
  const currentRevision = !!revision && Number.isInteger(revision) && data.doc.contentRevision === revision;
  const approved = hasCurrentApproval(data.reviews, revision);
  const readonly = !canReview || !!error || !!data.recordError || !currentRevision || kind === "UNKNOWN";
  const validationReady = currentRevision && data.validationReport?.contentRevision === revision && data.validationReport.validationStatus === "PASS" && data.validationReport.coverageComplete !== false && !data.validationReport.blocking;
  const canStandardise = !readonly && approved && validationReady && standardisationAvailable(data.doc.status, kind, data.validationReport);
  const canApprove = !readonly && validationReady && canDecideReview(user, data.doc, data.reviews);
  const workflow = data.workflow ?? { overdue: false, duplicates: [], relatedNotes: [] };
  const validation = data.validation ?? [];
  const records = data.records ?? [];
  const comments = data.comments ?? [];
  const audit = data.audit ?? [];
  const record = records.find((r) => r.documentId === documentId);
  const failed = data.doc.status === "FAILED";
  const pending = ["UPLOADED", "QUEUED", "PROCESSING"].includes(data.doc.status);

  function lineField(lineId: string | undefined, key: LineFieldKey, label: string, value: string | number | null, displayValue?: string) {
    if (!lineId) return displayValue ?? value ?? "Not provided";
    const number = extraction.lineItems.findIndex(line => line.id === lineId) + 1;
    return <LineItemCorrectionField label={"Line " + number + " " + label} value={value} displayValue={displayValue}
      readonly={readonly} busy={busy} onSave={draft => saveLine(lineId, key, draft)} />;
  }

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

      {retryDispatch && <div role="status" className="panel-body"><p>Retry dispatch confirmed. Processing completion has not been confirmed by this response.</p><p>Document: {retryDispatch.id} | Processing job: {retryDispatch.jobId} | Reported job status: {retryDispatch.jobStatus}</p>{retryDispatch.queueJobId && <p>Queue job: {retryDispatch.queueJobId}</p>}</div>}
      {failure && <ErrorState message={failure} />}
      {error && <ErrorState message={error} retry={refresh} />}
      {data.resourceErrors.map(message => <ErrorState key={message} message={message} retry={refresh} />)}
      {data.validationReport && <Panel title="Backend validation"><div className="panel-body" role="status"><Badge>{data.validationReport.validationStatus}</Badge>{validation.some(result => result.checkStatus === "NOT_CHECKED") && <Badge>NOT_CHECKED</Badge>}<p>Human review required | No automatic approval</p><p>Content revision {data.extraction.contentRevision}</p>{validation.map((result,index) => <p key={index}><strong>{result.rule} | {validationState(result)}</strong> {result.field && <span>Field: {result.field}. </span>}{result.severity && <span>Severity: {result.severity}. </span>}{result.message}</p>)}</div></Panel>}

      {!failed && !pending && (
        <DocumentDetailPreview doc={data.doc} extraction={extraction} />
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
              disabled={busy || pending || !canReview || !!error}
              onClick={requestRetry}
            >
              <RefreshCw size={16} />{" "}
              {failed ? "Retry extraction" : "Waiting for Docling extraction"}
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
                <div className="shoebox-form-head">{kind === "UNKNOWN" ? "Unknown / Needs Review" : kind[0] + kind.slice(1).toLowerCase() + " fields"}</div>
                {(workflow.overdue || workflow.duplicates.length > 0 || workflow.relatedNotes.length > 0) && (
                  <div className="panel-body">
                    {workflow.overdue && <Badge>Overdue</Badge>}
                    {workflow.duplicates.length > 0 && <p>Possible duplicate document: {workflow.duplicates.map((d) => d.code).join(", ")}</p>}
                    {workflow.relatedNotes.length > 0 && <p>Related notes: {workflow.relatedNotes.map((d) => d.code).join(", ")}</p>}
                  </div>
                )}
                <div className="shoebox-fields">
                  {Object.keys(extraction.fields).length === 0 && <p>No accounting fields available. Review the original source.</p>}
                  {Object.entries(extraction.fields).map(([key, field]) => (
                    <FormField
                      key={key}
                      field={{ ...field, label: fieldLabel(kind, key, field.label) }}
                      readonly={readonly || busy}
                      onFocus={() => setHighlightedField(key)}
                      onSave={(value) =>
                        run(
                          () => updateExtractedField(user, documentId, key, value, data.extraction.contentRevision!),
                          "Correction saved with a new revision.", true,
                        )
                      }
                    />
                  ))}
                </div>
                {extraction.lineItems.length > 0 && (
                  <div className="shoebox-lines">
                    <strong>{kind === "BILL" ? "Charges / line items" : kind === "RECEIPT" ? "Receipt items" : "Line items"}</strong>
                    <DataTable
                      rows={extraction.lineItems}
                      rowKey={(r) => r.id ?? r.description ?? "line"}
                      columns={[
                        { label: "Description", render: (r) => lineField(r.id, "description", "Description", r.description) },
                        { label: "Qty", render: (r) => lineField(r.id, "quantity", "Quantity", r.quantity) },
                        { label: "Unit", render: (r) => lineField(r.id, "unit_price", "Unit price", r.unitPrice, money(r.unitPrice, extraction.fields.currency?.value)) },
                        { label: "Amount", render: (r) => lineField(r.id, "amount", "Amount", r.amount, money(r.amount, extraction.fields.currency?.value)) },
                      ]}
                    />
                    <details><summary>Line item source evidence</summary>{extraction.lineItems.map((line, i) => <div key={line.id ?? i}><strong>Line {i + 1}</strong>{Object.entries(line.evidence ?? {}).map(([key, evidence]) => <div key={key}><p>{key}</p><SourceEvidenceList evidence={evidence} documentId={documentId} /></div>)}</div>)}</details>
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
                          () => revalidateDocument(user, documentId),
                          "Backend validation completed.",
                        )
                      }
                    >
                      <CheckCircle2 size={16} /> Save & revalidate
                    </button>
                    <button className="btn" disabled={busy} onClick={() => run(() => saveDocumentDraft(documentId), "Draft saved.") }>
                      Save draft
                    </button>
                    {!approved && validationReady && ["EXTRACTED", "CORRECTED", "EXCEPTION", "IN_REVIEW", "VALIDATED"].includes(data.doc.status) && (
                      <button className="btn" disabled={busy} onClick={() => run(() => submitDocumentReview(documentId, "submitted", note || "Ready for approval", data.extraction.contentRevision!), "Submitted for approval.")}>
                        Submit for approval
                      </button>
                    )}
                    {user.role === "LOCAL_ADMIN" && data.doc.status === "IN_REVIEW" && (
                      <button className="btn primary" disabled={busy || !canApprove} onClick={() => run(() => decideDocumentReview(documentId, "approved", note || "Approved", data.extraction.contentRevision!), "Document approved.")}>
                        Approve document
                      </button>
                    )}
                    {user.role === "LOCAL_ADMIN" && data.doc.status === "IN_REVIEW" && data.reviews?.submissions[0]?.submittedBy === user.id && <p>A different local administrator must decide this submission.</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {panel === "validation" && (
            <Panel title="Validation centre" subtitle="Confirm every extracted value before this document moves to standardisation.">
              {data.validationReport && <div className="panel-body"><Badge>{data.validationReport.validationStatus}</Badge><p>{data.validationReport.passed} aggregate check passed ? {data.validationReport.failed} blocking findings ? {data.validationReport.warnings} warnings.</p><p>Human review and explicit approval remain required. This is not an extraction accuracy score.</p></div>}
              <div className="validation-results-head"><div><strong>Rule results</strong><span>{validation.length} backend findings at the current revision</span></div><Badge>{data.doc.status}</Badge></div>
              <DataTable
                rows={validation}
                rowKey={(v) => JSON.stringify([v.rule, v.field ?? null, validation.indexOf(v)])}
                columns={[
                  { label: "Check", render: (v) => <div className="validation-rule"><span className={`validation-icon ${v.result.toLowerCase()}`}>{v.result === "PASS" ? <CheckCircle2 size={16} /> : v.result === "WARNING" ? <AlertTriangle size={16} /> : <CircleX size={16} />}</span><strong>{v.rule}</strong></div> },
                  { label: "Result", render: (v) => <Badge>{validationState(v)}</Badge> },
                  { label: "Field", render: (v) => v.field ?? "Not provided" },
                  { label: "Severity", render: (v) => v.severity ?? "Not provided" },
                  { label: "What to do", render: (v) => <div><span className={v.result === "FAIL" ? "validation-message fail-text" : "validation-message"}>{v.message}</span>
                    {v.duplicate_of && <p><Link href={`${base}/documents/${encodeURIComponent(v.duplicate_of)}`}>Related document: {v.duplicate_of}</Link></p>}
                    {v.vendor_candidate && <p>Vendor suggestion: {v.vendor_candidate.vendor_name ?? "Not provided"}<br />Similarity: {v.vendor_candidate.similarity ?? "Not provided"} (name matching, not extraction confidence)<br />Method: {v.vendor_candidate.score_method ?? "Not provided"}</p>}
                  </div> },
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
                  disabled={busy || !canStandardise}
                  className="btn primary"
                  onClick={() => run(() => standardiseDocument(user, documentId), "Standardised accounting record created.")}
                >
                  <FileCheck2 size={16} /> Create standardised record
                </button>
              </div>
            </Panel>
          )}

          {panel === "record" &&
            (data.recordError ? <ErrorState message={data.recordError} retry={refresh} /> : record ? (
              <RecordDetail record={record} />
            ) : (
              <Panel title="No standardised record">
                <div className="panel-body">
                  <p>Complete supported validation and explicit human approval before creating a record. Unknown documents and NOT_CHECKED validation cannot be standardised.</p>
                  <button
                    className="btn primary"
                    disabled={busy || !canStandardise}
                    onClick={() => run(() => standardiseDocument(user, documentId), "Standardised accounting record created.")}
                  >
                    <FileCheck2 size={16} /> Create standardised record
                  </button>
                </div>
              </Panel>
            ))}

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
                  disabled={busy || !!error || !canReview || !comment.trim()}
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
              {!data.commentError && comments.length === 0 && <p className="empty-state">No comments yet.</p>}
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
              {!data.auditError && <DataTable
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
              />}
            </Panel>
            <WorkflowControls user={user} documentId={documentId} />
            </>
          )}
        </>
      )}
      <Toast message={toast} />
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleX, FileCheck2, RefreshCw } from "lucide-react";
import type { ExtractedField, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  retryDocumentProcessing,
  getDocument,
  getExceptions,
  getExtraction,
  getValidationReport,
  revalidateDocument,
  updateExtractedField,
  updateExtractedLineItem,
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
import { ApiError } from "@/lib/api/client";
import { canEditDocument, canDecideReview } from "@/lib/permissions/document-review";
import { decimalDisplay as money, fieldLabel, sourceKind, standardisationAvailable, validationState } from "@/lib/api/document-contract";
import { DocumentViewer, SourceEvidenceList } from "@/components/common/documents/document-viewer";
import { DocumentDetailPreview } from "@/features/common/documents/invoice-detail-preview";
import { RecordDetail } from "@/features/common/records/records";
import {
  addDocumentComment,
  decideDocumentReview,
  getDocumentKindWorkflow,
  getDocumentReviews,
  getDocumentComments,
  saveDocumentDraft,
  submitDocumentReview,
  type DocumentComment,
} from "@/lib/api/workflow.service";


function FormField({ field, onSave, onFocus, readonly }: {
  field: ExtractedField; onSave: (value: string) => Promise<void>; onFocus?: () => void; readonly: boolean;
}) {
  const [value, setValue] = useState(field.value ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  useEffect(() => { if (!dirty) setValue(field.value ?? ""); }, [field.value, dirty]);
  return <div className="shoebox-field">
    <label className="shoebox-label" htmlFor={"field-" + field.label}>{field.label}
      <em className="conf">{field.correctedBy ? "Reviewed correction" : "Source state: " + (field.state ?? "unverified")}</em>
    </label>
    <input id={"field-" + field.label} aria-label={field.label} value={value} disabled={readonly || saving}
      onFocus={onFocus} onChange={e => { setValue(e.target.value); setDirty(true); setConflict(false); setError(""); }} />
    <small>Raw: {field.rawValue ?? "Not provided"}<br/>Extracted: {field.original ?? "Not provided"}<br/>Saved: {field.value ?? "Not provided"} | {field.method ?? "Method not provided"}</small>
    {field.confirmationRequired && <small>Accountant confirmation required</small>}
    {field.warnings?.map((warning, index) => <p role="status" key={warning.code + index}>
      {warning.reviewed ? "Reviewed source warning" : "Extraction warning"}: {warning.message}
    </p>)}
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
  const { data, error, loading, refresh } = useResource(
    async () => {
      const [doc, extraction] = await Promise.all([
        getDocument(user, documentId),
        getExtraction(user, documentId),
      ]);
      const validationReport = ["UPLOADED","QUEUED","PROCESSING","FAILED"].includes(doc.status) ? null : await getValidationReport(user, documentId);
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
      const [exceptions, records, audit, comments, workflow, reviews] = await Promise.all([
        optional(getExceptions(user).then((items) => items.filter((e) => e.documentId === documentId)), []),
        optional(getStandardisedRecords(user), []),
        optional(getAuditLogs(user), []),
        optional(getDocumentComments(documentId), []),
        optional(getDocumentKindWorkflow(documentId), { kind: "", fields: {}, overdue: false, duplicates: [], relatedNotes: [] }),
        optional(getDocumentReviews(documentId), null),
      ]);
      return { doc, extraction, validation: validationReport?.results ?? [], validationReport, exceptions, records, audit, comments, workflow, reviews };
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

  async function run(op: () => Promise<unknown>, message: string, propagate = false) {
    setBusy(true);
    setFailure("");
    try {
      await op();
      setToast(message);
      await refresh();
    } catch (e) {
      setFailure((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await refresh();
      if (propagate) throw e;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!data || !["UPLOADED","QUEUED","PROCESSING"].includes(data.doc.status)) return;
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [data, refresh]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const extraction = data.extraction ?? { documentId, fields: {}, lineItems: [] };
  const kind = sourceKind(extraction, data.doc.type);
  const sourceReadonly = ["COMPLETED","STANDARDISED"].includes(data.doc.status) || !extraction.contentRevision || kind === "UNKNOWN";
  const canStandardise = standardisationAvailable(data.doc.status, kind, data.validationReport);
  const workflow = data.workflow ?? { overdue: false, duplicates: [], relatedNotes: [] };
  const validation = data.validation ?? [];
  const records = data.records ?? [];
  const comments = data.comments ?? [];
  const audit = data.audit ?? [];
  const record = records.find((r) => r.documentId === documentId);
  const readonly = sourceReadonly || !canEditDocument(user, data.doc, !!record);
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
              disabled={busy || pending}
              onClick={() =>
                run(
                  () => retryDocumentProcessing(user, documentId),
                  "Extraction retry queued.",
                )
              }
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
                      readonly={readonly}
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
                {!!extraction.warnings?.length && <div aria-label="Extraction warnings"><strong>Extraction warnings</strong>
                  <p>Source uncertainty is separate from accounting validation.</p>
                  {extraction.warnings.map((warning, index) => <p role="status" key={warning.code + index}>{warning.message}</p>)}
                </div>}
                {extraction.lineItems.length > 0 && (
                  <div className="shoebox-lines">
                    <strong>{kind === "BILL" ? "Charges / line items" : kind === "RECEIPT" ? "Receipt items" : "Line items"}</strong>
                    <DataTable
                      rows={extraction.lineItems}
                      rowKey={(r) => r.id ?? r.description ?? "line"}
                      columns={[
                        { label: "Description", render: (r) => r.description ?? "Not provided" },
                        { label: "Qty", render: (r) => r.quantity ?? "Not provided" },
                        { label: "Unit", render: (r) => money(r.unitPrice, extraction.fields.currency?.value) },
                        { label: "Amount", render: (r) => money(r.amount, extraction.fields.currency?.value) },
                      ]}
                    />
                    <details><summary>Correct line items</summary>
                      <p>Save only values supported by the original document. Missing cells stay empty until confirmed.</p>
                      {extraction.lineItems.map((line, index) => <div className="shoebox-fields" key={line.id ?? index}>
                        {([['description', 'description', 'Description'], ['quantity', 'quantity', 'Quantity'], ['unit_price', 'unitPrice', 'Unit price'], ['amount', 'amount', 'Amount']] as const).map(([key, property, label]) => {
                          const originalRows = extraction.raw?.line_items as Array<Record<string, {value?: string | null}>> | undefined;
                          const original = originalRows?.[index]?.[key]?.value ?? null;
                          const correction = extraction.lineCorrections?.find(item => item.line_item_id === line.id && item.field_key === key);
                          const guidance = line.guidance?.[key];
                          return <FormField key={key} readonly={readonly || !line.id}
                            field={{label: `Line ${index + 1} ${label}`, value: line[property] == null ? null : String(line[property]),
                              original, rawValue: line.evidence?.[key]?.map(e => e.text).filter(Boolean).join(" | ") || null,
                              confidence: null, state: line.fieldStates?.[key], evidence: line.evidence?.[key],
                              method: line.methods?.[key] ?? "Method not provided",
                              correctedBy: correction?.corrected_by, correctedAt: correction?.corrected_at,
                              confirmationRequired: !correction, warnings: guidance?.warnings?.map(w => ({...w, reviewed: !!correction}))}}
                            onSave={value => run(() => updateExtractedLineItem(user, documentId, line.id!, key, value, extraction.contentRevision!), "Line correction saved with a new revision.", true)} />;
                        })}
                      </div>)}
                      {!!extraction.lineCorrections?.length && <details><summary>Line correction history</summary>
                        {extraction.lineCorrections.map((item, index) => <p key={index}>{item.field_key}: {item.old_value ?? "Not provided"} → {item.new_value ?? "Not provided"} | {item.corrected_by} | {item.corrected_at}</p>)}
                      </details>}
                    </details>
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
                          "Review saved and revalidated.",
                        )
                      }
                    >
                      <CheckCircle2 size={16} /> Save & revalidate
                    </button>
                    <button className="btn" disabled={busy} onClick={() => run(() => saveDocumentDraft(documentId), "Draft saved.") }>
                      Save draft
                    </button>
                    {user.role === "ACCOUNTANT" && data.validationReport?.validationStatus === "PASS" && (
                      <button className="btn" disabled={busy} onClick={() => run(() => submitDocumentReview(documentId, "submitted", note || "Ready for approval", data.doc.contentRevision ?? 1), "Submitted for approval.")}>
                        Submit for approval
                      </button>
                    )}
                    {canDecideReview(user, data.doc, data.reviews) && data.validationReport?.validationStatus === "PASS" && data.validationReport.coverageComplete !== false && (
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
                  onClick={() => run(async () => { await standardiseDocument(user, documentId); setPanel("record"); }, "Standardised accounting record created.")}
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

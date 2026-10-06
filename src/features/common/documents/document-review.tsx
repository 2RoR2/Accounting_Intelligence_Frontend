"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, CheckCircle2, FileCheck2, RefreshCw, Save } from "lucide-react";
import type { ExtractedField, User } from "@/types";
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
  money,
} from "@/components/common/ui";
import { DocumentViewer } from "@/components/common/documents/document-viewer";
import { RecordDetail } from "@/features/common/records/records";
function ExtractionField({
  field,
  onSave,
  readonly,
}: {
  field: ExtractedField;
  onSave: (value: string) => Promise<void>;
  readonly: boolean;
}) {
  const [value, setValue] = useState(field.value);
  const [saving, setSaving] = useState(false);
  return (
    <div className="extraction-field">
      <div className="extraction-label">
        <span>{field.label}</span>
        <span
          className={`confidence ${field.confidence >= 95 ? "high" : field.confidence >= 80 ? "medium" : "low"}`}
        >
          {field.correctedBy ? (
            <>
              <Check size={12} /> Reviewed
            </>
          ) : (
            `${field.confidence}% · ${field.confidence >= 95 ? "High" : field.confidence >= 80 ? "Review suggested" : "Low confidence"}`
          )}
        </span>
      </div>
      <div className="inline-input">
        <input
          aria-label={field.label}
          value={value}
          disabled={readonly || saving}
          onChange={(e) => setValue(e.target.value)}
        />
        {!readonly && (
          <button
            aria-label={`Save ${field.label}`}
            title={`Save ${field.label}`}
            className="icon-btn"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(value);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Save size={16} />
          </button>
        )}
      </div>
      {field.correctedBy && (
        <div className="correction-note">
          AI original: {field.original || "(empty)"} → Corrected: {field.value}
          <br />
          Reviewed by {field.correctedBy}
        </div>
      )}
    </div>
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
    async () => ({
      doc: await getDocument(user, documentId),
      extraction: await getExtraction(user, documentId),
      validation: await getValidationResults(user, documentId),
      exceptions: (await getExceptions(user)).filter(
        (e) => e.documentId === documentId,
      ),
      records: await getStandardisedRecords(user),
      audit: await getAuditLogs(user),
    }),
    `${user.id}:${documentId}`,
  );
  const [tab, setTab] = useState("Extracted Data");
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
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
  const record = data.records.find((r) => r.documentId === documentId);
  const failed = data.doc.status === "FAILED";
  const pending = ["UPLOADED", "QUEUED", "PROCESSING"].includes(
    data.doc.status,
  );
  const steps = [
    "Uploaded",
    "Queued",
    "Processing",
    "Extracted",
    "Validation",
    "Standardised",
  ];
  const current = readonly
    ? 6
    : data.doc.status === "VALIDATED"
      ? 5
      : failed
        ? 2
        : pending
          ? ["UPLOADED", "QUEUED", "PROCESSING"].indexOf(data.doc.status)
          : 4;
  return (
    <>
      <PageHeader
        eyebrow="DOCUMENT WORKSPACE / DOCUMENT REVIEW"
        title={data.doc.name}
        description={`${data.doc.id} · Uploaded ${formatDate(data.doc.createdAt)} · ${data.doc.seconds} sec processing`}
        actions={
          <>
            <Badge>{data.doc.status}</Badge>
            <Link href={`${base}/documents`} className="btn">
              All documents
            </Link>
          </>
        }
      />
      <div className="timeline">
        {steps.map((s, i) => (
          <div
            className={i < current ? "done" : i === current ? "current" : ""}
            key={s}
          >
            <span>{i < current ? <Check size={14} /> : i + 1}</span>
            <strong>{s}</strong>
            <small>
              {i < current ? "Complete" : i === current ? "Current" : "Pending"}
            </small>
          </div>
        ))}
      </div>
      {failure && <ErrorState message={failure} />}
      {failed || pending ? (
        <Panel title={failed ? "Processing failed" : "Processing in progress"}>
          <div className="panel-body">
            <p>
              {failed
                ? "The document scan could not be processed. Retry with the sample extraction."
                : "Resume processing if you left the upload flow."}
            </p>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => advanceProcessing(user, documentId, "EXTRACTED"),
                  "Sample extraction completed.",
                )
              }
            >
              <RefreshCw size={16} />{" "}
              {failed ? "Retry processing" : "Complete processing"}
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="tabs">
            {[
              "Document",
              "Extracted Data",
              "Validation",
              "Exceptions",
              "Standardised Record",
              "Activity",
            ].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
                {t === "Exceptions" &&
                  data.exceptions.some((e) => e.status !== "RESOLVED") && (
                    <span className="tab-count">
                      {
                        data.exceptions.filter((e) => e.status !== "RESOLVED")
                          .length
                      }
                    </span>
                  )}
              </button>
            ))}
          </div>
          {tab === "Document" && (
            <div className="preview-alone">
              <DocumentViewer
                name={data.doc.name}
                extraction={data.extraction}
              />
            </div>
          )}
          {(tab === "Extracted Data" || tab === "Exceptions") && (
            <div className="review-grid">
              <DocumentViewer
                name={data.doc.name}
                extraction={data.extraction}
              />
              <div>
                <Panel
                  title="AI extracted data"
                  subtitle="Compare with the source and save each reviewed field."
                  action={<span className="subtle-tag">Sample extraction</span>}
                >
                  <div className="panel-body">
                    {tab === "Exceptions" && (
                      <div className="exception-summary">
                        {data.exceptions.map((e) => (
                          <div className="exception-card" key={e.id}>
                            <Badge>{e.status}</Badge>
                            <strong>{e.type.replaceAll("_", " ")}</strong>
                            <p>{e.message}</p>
                            <small>Severity: {e.severity}</small>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="extraction-grid">
                      {Object.entries(data.extraction.fields).map(
                        ([key, field]) => (
                          <ExtractionField
                            key={`${key}:${field.value}:${field.correctedBy}`}
                            field={field}
                            readonly={readonly}
                            onSave={(value) =>
                              run(
                                () =>
                                  updateExtractedField(
                                    user,
                                    documentId,
                                    key,
                                    value,
                                  ),
                                "Extracted field updated.",
                              )
                            }
                          />
                        ),
                      )}
                    </div>
                    <p className="field-help">
                      Use the save icon to confirm low-confidence values, even
                      when the value is correct.
                    </p>
                  </div>
                </Panel>
                <Panel title="Line items">
                  <DataTable
                    rows={data.extraction.lineItems}
                    rowKey={(r) => r.description}
                    columns={[
                      { label: "Description", render: (r) => r.description },
                      { label: "Qty", render: (r) => r.quantity },
                      {
                        label: "Unit price",
                        render: (r) => money(r.unitPrice),
                      },
                      { label: "Amount", render: (r) => money(r.amount) },
                    ]}
                  />
                </Panel>
                {!readonly && (
                  <Panel title="Review & revalidate">
                    <div className="panel-body">
                      <Field label="Correction note *">
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Explain what you checked or corrected…"
                        />
                      </Field>
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => resolveException(user, documentId, note),
                            "Validation updated. Check the Validation tab for results.",
                          )
                        }
                      >
                        <CheckCircle2 size={16} /> Save & revalidate
                      </button>
                    </div>
                  </Panel>
                )}
              </div>
            </div>
          )}
          {tab === "Validation" && (
            <Panel
              title="Validation summary"
              subtitle="Company-specific rules applied to the current extracted values"
            >
              <div className="validation-summary">
                {(["PASS", "WARNING", "FAIL"] as const).map((s) => (
                  <div key={s}>
                    <strong>
                      {data.validation.filter((v) => v.result === s).length}
                    </strong>
                    <Badge>{s}</Badge>
                  </div>
                ))}
              </div>
              <DataTable
                rows={data.validation}
                rowKey={(v) => v.rule}
                columns={[
                  { label: "Rule", render: (v) => <strong>{v.rule}</strong> },
                  { label: "Result", render: (v) => <Badge>{v.result}</Badge> },
                  { label: "Message", render: (v) => v.message },
                ]}
              />
              <div className="panel-body actions">
                {!readonly && (
                  <button
                    disabled={busy}
                    className="btn"
                    onClick={() =>
                      run(
                        () => revalidateDocument(user, documentId),
                        "Document revalidated.",
                      )
                    }
                  >
                    <RefreshCw size={15} /> Revalidate
                  </button>
                )}
                <button
                  disabled={busy || data.doc.status !== "VALIDATED"}
                  className="btn primary"
                  onClick={() =>
                    run(
                      () => standardiseDocument(user, documentId),
                      "Standardised accounting record created.",
                    )
                  }
                >
                  <FileCheck2 size={16} /> Create standardised record
                </button>
                <span className="muted">
                  Resolve failures and review low-confidence fields first.
                </span>
              </div>
            </Panel>
          )}
          {tab === "Standardised Record" &&
            (record ? (
              <RecordDetail record={record} />
            ) : (
              <Panel title="Ready for a consistent record">
                <div className="panel-body">
                  <p>
                    Complete validation and resolve all exceptions to
                    standardise this invoice.
                  </p>
                  <button
                    className="btn primary"
                    disabled={busy || data.doc.status !== "VALIDATED"}
                    onClick={() =>
                      run(
                        () => standardiseDocument(user, documentId),
                        "Standardised accounting record created.",
                      )
                    }
                  >
                    <FileCheck2 size={16} /> Create standardised record
                  </button>
                </div>
              </Panel>
            ))}
          {tab === "Activity" && (
            <Panel title="Document activity">
              <DataTable
                rows={data.audit.filter(
                  (a) =>
                    a.resource === data.doc.name ||
                    a.resource === documentId ||
                    a.resource === record?.id,
                )}
                rowKey={(a) => a.id}
                columns={[
                  {
                    label: "Timestamp",
                    render: (a) =>
                      new Date(a.timestamp).toLocaleString("en-MY"),
                  },
                  { label: "User", render: (a) => a.user },
                  {
                    label: "Action",
                    render: (a) => a.action.replaceAll("_", " "),
                  },
                  { label: "Details", render: (a) => a.details },
                ]}
              />
            </Panel>
          )}
        </>
      )}
      <Toast message={toast} />
    </>
  );
}

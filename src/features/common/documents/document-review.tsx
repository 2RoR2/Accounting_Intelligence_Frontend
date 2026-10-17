"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, CheckCircle2, FileCheck2, RefreshCw } from "lucide-react";
import type { ExtractedField, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
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

function FormField({
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
  const [panel, setPanel] = useState<"review" | "validation" | "record" | "activity">("review");
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

  const pending = Boolean(data?.doc && ["UPLOADED", "QUEUED", "PROCESSING"].includes(data.doc.status));

  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      refresh();
    }, 2500);
    return () => clearInterval(interval);
  }, [pending, refresh]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const readonly = data.doc.status === "COMPLETED";
  const record = data.records.find((r) => r.documentId === documentId);
  const failed = data.doc.status === "FAILED";

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

      {failed || pending ? (
        <Panel title={failed ? "Processing failed" : "Processing in progress"}>
          <div className="panel-body">
            <p>
              {failed
                ? "The document could not be processed. You can retry extraction."
                : "Docling extraction worker is processing this document. Status will update automatically."}
            </p>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => run(refresh, "Status refreshed.")}
            >
              <RefreshCw size={16} />{" "}
              Refresh status
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
                <DocumentViewer name={data.doc.name} extraction={data.extraction} documentId={documentId} />
              </div>
              <div className="shoebox-form">
                <div className="shoebox-form-head">Extracted fields</div>
                <div className="shoebox-fields">
                  {Object.entries(data.extraction.fields).map(([key, field]) => (
                    <FormField
                      key={`${key}:${field.value}:${field.correctedBy}`}
                      field={field}
                      readonly={readonly}
                      onSave={(value) =>
                        run(
                          () => updateExtractedField(user, documentId, key, value),
                          "Field updated.",
                        )
                      }
                    />
                  ))}
                </div>
                {data.extraction.lineItems.length > 0 && (
                  <div className="shoebox-lines">
                    <strong>Line items</strong>
                    <DataTable
                      rows={data.extraction.lineItems}
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
                  </div>
                )}
              </div>
            </div>
          )}

          {panel === "validation" && (
            <Panel title="Validation" subtitle="Rules applied to the extracted values">
              <div className="validation-summary">
                {(["PASS", "WARNING", "FAIL"] as const).map((s) => (
                  <div key={s}>
                    <strong>{data.validation.filter((v) => v.result === s).length}</strong>
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
                    onClick={() => run(() => revalidateDocument(user, documentId), "Document revalidated.")}
                  >
                    <RefreshCw size={15} /> Revalidate
                  </button>
                )}
                <button
                  disabled={busy || data.doc.status !== "VALIDATED"}
                  className="btn primary"
                  onClick={() => run(() => standardiseDocument(user, documentId), "Standardised accounting record created.")}
                >
                  <FileCheck2 size={16} /> Create standardised record
                </button>
              </div>
            </Panel>
          )}

          {panel === "record" &&
            (record ? (
              <RecordDetail record={record} />
            ) : (
              <Panel title="Ready for standardisation">
                <div className="panel-body">
                  <p>Complete validation and resolve exceptions to create the standardised accounting record.</p>
                  <button
                    className="btn primary"
                    disabled={busy || data.doc.status !== "VALIDATED"}
                    onClick={() => run(() => standardiseDocument(user, documentId), "Standardised accounting record created.")}
                  >
                    <FileCheck2 size={16} /> Create standardised record
                  </button>
                </div>
              </Panel>
            ))}

          {panel === "activity" && (
            <Panel title="Document activity">
              <DataTable
                rows={data.audit.filter(
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
          )}
        </>
      )}
      <Toast message={toast} />
    </>
  );
}

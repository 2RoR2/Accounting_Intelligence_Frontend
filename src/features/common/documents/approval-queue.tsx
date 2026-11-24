"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { documentDisplayName } from "@/lib/document-display-name";
import { CheckCircle2, RotateCcw, XCircle, ExternalLink, FileText } from "lucide-react";
import type { Extraction, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments, getExtraction, getValidationReport } from "@/lib/api/document.service";
import { canDecideReview } from "@/lib/permissions/document-review";
import { decimalDisplay } from "@/lib/api/document-contract";
import { bulkApproveReviews, decideDocumentReview, getDocumentReviews } from "@/lib/api/workflow.service";
import { BulkControls, useBulkSelection } from "@/features/common/bulk-actions";
import { DocumentTabBar } from "@/features/common/documents/document-tab-bar";
import { reviewTabs } from "@/features/common/documents/document-tabs";
import { bulkResultSummary, saveApprovedToRecords, savedToRecordsSummary } from "@/features/common/bulk-selection";
import { standardiseDocument } from "@/lib/api/record.service";
import {
  Badge,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  Toast,
  formatDate,
  money,
} from "@/components/common/ui";

type Change = { label: string; from: string; to: string };

export function ApprovalQueuePage({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSummary, setBulkSummary] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [confirm, setConfirm] = useState<Array<{ documentId: string; expectedContentRevision: number; number: string }>>([]);

  const { data, error, loading, refresh } = useResource(async () => {
    const docs = await getDocuments(user, { status: "IN_REVIEW" });
    return Promise.all(docs.map(async (doc) => {
      const [extraction, reviews, validation] = await Promise.all([
        getExtraction(user, doc.id).catch(() => null),
        getDocumentReviews(doc.id).catch(() => null),
        getValidationReport(user, doc.id).catch(() => null),
      ]);
      return { doc, extraction, reviews, validation };
    }));
  }, `approval-queue:${user.id}`);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function decide(documentId: string, decision: "approved" | "rejected" | "returned", revision: number) {
    setBusyId(documentId);
    setMessage("");
    setDecisionError("");
    try {
      await decideDocumentReview(documentId, decision, note.trim() || defaultNote(decision), revision);
      if (decision === "approved") {
        // An approved document is saved to records straight away, so it shows in "Approved, not posted yet".
        const saved = await saveApprovedToRecords([documentId], (id) => standardiseDocument(user, id));
        if (saved.failed.length) setDecisionError(`Document approved, but not saved to records: ${saved.failed[0].reason} Open it and use Save to records.`);
        else setMessage("Document approved and saved to records.");
      } else {
        setMessage(decision === "returned" ? "Document returned for revalidation." : "Document rejected.");
      }
      setNote("");
      await refresh();
    } catch (e) {
      setDecisionError(e instanceof Error ? e.message : "Decision failed. Refresh and try again.");
    } finally {
      setBusyId(null);
    }
  }

  const rows = (data ?? []).filter(({ doc }) =>
    `${doc.code ?? ""} ${documentDisplayName(doc, doc.name)} ${doc.name} ${doc.supplier ?? ""} ${doc.customer ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  ).map((row) => {
    const { doc, extraction, reviews, validation } = row;
    const revision = doc.contentRevision ?? extraction?.contentRevision;
    const canApprove = canDecideReview(user, doc, reviews) && validation?.validationStatus === "PASS" && validation.coverageComplete !== false;
    return { ...row, revision, canApprove, selectionKey: `${doc.id}:${revision}` };
  });
  const canBulkApprove = user.role === "LOCAL_ADMIN";
  const eligible = canBulkApprove ? rows.filter((row) => row.canApprove && !!row.revision) : [];
  const selection = useBulkSelection(eligible.map((row) => row.selectionKey), `${user.id}:${search}`);

  async function approveSelected() {
    if (!canBulkApprove || bulkBusy || !confirm.length) return;
    setBulkBusy(true);
    setBulkError("");
    setBulkSummary("");
    try {
      const { results } = await bulkApproveReviews(confirm.map(({ documentId, expectedContentRevision }) => ({
        documentId, expectedContentRevision,
      })), note.trim() || undefined);
      const names = new Map(confirm.map((item) => [item.documentId, item.number]));
      const label = (id: string) => names.get(id) ?? id;
      const saved = await saveApprovedToRecords(results.filter((item) => item.ok).map((item) => item.documentId),
        (id) => standardiseDocument(user, id));
      setBulkSummary([bulkResultSummary("approved", results, (item) => label(item.documentId)), savedToRecordsSummary(saved, label)]
        .filter(Boolean).join(". "));
      setConfirm([]);
      setNote("");
      selection.clear();
      await refresh();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Unable to approve the selected documents.");
    } finally {
      setBulkBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  return (
    <div className="approval-queue-page">
      <PageHeader
        eyebrow="REVIEW"
        title="Approval queue"
        description="Each item shows the file the accountant edited and the changes they made."
      />
      {message && <Toast message={message} />}
      {decisionError && <p className="notice danger" role="alert">{decisionError}</p>}
      {bulkSummary && <p className="notice" role="status">{bulkSummary}</p>}
      <Panel title="Waiting for approval" subtitle={`${rows.length} document${rows.length === 1 ? "" : "s"} in review`}>
        <DocumentTabBar label="Review lanes" tabs={reviewTabs(base, user.role, { page: "approvals" })} />
        <div className="filter-bar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search code, file, supplier, or customer…" />
        </div>
        {canBulkApprove && <BulkControls selection={selection} eligibleCount={eligible.length} busy={bulkBusy || !!busyId}>
          <button type="button" className="btn primary" disabled={bulkBusy || !!busyId || !selection.ids.length} onClick={() => {
            setBulkError("");
            setConfirm(eligible.filter((row) => selection.checked.has(row.selectionKey)).map(({ doc, revision }) => ({
              documentId: doc.id, expectedContentRevision: revision!, number: doc.code || doc.name,
            })));
          }}>Approve selected</button>
        </BulkControls>}
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <Field label="Decision note · Optional (applied to the next action)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a short note for the audit trail…" rows={2} />
          </Field>
        </div>
        {rows.length === 0 ? (
          <div className="panel-body"><p>{search
            ? "No documents match this search. Clear it to see the approval queue."
            : "Nothing is waiting for approval. Documents appear here when an accountant submits them."}</p></div>
        ) : (
          <div className="approval-list">
            {rows.map(({ doc, extraction, reviews, revision, canApprove, selectionKey }) => {
              const changes = changeList(extraction);
              const submitted = reviews?.submissions?.[0];
              const busy = !!busyId || bulkBusy;
              const checked = selection.checked.has(selectionKey);
              const amount = doc.totalAmount ?? extraction?.fields.total?.value;
              const currency = extraction?.fields.currency?.value;
              return (
                <article className="approval-card" key={doc.id}>
                  <header>
                    <div>
                      <strong>{doc.code || doc.name}</strong>
                      <Link href={`${base}/documents/${doc.id}`}><FileText size={14} /> {documentDisplayName(doc, doc.name)}</Link>
                    </div>
                    <Badge>{(doc.kind || doc.type || "DOCUMENT").replaceAll("_", " ")}</Badge>
                    {canBulkApprove && <input type="checkbox" aria-label={`Select ${doc.code || doc.name}`} checked={checked}
                      disabled={busy || !canApprove || !revision || (selection.atLimit && !checked)}
                      onChange={() => selection.toggle(selectionKey)} />}
                  </header>
                  <dl>
                    <div><dt>File</dt><dd>{doc.name}</dd></div>
                    <div><dt>Party</dt><dd>{doc.supplier || doc.customer || "—"}</dd></div>
                    <div><dt>Amount</dt><dd>{amount != null && amount !== "" && Number.isFinite(Number(amount)) && (!currency || currency === "MYR")
                      ? money(amount) : decimalDisplay(amount, currency)}</dd></div>
                    <div><dt>Submitted</dt><dd>{submitted ? `${formatDate(submitted.createdAt)}${submitted.note ? ` · ${submitted.note}` : ""}` : formatDate(doc.createdAt)}</dd></div>
                  </dl>
                  <div className="approval-changes">
                    <h3>Changes made</h3>
                    {changes.length === 0 ? (
                      <p>No field or line edits were recorded. The accountant submitted the extracted values as they were.</p>
                    ) : (
                      <ul>
                        {changes.map((change, index) => (
                          <li key={`${index}-${change.label}`}>
                            <strong>{change.label}</strong>
                            <span>{change.from || "empty"}</span>
                            <em>→</em>
                            <span>{change.to || "empty"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn primary small" disabled={busy || !canApprove} onClick={() => decide(doc.id, "approved", revision ?? 1)}><CheckCircle2 size={14} /> Approve</button>
                    <button type="button" className="btn small" disabled={busy} onClick={() => decide(doc.id, "returned", revision ?? 1)}><RotateCcw size={14} /> Return</button>
                    <button type="button" className="btn small danger" disabled={busy} onClick={() => decide(doc.id, "rejected", revision ?? 1)}><XCircle size={14} /> Reject</button>
                    <Link className="btn small" href={`${base}/documents/${doc.id}`}><ExternalLink size={14} /> Open file</Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
      {confirm.length > 0 && (
        <Modal title="Approve selected documents" onClose={() => setConfirm([])} closeDisabled={bulkBusy}>
          <div className="panel-body">
            <p>Approve {confirm.length} {confirm.length === 1 ? "document" : "documents"}?</p>
            {bulkError && <p className="notice danger" role="alert">{bulkError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" disabled={bulkBusy} onClick={() => setConfirm([])}>Cancel</button>
              <button type="button" className="btn primary" disabled={bulkBusy} onClick={() => void approveSelected()}>{bulkBusy ? "Approving…" : "Approve selected"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function changeList(extraction: Extraction | null): Change[] {
  if (!extraction) return [];
  const fieldChanges = Object.values(extraction.fields ?? {})
    .filter((field) => field.correctedBy)
    .map((field) => ({
      label: field.label || "Field",
      from: field.rawValue || field.normalizedValue || field.original || "",
      to: field.currentValue || field.value || "",
    }));
  const lineChanges = (extraction.lineCorrections ?? []).map((item) => ({
    label: `Line · ${item.field_key.replaceAll("_", " ")}`,
    from: item.old_value || "",
    to: item.new_value || "",
  }));
  return [...fieldChanges, ...lineChanges];
}

function defaultNote(decision: "approved" | "rejected" | "returned") {
  if (decision === "approved") return "Approved from the approval queue.";
  if (decision === "returned") return "Returned for revalidation from the approval queue.";
  return "Rejected from the approval queue.";
}

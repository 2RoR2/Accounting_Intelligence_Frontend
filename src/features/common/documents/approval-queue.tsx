"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, RotateCcw, XCircle, ExternalLink } from "lucide-react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments } from "@/lib/api/document.service";
import { decideDocumentReview } from "@/lib/api/workflow.service";
import {
  Badge,
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Panel,
  SearchInput,
  Toast,
  formatDate,
  money,
} from "@/components/common/ui";

export function ApprovalQueuePage({ user }: { user: User }) {
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const { data, error, loading, refresh } = useResource(
    () => getDocuments(user, { status: "IN_REVIEW" }),
    `approval-queue:${user.id}`,
  );

  async function decide(documentId: string, decision: "approved" | "rejected" | "returned", revision: number) {
    setBusyId(documentId);
    setMessage("");
    try {
      await decideDocumentReview(documentId, decision, note.trim() || defaultNote(decision), revision);
      setMessage(decision === "approved" ? "Document approved." : decision === "returned" ? "Document returned for revalidation." : "Document rejected.");
      setNote("");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Decision failed. Refresh and try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const rows = data.filter((doc) =>
    `${doc.code ?? ""} ${doc.name} ${doc.supplier ?? ""} ${doc.customer ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="approval-queue-page">
      <PageHeader
        eyebrow="REVIEW"
        title="Approval queue"
        description="Documents submitted after revalidation. Approve, return, or reject without opening each record."
      />
      {message && <Toast message={message} />}
      <Panel title="Waiting for approval" subtitle={`${rows.length} document${rows.length === 1 ? "" : "s"} in review`}>
        <div className="filter-bar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search code, name, supplier, or customer…" />
        </div>
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <Field label="Decision note · Optional (applied to the next action)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a short note for the audit trail…"
              rows={2}
            />
          </Field>
        </div>
        {rows.length === 0 ? (
          <div className="panel-body">
            <p>No documents are waiting for approval.</p>
          </div>
        ) : (
          <DataTable
            rows={rows}
            rowKey={(doc) => doc.id}
            columns={[
              {
                label: "Document",
                render: (doc) => (
                  <div>
                    <strong>{doc.code || doc.name}</strong>
                    <small>{doc.name}</small>
                  </div>
                ),
              },
              { label: "Kind", render: (doc) => <Badge>{(doc.kind || doc.type || "DOCUMENT").replaceAll("_", " ")}</Badge> },
              { label: "Party", render: (doc) => doc.supplier || doc.customer || "—" },
              { label: "Amount", render: (doc) => (doc.totalAmount != null ? money(doc.totalAmount) : "—") },
              { label: "Submitted", render: (doc) => formatDate(doc.createdAt) },
              {
                label: "Actions",
                render: (doc) => {
                  const revision = doc.contentRevision ?? 1;
                  const busy = busyId === doc.id;
                  return (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={busy || !revision}
                        onClick={() => decide(doc.id, "approved", revision)}
                      >
                        <CheckCircle2 size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy}
                        onClick={() => decide(doc.id, "returned", revision)}
                      >
                        <RotateCcw size={14} /> Return
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        disabled={busy}
                        onClick={() => decide(doc.id, "rejected", revision)}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                      <Link className="btn small" href={`/company/documents/${doc.id}`} title="Open full review">
                        <ExternalLink size={14} /> Open
                      </Link>
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

function defaultNote(decision: "approved" | "rejected" | "returned") {
  if (decision === "approved") return "Approved from the approval queue.";
  if (decision === "returned") return "Returned for revalidation from the approval queue.";
  return "Rejected from the approval queue.";
}

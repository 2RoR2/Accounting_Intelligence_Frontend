"use client";
import Link from "next/link";
import { useState } from "react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  assignException,
  getDocuments,
  getExceptions,
  resolveExceptionDirect,
} from "@/lib/api/document.service";
import { getTenantUsers } from "@/lib/api/user.service";
import {
  Badge,
  DataTable,
  ErrorState,
  Field,
  Filter,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  Toast,
  formatDate,
} from "@/components/common/ui";
export function ExceptionsPage({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const { data, error, loading, refresh } = useResource(
    async () => ({
      exceptions: await getExceptions(user),
      docs: await getDocuments(user),
      users: user.role === "LOCAL_ADMIN" ? await getTenantUsers(user) : [user],
    }),
    user.id,
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [type, setType] = useState("");
  const [assigned, setAssigned] = useState("");
  const [date, setDate] = useState("");
  const [assign, setAssign] = useState("");
  const [target, setTarget] = useState("");
  const [resolveTarget, setResolveTarget] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [failure, setFailure] = useState("");
  const [toast, setToast] = useState("");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        eyebrow="REVIEW WORKSPACE"
        title="Exceptions"
        description="A focused queue for documents that need a human decision."
      />
      <Panel>
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search document…"
          />
          <Filter
            label="Statuses"
            value={status}
            onChange={setStatus}
            options={["OPEN", "ASSIGNED", "IN_REVIEW", "RESOLVED"]}
          />
          <Filter
            label="Severities"
            value={severity}
            onChange={setSeverity}
            options={["LOW", "MEDIUM", "HIGH"]}
          />
          <Filter
            label="Types"
            value={type}
            onChange={setType}
            options={Array.from(new Set(data.exceptions.map((e) => e.type)))}
          />
          <select
            aria-label="Assigned user"
            value={assigned}
            onChange={(e) => setAssigned(e.target.value)}
          >
            <option value="">All assigned users</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Exception date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {data.exceptions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "#475569" }}>
            <p style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
              All clear — zero open exceptions across your documents.
            </p>
            <small style={{ color: "#64748b" }}>
              Uploaded documents meeting all accounting validation rules proceed directly to approval.
            </small>
          </div>
        ) : (
          <DataTable
            rows={data.exceptions.filter(
              (e) =>
                (!status || e.status === status) &&
                (!severity || e.severity === severity) &&
                (!type || e.type === type) &&
                (!assigned || e.assignedTo === assigned) &&
                (!date || e.createdAt.startsWith(date)) &&
                (data.docs.find((d) => d.id === e.documentId)?.name ?? "")
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )}
            rowKey={(e) => e.id}
            columns={[
              {
                label: "Document",
                render: (e) => (
                  <Link
                    className="document-link"
                    href={`${base}/documents/${e.documentId}`}
                  >
                    {e.originalFilename ||
                      data.docs.find((d) => d.id === e.documentId)?.name ||
                      e.documentCode ||
                      e.documentId}
                  </Link>
                ),
              },
              {
                label: "Exception type",
                render: (e) => (
                  <div>
                    <strong>{e.type.replaceAll("_", " ")}</strong>
                    <small
                      style={{
                        display: "block",
                        color: "#64748b",
                        marginTop: "2px",
                      }}
                    >
                      {e.message}
                    </small>
                    {e.note && (
                      <small
                        style={{
                          display: "block",
                          color: "#059669",
                          marginTop: "2px",
                          fontStyle: "italic",
                        }}
                      >
                        Note: {e.note}
                      </small>
                    )}
                  </div>
                ),
              },
              { label: "Severity", render: (e) => <Badge>{e.severity}</Badge> },
              {
                label: "Assigned to",
                render: (e) =>
                  e.assignedToName ??
                  data.users.find((u) => u.id === e.assignedTo)?.name ??
                  e.assignedTo ??
                  "Unassigned",
              },
              { label: "Created", render: (e) => formatDate(e.createdAt) },
              { label: "Status", render: (e) => <Badge>{e.status}</Badge> },
              {
                label: "Action",
                render: (e) => (
                  <div className="row-actions">
                    <Link
                      className="text-link"
                      href={`${base}/documents/${e.documentId}`}
                    >
                      Review
                    </Link>
                    {user.role === "LOCAL_ADMIN" && e.status !== "RESOLVED" && (
                      <button
                        className="text-link"
                        onClick={() => {
                          setAssign(e.id);
                          setTarget(e.assignedTo || data.users[0]?.id || "");
                          setFailure("");
                        }}
                      >
                        Assign
                      </button>
                    )}
                    {(user.role === "LOCAL_ADMIN" ||
                      user.role === "ACCOUNTANT") &&
                      e.status !== "RESOLVED" && (
                        <button
                          className="text-link"
                          onClick={() => {
                            setResolveTarget(e.id);
                            setResolveNote("");
                            setFailure("");
                          }}
                        >
                          Resolve
                        </button>
                      )}
                  </div>
                ),
              },
            ]}
          />
        )}

      </Panel>
      {assign && (
        <Modal title="Assign exception" onClose={() => setAssign("")}>
          <div className="panel-body">
            {failure && <ErrorState message={failure} />}
            <Field label="Assign to">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {data.users
                  .filter((u) => u.status === "ACTIVE")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await assignException(user, assign, target);
                  setAssign("");
                  setToast("Exception assigned.");
                  refresh();
                } catch (e) {
                  setFailure((e as Error).message);
                }
              }}
            >
              Save assignment
            </button>
          </div>
        </Modal>
      )}
      {resolveTarget && (
        <Modal
          title="Resolve exception"
          onClose={() => setResolveTarget("")}
        >
          <div className="panel-body">
            {failure && <ErrorState message={failure} />}
            <p
              style={{
                fontSize: "13px",
                color: "#64748b",
                marginBottom: "12px",
              }}
            >
              Resolving an exception marks this issue as handled. Note: The
              document must still be verified and revalidated before accounting
              approval.
            </p>
            <Field label="Resolution note *">
              <input
                type="text"
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="e.g. Verified valid contract renewal / duplicate confirmed"
                required
              />
            </Field>
            <button
              className="btn primary"
              disabled={!resolveNote.trim()}
              onClick={async () => {
                try {
                  await resolveExceptionDirect(
                    user,
                    resolveTarget,
                    resolveNote,
                  );
                  setResolveTarget("");
                  setResolveNote("");
                  setToast("Exception marked as resolved.");
                  refresh();
                } catch (e) {
                  setFailure((e as Error).message);
                }
              }}
            >
              Confirm resolution
            </button>
          </div>
        </Modal>
      )}
      <Toast message={toast} />
    </>
  );
}

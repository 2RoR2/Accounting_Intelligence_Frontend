"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  assignException,
  getDocuments,
  getExceptions,
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
  StatusBadge,
  Toast,
  formatDate,
} from "@/components/common/ui";
import { ruleSentence, ruleTitle, statusLabel } from "@/lib/glossary";
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
  // Opened from Today's "Needs fixing" tile (?show=open): only problems not yet resolved.
  const openOnly = useSearchParams().get("show") === "open";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [type, setType] = useState("");
  const [assigned, setAssigned] = useState("");
  const [date, setDate] = useState("");
  const [assign, setAssign] = useState("");
  const [target, setTarget] = useState("");
  const [failure, setFailure] = useState("");
  const [toast, setToast] = useState("");
  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        title="Needs fixing"
        description="Documents with a problem to fix before they can be approved. Each line says what to do."
      />
      <Panel>
        {openOnly && (
          <p className="today-filter-note" role="status">
            Showing: <strong>problems not yet resolved</strong>. <Link href={`${base}/exceptions`}>Show all, including resolved</Link>
          </p>
        )}
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
            format={statusLabel}
          />
          <Filter
            label="Priorities"
            value={severity}
            onChange={setSeverity}
            options={["LOW", "MEDIUM", "HIGH"]}
          />
          {user.role === "LOCAL_ADMIN" && (
            <>
              <Filter
                label="Problems"
                value={type}
                onChange={setType}
                options={Array.from(new Set(data.exceptions.map((e) => e.type)))}
                format={(code) => ruleTitle(code)}
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
            </>
          )}
          <input
            aria-label="Exception date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DataTable
          rows={data.exceptions.filter(
            (e) =>
              (!status || e.status === status) &&
              (!openOnly || e.status !== "RESOLVED") &&
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
                  {data.docs.find((d) => d.id === e.documentId)?.name}
                </Link>
              ),
            },
            {
              label: "What to do",
              render: (e) => (
                <div>
                  <strong>{ruleSentence(e.type)}</strong>
                  <small>{e.message}</small>
                </div>
              ),
            },
            { label: "Severity", render: (e) => <Badge>{e.severity}</Badge> },
            {
              label: "Assigned to",
              render: (e) =>
                data.users.find((u) => u.id === e.assignedTo)?.name ??
                e.assignedTo,
            },
            { label: "Created", render: (e) => formatDate(e.createdAt) },
            { label: "Status", render: (e) => <StatusBadge status={e.status} /> },
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
                        setTarget(e.assignedTo);
                        setFailure("");
                      }}
                    >
                      Assign
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Panel>
      {assign && (
        <Modal title="Assign to a colleague" onClose={() => setAssign("")}>
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
                  setToast("Assigned.");
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
      <Toast message={toast} />
    </>
  );
}

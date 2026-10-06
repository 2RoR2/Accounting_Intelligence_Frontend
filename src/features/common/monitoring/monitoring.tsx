"use client";
import { useState } from "react";
import { Activity, Download, ScanLine } from "lucide-react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  getPerformanceMetrics,
  getProcessingJobs,
} from "@/lib/api/processing.service";
import { getDocuments } from "@/lib/api/document.service";
import { getTenants } from "@/lib/api/tenant.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import { downloadCsv } from "@/lib/api/record.service";
import {
  Badge,
  DataTable,
  ErrorState,
  Filter,
  LoadingState,
  PageHeader,
  Panel,
  SearchInput,
  StatCard,
  formatDate,
} from "@/components/common/ui";
import { PerformanceCards, TrendChart } from "@/components/common/dashboard/charts";
export function ProcessingPage({
  user,
  tenantId,
}: {
  user: User;
  tenantId?: string;
}) {
  const { data, error, loading, refresh } = useResource(
    async () => ({
      jobs: await getProcessingJobs(user),
      tenants: await getTenants(user),
      docs: await getDocuments(user),
    }),
    user.id,
  );
  const [tenant, setTenant] = useState(tenantId ?? "");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const jobs = data.jobs.filter(
    (j) =>
      (!tenant || j.tenantId === tenant) &&
      (!status || j.status === status) &&
      (!date || j.startedAt.startsWith(date)),
  );
  return (
    <>
      <PageHeader
        eyebrow="PLATFORM MONITORING"
        title="AI processing"
        description="Monitor job health and processing metadata across the platform."
        actions={<Badge>MONITORING ONLY</Badge>}
      />
      <div className="service-status">
        <span>
          <ScanLine size={18} />
          <strong>AI service</strong>
          <Badge>SIMULATED</Badge>
        </span>
        <span>
          <Activity size={18} />
          <strong>Queue status</strong>
          <Badge>HEALTHY</Badge>
        </span>
      </div>
      <div className="stats-grid">
        {["QUEUED", "PROCESSING", "COMPLETED", "FAILED"].map((s) => (
          <StatCard
            key={s}
            label={s.charAt(0) + s.slice(1).toLowerCase()}
            value={jobs.filter((j) => j.status === s).length}
          />
        ))}
      </div>
      <Panel title="Processing jobs">
        <div className="filter-bar">
          {!tenantId && (
            <select
              aria-label="Tenant"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
            >
              <option value="">All tenants</option>
              {data.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <Filter
            label="Statuses"
            value={status}
            onChange={setStatus}
            options={Array.from(new Set(data.jobs.map((j) => j.status)))}
          />
          <input
            aria-label="Processing date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DataTable
          rows={jobs}
          rowKey={(j) => j.id}
          columns={[
            { label: "Job ID", render: (j) => <strong>{j.id}</strong> },
            {
              label: "Tenant",
              render: (j) =>
                data.tenants.find((t) => t.id === j.tenantId)?.name,
            },
            {
              label: "Document",
              render: (j) => data.docs.find((d) => d.id === j.documentId)?.name,
            },
            { label: "Status", render: (j) => <Badge>{j.status}</Badge> },
            {
              label: "Time",
              render: (j) => (j.status === "FAILED" ? "—" : `${j.seconds} sec`),
            },
            { label: "Started", render: (j) => formatDate(j.startedAt) },
            { label: "Completed", render: (j) => formatDate(j.completedAt) },
          ]}
        />
      </Panel>
    </>
  );
}
export function PerformancePage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(
    async () => ({
      metrics: await getPerformanceMetrics(user),
      tenants: await getTenants(user),
      docs: await getDocuments(user),
    }),
    user.id,
  );
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        eyebrow="INSIGHTS & REPORTING"
        title={
          user.role === "SUPER_ADMIN"
            ? "Platform performance"
            : "Company reports"
        }
        description="Project success criteria and processing trends. Benchmark values reflect current workspace performance."
        actions={
          <button
            className="btn"
            onClick={() =>
              downloadCsv("performance-report.csv", [
                [
                  "Report section",
                  "Metric",
                  "Value",
                  "Target",
                  "Met",
                  "Period",
                ],
                ...data.metrics.map((m) => [
                  "Performance",
                  m.label,
                  m.value,
                  m.target,
                  String(m.met),
                  "Current period",
                ]),
                ...data.tenants.map((tenant) => [
                  "Tenant volume",
                  tenant.name,
                  String(
                    data.docs.filter((doc) => doc.tenantId === tenant.id)
                      .length,
                  ),
                  "Tracked documents",
                  "Yes",
                  "Current period",
                ]),
                ...data.docs.map((doc) => [
                  "Document detail",
                  doc.name,
                  doc.status,
                  `${doc.seconds} sec processing`,
                  doc.status === "COMPLETED" ? "Yes" : "Review",
                  formatDate(doc.createdAt),
                ]),
              ])
            }
          >
            <Download size={16} /> Export report
          </button>
        }
      />
      <PerformanceCards metrics={data.metrics} />
      <div className="two-col">
        <TrendChart />
        <TrendChart kind="accuracy" />
        <TrendChart kind="exceptions" />
        <Panel
          title="Documents processed by tenant"
          subtitle="Live counts in the current workspace"
        >
          <div className="panel-body tenant-bars">
            {data.tenants.map((t) => {
              const count = data.docs.filter((d) => d.tenantId === t.id).length;
              return (
                <div key={t.id}>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{count} documents</span>
                  </div>
                  <div className="progress-track">
                    <div
                      style={{
                        width: `${data.docs.length ? (count / data.docs.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}
export function AuditPage({
  user,
  tenantId,
}: {
  user: User;
  tenantId?: string;
}) {
  const { data, error, loading, refresh } = useResource(
    () => getAuditLogs(user),
    user.id,
  );
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        eyebrow="GOVERNANCE"
        title="Audit logs"
        description="Trace decisions, corrections, and administrative changes."
      />
      <Panel>
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search user, action, or resource…"
          />
          <Filter
            label="Actions"
            value={action}
            onChange={setAction}
            options={Array.from(new Set(data.map((a) => a.action)))}
          />
        </div>
        <DataTable
          rows={data.filter(
            (a) =>
              (!tenantId || a.tenantId === tenantId) &&
              (!action || a.action === action) &&
              `${a.user} ${a.action} ${a.resource}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )}
          rowKey={(a) => a.id}
          columns={[
            {
              label: "Timestamp",
              render: (a) => (
                <div>
                  {formatDate(a.timestamp)}
                  <small>
                    {new Date(a.timestamp).toLocaleTimeString("en-MY", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              ),
            },
            {
              label: "User",
              render: (a) => <strong>{a.user}</strong>,
            },
            {
              label: "Role",
              render: (a) => (
                <span className="audit-role">
                  {a.role.replaceAll("_", " ")}
                </span>
              ),
            },
            {
              label: "Action",
              render: (a) => (
                <span className="audit-action">
                  {a.action.replaceAll("_", " ")}
                </span>
              ),
            },
            { label: "Resource", render: (a) => a.resource },
            {
              label: "Details",
              render: (a) =>
                user.role === "SUPER_ADMIN" &&
                a.action === "EXTRACTION_CORRECTED"
                  ? "Extraction field corrected; details available through authorised support."
                  : a.details,
            },
          ]}
        />
      </Panel>
    </>
  );
}

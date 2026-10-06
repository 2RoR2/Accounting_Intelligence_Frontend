"use client";
import Link from "next/link";
import { useEffect } from "react";
import {
  Building2,
  Users,
  Files,
  ClipboardCheck,
  ArrowRight,
  Download,
  Plus,
  CheckCircle2,
  Clock3,
  CircleAlert,
  ScanLine,
} from "lucide-react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getTenants, getCompanyRequests } from "@/lib/api/tenant.service";
import { getTenantUsers } from "@/lib/api/user.service";
import { getDocuments, getExceptions } from "@/lib/api/document.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import { getPerformanceMetrics } from "@/lib/api/processing.service";
import { downloadCsv } from "@/lib/api/record.service";
import {
  AccountUsage,
  Badge,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
  formatDate,
} from "@/components/common/ui";
import { PerformanceCards, TrendChart } from "@/components/common/dashboard/charts";
import { AccountantBoard } from "@/features/users/performance-board";
export function Dashboard({ user }: { user: User }) {
  const admin = user.role === "SUPER_ADMIN";
  const local = user.role === "LOCAL_ADMIN";
  const base = admin ? "/admin" : local ? "/company" : "/workspace";
  const { data, error, loading, refresh } = useResource(
    async () => ({
      tenants: await getTenants(user),
      users: admin || local ? await getTenantUsers(user) : [],
      requests: admin ? await getCompanyRequests(user) : [],
      docs: await getDocuments(user),
      exceptions: await getExceptions(user),
      metrics: await getPerformanceMetrics(user),
      audit: await getAuditLogs(user),
    }),
    user.id,
  );
  useEffect(() => {
    if (admin || local) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [admin, local, refresh]);
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const completed = data.docs.filter((d) => d.status === "COMPLETED").length;
  const activeUsers = data.users.filter(
    (u) => u.status === "ACTIVE" || u.status === "INVITED",
  );
  const processing = data.docs.filter((d) =>
    ["QUEUED", "PROCESSING", "UPLOADED"].includes(d.status),
  ).length;
  const open = data.exceptions.filter((e) => e.status !== "RESOLVED").length;
  const queued = data.docs.filter((d) =>
    ["QUEUED", "UPLOADED"].includes(d.status),
  ).length;
  const running = data.docs.filter((d) => d.status === "PROCESSING").length;
  const failed = data.docs.filter((d) => d.status === "FAILED").length;
  const extracted = data.docs.length - queued - running - failed;
  const denominator = data.docs.length || 1;
  const completeEnd = (extracted / denominator) * 100;
  const queueEnd = completeEnd + (queued / denominator) * 100;
  const runningEnd = queueEnd + (running / denominator) * 100;
  const ringStyle = {
    background: data.docs.length
      ? `conic-gradient(#8fb7e6 0% ${completeEnd}%, #c6dbf3 ${completeEnd}% ${queueEnd}%, #dcecff ${queueEnd}% ${runningEnd}%, #b5cfee ${runningEnd}% 100%)`
      : "#eaf5ff",
  };
  const exportReport = () =>
    downloadCsv("workspace-report.csv", [
      ["Metric", "Value"],
      ["Documents", String(data.docs.length)],
      ["Completed", String(completed)],
      ["Exceptions", String(open)],
      ...data.metrics.map((m) => [m.label, m.value]),
    ]);
  return (
    <>
      <PageHeader
        eyebrow={
          admin ? "YOUR PLATFORM, AT A GLANCE" : "YOUR WORKSPACE, AT A GLANCE"
        }
        title={
          admin
            ? "Platform overview"
            : local
              ? "Company overview"
              : `Welcome back, ${user.name.split(" ")[0]}`
        }
        description={
          admin
            ? "Monitor tenants, access requests, and AI processing health across the platform."
            : local
              ? "Track document intake, exceptions, and standardised records for your company."
              : "Continue processing documents and resolve exceptions with full audit clarity."
        }
        actions={
          <>
            <button className="btn" onClick={exportReport}>
              <Download size={15} /> Export report
            </button>
            {!admin && (
              <Link className="btn primary" href={`${base}/upload`}>
                <Plus size={16} /> Upload document
              </Link>
            )}
          </>
        }
      />
      <div className="date-line">
        <span className="pulse-dot" />
        Your workspace <span>·</span>{" "}
        {new Intl.DateTimeFormat("en-MY", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date())}{" "}
        <span className="date-right">Accounting Intelligence · MYR</span>
      </div>
      {(admin
        ? data.requests.some((r) => r.status === "PENDING")
        : open > 0) && (
        <Link
          className="attention-banner"
          href={`${base}/${admin ? "approvals" : "exceptions"}`}
        >
          <span className="attention-icon">
            <ClipboardCheck size={20} />
          </span>
          <div>
            <strong>
              {admin
                ? `${data.requests.filter((r) => r.status === "PENDING").length} companies are waiting for approval`
                : `${open} exceptions need your attention`}
            </strong>
            <p>
              {admin
                ? "Review access requests and help new teams get started."
                : "Review flagged fields to keep your accounting records moving."}
            </p>
          </div>
          <span className="attention-action">
            {admin ? "Review requests" : "Open review queue"}{" "}
            <ArrowRight size={16} />
          </span>
        </Link>
      )}
      {!admin && !local ? (
        <AccountantBoard
          docs={data.docs}
          openExceptions={open}
          completed={completed}
          processing={processing}
        />
      ) : (
        <>
      <div className="stats-grid">
        {admin ? (
          <>
            <StatCard
              label="Active tenants"
              value={data.tenants.filter((t) => t.status === "ACTIVE").length}
              icon={<Building2 size={17} />}
            />
            <StatCard
              label="Pending requests"
              value={data.requests.filter((r) => r.status === "PENDING").length}
              icon={<ClipboardCheck size={17} />}
              detail="awaiting your review"
            />
            <StatCard
              label="Total users"
              value={data.users.length}
              icon={<Users size={17} />}
            />
            <StatCard
              label="Documents processed"
              value={data.docs.length}
              icon={<Files size={17} />}
            />
          </>
        ) : (
          <>
            <StatCard
              label={local ? "Documents processed" : "My uploads"}
              value={data.docs.length}
              icon={<Files size={17} />}
            />
            <StatCard
              label={local ? "Pending review" : "Processing"}
              value={
                local
                  ? data.docs.filter((d) =>
                      ["EXCEPTION", "IN_REVIEW", "CORRECTED"].includes(
                        d.status,
                      ),
                    ).length
                  : processing
              }
              icon={<Clock3 size={17} />}
            />
            <StatCard
              label={local ? "Open exceptions" : "Needs review"}
              value={open}
              icon={<CircleAlert size={17} />}
            />
            <StatCard
              label="Completed"
              value={completed}
              icon={<CheckCircle2 size={17} />}
            />
          </>
        )}
      </div>
      <div className="section-heading">
        <h2>
          Performance at a glance{" "}
          <span className="subtle-tag">Reference benchmarks</span>
        </h2>
        <Link
          href={`${base}/${admin ? "performance" : local ? "reports" : "records"}`}
        >
          View {admin || local ? "performance" : "records"}{" "}
          <ArrowRight size={14} />
        </Link>
      </div>
      <PerformanceCards metrics={data.metrics} />
      <div className="dashboard-middle">
        <TrendChart />
        <Panel
          title="AI processing status"
          subtitle="Extraction jobs · independent of record validation"
          action={
            <span className="badge green">
              <span className="badge-dot" />
              Processing queue
            </span>
          }
        >
          <div className="processing-total">
            <div className="processing-ring" style={ringStyle}>
              <ScanLine size={25} />
              <strong>{data.docs.length}</strong>
              <small>Total documents</small>
            </div>
          </div>
          <div className="processing-legend">
            {[
              ["Queued", queued, "amber"],
              ["Processing", running, "blue"],
              ["Extracted", extracted, "green"],
              ["Failed", failed, "red"],
            ].map(([label, count, color]) => (
              <div key={label}>
                <span className={`legend-dot ${color}`} />
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
        </>
      )}
      {admin ? (
        <Panel
          title="Tenant activity"
          subtitle="Account usage and document activity across your companies"
          action={
            <Link className="text-link" href="/admin/tenants">
              View all tenants <ArrowRight size={14} />
            </Link>
          }
        >
          <DataTable
            rows={data.tenants}
            rowKey={(t) => t.id}
            columns={[
              {
                label: "Company",
                render: (t) => (
                  <Link
                    className="company-cell"
                    href={`/admin/tenants/${t.id}`}
                  >
                    <span className="company-avatar">{t.name.slice(0, 2)}</span>
                    <span>
                      <strong>{t.name}</strong>
                    </span>
                  </Link>
                ),
              },
              {
                label: "Users / limit",
                render: (t) => (
                  <span>
                    {activeUsers.filter((u) => u.tenantId === t.id).length}{" "}
                    <span className="muted">/ {t.accountLimit}</span>
                  </span>
                ),
              },
              {
                label: "Documents",
                render: (t) =>
                  data.docs.filter((d) => d.tenantId === t.id).length,
              },
              {
                label: "Exceptions",
                render: (t) => (
                  <span className="exception-count">
                    {
                      data.exceptions.filter(
                        (e) => e.tenantId === t.id && e.status !== "RESOLVED",
                      ).length
                    }
                  </span>
                ),
              },
              { label: "Status", render: (t) => <Badge>{t.status}</Badge> },
              {
                label: "",
                render: (t) => (
                  <Link
                    className="icon-btn"
                    aria-label={`View ${t.name}`}
                    href={`/admin/tenants/${t.id}`}
                  >
                    <ArrowRight size={16} />
                  </Link>
                ),
              },
            ]}
          />
        </Panel>
      ) : (
        <div className={local ? "dashboard-middle" : "single-grid"}>
          <Panel
            title="Recent documents"
            action={
              <Link href={`${base}/documents`} className="text-link">
                View all <ArrowRight size={14} />
              </Link>
            }
          >
            <DataTable
              rows={data.docs.slice(0, 5)}
              rowKey={(d) => d.id}
              columns={[
                {
                  label: "Document",
                  render: (d) => (
                    <Link
                      className="document-link"
                      href={`${base}/documents/${d.id}`}
                    >
                      <Files size={16} />
                      {d.name}
                    </Link>
                  ),
                },
                { label: "Uploaded", render: (d) => formatDate(d.createdAt) },
                { label: "Status", render: (d) => <Badge>{d.status}</Badge> },
              ]}
            />
          </Panel>
          {local && (
            <Panel
              title="Your team"
              subtitle="Active accounts and reserved invitations"
            >
              <div className="panel-body">
                <AccountUsage
                  used={activeUsers.length}
                  limit={data.tenants[0]?.accountLimit ?? 1}
                />
                <div className="detail-list">
                  <div>
                    <span>Local administrators</span>
                    <strong>
                      {
                        activeUsers.filter((u) => u.role === "LOCAL_ADMIN")
                          .length
                      }
                    </strong>
                  </div>
                  <div>
                    <span>Active accountants</span>
                    <strong>
                      {
                        activeUsers.filter(
                          (u) =>
                            u.role === "ACCOUNTANT" && u.status === "ACTIVE",
                        ).length
                      }
                    </strong>
                  </div>
                  <div>
                    <span>Pending invitations</span>
                    <strong>
                      {activeUsers.filter((u) => u.status === "INVITED").length}
                    </strong>
                  </div>
                </div>
                <Link className="btn full" href="/company/users">
                  <Plus size={15} /> Invite accountant
                </Link>
              </div>
            </Panel>
          )}
        </div>
      )}
      <Panel
        title={admin ? "Recent platform activity" : "Recent workspace activity"}
        action={
          <Link
            href={admin || local ? `${base}/audit` : `${base}/documents`}
            className="text-link"
          >
            View activity <ArrowRight size={14} />
          </Link>
        }
      >
        <div className="activity-list">
          {data.audit.slice(0, 4).map((a) => (
            <div key={a.id}>
              <span className="activity-icon">
                <CheckCircle2 size={16} />
              </span>
              <div>
                <strong>{a.action.toLowerCase().replaceAll("_", " ")}</strong>
                <p>
                  {a.user} <span>·</span> {a.resource}
                </p>
              </div>
              <time>{formatDate(a.timestamp)}</time>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

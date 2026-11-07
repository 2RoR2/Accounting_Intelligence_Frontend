"use client";
import Link from "next/link";
import { useEffect } from "react";
import {
  Building2,
  Users,
  Files,
  ClipboardCheck,
  ArrowRight,
  Plus,
  Clock3,
  CircleAlert,
  ScanLine,
  Upload,
  FileCheck2,
  AlertCircle,
  ArrowDownToLine,
  Contact,
  Scale,
} from "lucide-react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getTenants, getCompanyRequests } from "@/lib/api/tenant.service";
import { getTenantUsers } from "@/lib/api/user.service";
import { getDocuments, getExceptions } from "@/lib/api/document.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import { getPerformanceMetrics } from "@/lib/api/processing.service";
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
import { AccountantDashboard } from "@/features/users/accountant-dashboard";

export function Dashboard({ user }: { user: User }) {
  const admin = user.role === "SUPER_ADMIN";
  const local = user.role === "LOCAL_ADMIN";
  const accountant = !admin && !local;
  const base = admin ? "/admin" : local ? "/company" : "/workspace";

  const { data, error, loading, refresh } = useResource(
    async () => {
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
      const [docs, tenants, users, requests, exceptions, metrics, audit] = await Promise.all([
        optional(getDocuments(user), []),
        admin ? optional(getTenants(user), []) : Promise.resolve([]),
        admin || local ? optional(getTenantUsers(user), []) : Promise.resolve([]),
        admin ? optional(getCompanyRequests(user), []) : Promise.resolve([]),
        optional(getExceptions(user), []),
        optional(getPerformanceMetrics(user), []),
        optional(getAuditLogs(user), []),
      ]);
      return { tenants, users, requests, docs, exceptions, metrics, audit };
    },
    user.id,
  );

  useEffect(() => {
    if (admin || local) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [admin, local, refresh]);

  if (loading) return <LoadingState variant="dashboard" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const completed = data.docs.filter((d) =>
    ["COMPLETED", "VALIDATED", "STANDARDISED"].includes(d.status),
  ).length;
  const activeUsers = data.users.filter((u) => u.status === "ACTIVE" || u.status === "INVITED");
  const open = data.exceptions.filter((e) => e.status !== "RESOLVED").length;
  const queued = data.docs.filter((d) => ["QUEUED", "UPLOADED"].includes(d.status)).length;
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
  const waitingApproval = data.docs.filter((d) => d.status === "IN_REVIEW").length;
  const firstName = user.name?.split(" ")[0] || "there";

  return (
    <div className="dashboard-page">
      {local ? (
        <PageHeader
          eyebrow="YOUR WORK"
          title={`Welcome back, ${firstName}`}
          description="Approvals, exceptions, and recent company activity that need you."
          actions={
            <Link className="btn primary" href={`${base}/upload`}>
              <Plus size={15} /> Upload documents
            </Link>
          }
        />
      ) : !accountant && (
        <PageHeader
          eyebrow={admin ? "YOUR PLATFORM, AT A GLANCE" : undefined}
          title={admin ? "Platform overview" : "Overview"}
          description={
            admin
              ? "Monitor tenants, access requests, and AI processing health across the platform."
              : "Your documents, reviews, and processing activity in one place."
          }
        />
      )}

      {!accountant && <div className="date-line">
        <span className="pulse-dot" />
        {new Intl.DateTimeFormat("en-MY", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date())}{" "}
      </div>}

      {local && (waitingApproval > 0 || open > 0 || failed > 0) && (
        <Link
          className="attention-banner"
          href={`${base}/${waitingApproval > 0 ? "approvals" : failed > 0 ? "documents?status=FAILED" : "exceptions"}`}
        >
          <span className="attention-icon"><ClipboardCheck size={20} /></span>
          <div>
            <strong>
              {waitingApproval > 0
                ? `${waitingApproval} document${waitingApproval === 1 ? "" : "s"} waiting for your approval`
                : failed > 0
                  ? `${failed} failed job${failed === 1 ? "" : "s"} need attention`
                  : `${open} exception${open === 1 ? "" : "s"} need your attention`}
            </strong>
            <p>
              {waitingApproval > 0
                ? "Open the approval queue and decide without opening each document."
                : failed > 0
                  ? "Review failed jobs or replace the source documents."
                  : "Clear flagged fields so records can move forward."}
            </p>
          </div>
          <span className="attention-action">Open queue <ArrowRight size={16} /></span>
        </Link>
      )}

      {!local && !accountant && (admin ? data.requests.some((r) => r.status === "PENDING") : open > 0 || failed > 0) && (
        <Link
          className="attention-banner"
          href={`${base}/${admin ? "approvals" : failed > 0 ? "documents?status=FAILED" : "exceptions"}`}
        >
          <span className="attention-icon"><ClipboardCheck size={20} /></span>
          <div>
            <strong>
              {admin
                ? `${data.requests.filter((r) => r.status === "PENDING").length} companies are waiting for approval`
                : failed > 0
                  ? `${failed} document${failed === 1 ? "" : "s"} failed and need attention`
                  : `${open} exceptions need your attention`}
            </strong>
            <p>
              {admin
                ? "Review access requests and help new teams get started."
                : failed > 0
                  ? "Review the failed jobs, retry them, or correct the source documents."
                  : "Review flagged fields to keep your accounting records moving."}
            </p>
          </div>
          <span className="attention-action">
            {admin ? "Review requests" : failed > 0 ? "Review failed jobs" : "Open review queue"} <ArrowRight size={16} />
          </span>
        </Link>
      )}

      {accountant ? (
        <AccountantDashboard docs={data.docs} exceptions={open} userName={firstName} />
      ) : (
        <>
          <div className="stats-grid">
            {admin ? (
              <>
                <StatCard label="Active tenants" value={data.tenants.filter((t) => t.status === "ACTIVE").length} icon={<Building2 size={17} />} />
                <StatCard label="Pending requests" value={data.requests.filter((r) => r.status === "PENDING").length} icon={<ClipboardCheck size={17} />} detail="awaiting your review" />
                <StatCard label="Total users" value={data.users.length} icon={<Users size={17} />} />
                <StatCard label="Documents processed" value={data.docs.length} icon={<Files size={17} />} />
              </>
            ) : (
              <>
                <StatCard label="Waiting for you" value={waitingApproval} icon={<ClipboardCheck size={17} />} detail="Ready to approve" />
                <StatCard label="Open exceptions" value={open} icon={<CircleAlert size={17} />} detail="Need a decision" />
                <StatCard label="Failed jobs" value={failed} icon={<AlertCircle size={17} />} detail="Retry or replace" />
                <StatCard label="Recent documents" value={data.docs.length} icon={<Files size={17} />} detail="In this company" />
              </>
            )}
          </div>

          {local && (
            <div className="stats-grid" style={{ marginTop: 12 }}>
              <Link href={`${base}/approvals`} className="stat-card-link"><StatCard label="Approvals" value="Queue" icon={<ClipboardCheck size={17} />} detail="Decide now" /></Link>
              <Link href={`${base}/exceptions`} className="stat-card-link"><StatCard label="Exceptions" value={open} icon={<AlertCircle size={17} />} detail="Review queue" /></Link>
              <Link href={`${base}/contacts`} className="stat-card-link"><StatCard label="Contacts" value="People" icon={<Contact size={17} />} detail="Customers and suppliers" /></Link>
              <Link href={`${base}/reconciliation`} className="stat-card-link"><StatCard label="Reconciliation" value="Match" icon={<Scale size={17} />} detail="Money to records" /></Link>
              <Link href={`${base}/upload`} className="stat-card-link"><StatCard label="Upload" value="New" icon={<Upload size={17} />} detail="Add documents" /></Link>
              <Link href={`${base}/money-in`} className="stat-card-link"><StatCard label="Money In" value="View" icon={<ArrowDownToLine size={17} />} detail="Receipts" /></Link>
            </div>
          )}

          {!local && (
            <>
              <div className="section-heading">
                <h2>Performance at a glance <span className="subtle-tag">Reference benchmarks</span></h2>
                <Link href={`${base}/${admin ? "performance" : "records"}`}>View performance <ArrowRight size={14} /></Link>
              </div>
              <PerformanceCards metrics={data.metrics} />
              <div className="dashboard-middle">
                <TrendChart />
                <Panel title="AI processing status" subtitle="Extraction jobs · independent of record validation" action={<span className="badge green"><span className="badge-dot" />Processing queue</span>}>
                  <div className="processing-total">
                    <div className="processing-ring" style={ringStyle}><ScanLine size={25} /><strong>{data.docs.length}</strong><small>Total documents</small></div>
                  </div>
                  <div className="processing-legend">
                    {[["Queued", queued, "amber"], ["Processing", running, "blue"], ["Extracted", extracted, "green"], ["Failed", failed, "red"]].map(([label, count, color]) => (
                      <div key={String(label)}><span className={`legend-dot ${color}`} /><span>{label}</span><strong>{count}</strong></div>
                    ))}
                  </div>
                </Panel>
              </div>
            </>
          )}
        </>
      )}

      {admin ? (
        <Panel title="Tenant activity" subtitle="Account usage and document activity across your companies" action={<Link className="text-link" href="/admin/tenants">View all tenants <ArrowRight size={14} /></Link>}>
          <DataTable
            rows={data.tenants}
            rowKey={(t) => t.id}
            columns={[
              { label: "Company", render: (t) => <Link className="company-cell" href={`/admin/tenants/${t.id}`}><span className="company-avatar">{t.name.slice(0, 2)}</span><span><strong>{t.name}</strong></span></Link> },
              { label: "Users / limit", render: (t) => <span>{activeUsers.filter((u) => u.tenantId === t.id).length} <span className="muted">/ {t.accountLimit}</span></span> },
              { label: "Documents", render: (t) => data.docs.filter((d) => d.tenantId === t.id).length },
              { label: "Exceptions", render: (t) => <span className="exception-count">{data.exceptions.filter((e) => e.tenantId === t.id && e.status !== "RESOLVED").length}</span> },
              { label: "Status", render: (t) => <Badge>{t.status}</Badge> },
              { label: "", render: (t) => <Link className="icon-btn" aria-label={`View ${t.name}`} href={`/admin/tenants/${t.id}`}><ArrowRight size={16} /></Link> },
            ]}
          />
        </Panel>
      ) : local ? (
        <div className="dashboard-middle">
          <Panel title="Recent documents" subtitle="Latest intake in this company" action={<Link href={`${base}/documents`} className="text-link">View all <ArrowRight size={14} /></Link>}>
            <DataTable
              rows={data.docs.slice(0, 6)}
              rowKey={(d) => d.id}
              columns={[
                { label: "Document", render: (d) => <Link className="document-link" href={`${base}/documents/${d.id}`}><Files size={16} />{d.name}</Link> },
                { label: "Uploaded", render: (d) => formatDate(d.createdAt) },
                { label: "Status", render: (d) => <Badge>{d.status}</Badge> },
              ]}
            />
          </Panel>
          <Panel title="Your team" subtitle="Active accounts and reserved invitations">
            <div className="panel-body">
              <AccountUsage used={activeUsers.length} limit={data.tenants[0]?.accountLimit ?? 25} />
              <div className="detail-list">
                <div><span>Local administrators</span><strong>{activeUsers.filter((u) => u.role === "LOCAL_ADMIN").length}</strong></div>
                <div><span>Active accountants</span><strong>{activeUsers.filter((u) => u.role === "ACCOUNTANT" && u.status === "ACTIVE").length}</strong></div>
                <div><span>Pending invitations</span><strong>{activeUsers.filter((u) => u.status === "INVITED").length}</strong></div>
              </div>
              <Link className="btn full" href="/company/users"><Plus size={15} /> Invite accountant</Link>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

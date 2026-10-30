"use client";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments, getExceptions } from "@/lib/api/document.service";
import { getStandardisedRecords } from "@/lib/api/record.service";
import type { User } from "@/types";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/common/ui";
import { CircleAlert, FileCheck2, Files, Timer } from "lucide-react";

export function AccountingReportsPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(
    async () => {
      const [docs, exceptions, records] = await Promise.all([
        getDocuments(user),
        getExceptions(user),
        getStandardisedRecords(user),
      ]);
      return { docs, exceptions, records };
    },
    user.id,
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const total = data.docs.length;
  const completed = data.docs.filter((d) =>
    ["COMPLETED", "VALIDATED", "STANDARDISED"].includes(d.status),
  ).length;
  const open = data.exceptions.filter((e) => e.status !== "RESOLVED").length;
  const failed = data.docs.filter((d) => d.status === "FAILED").length;
  const exceptionRate = total ? Math.round((open / total) * 100) : 0;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  const ar = data.records.filter((r) => r.category === "ACCOUNTS_RECEIVABLE");
  const ap = data.records.filter((r) => r.category === "ACCOUNTS_PAYABLE");
  const sum = (rows: typeof data.records) =>
    rows.reduce((acc, r) => acc + Number(r.extraction.fields.total?.value || 0), 0);
  const fmt = (n: number) =>
    n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const byStatus = [
    ["Uploaded / queued", data.docs.filter((d) => ["UPLOADED", "QUEUED"].includes(d.status)).length],
    ["Processing", data.docs.filter((d) => d.status === "PROCESSING").length],
    ["Extracted / in review", data.docs.filter((d) => ["EXTRACTED", "IN_REVIEW", "CORRECTED", "EXCEPTION"].includes(d.status)).length],
    ["Standardised", completed],
    ["Failed", failed],
  ] as const;

  return (
    <div className="dashboard-page reports-page">
      <PageHeader
        title="Summary"
        description="Processing totals only. Use Documents, Exceptions, or Standardised Records for detail and export."
      />

      <div className="stats-grid">
        <StatCard label="Documents" value={total} icon={<Files size={17} />} detail="All uploads" />
        <StatCard label="Standardised" value={completed} icon={<FileCheck2 size={17} />} detail={`${completionRate}% completed`} />
        <StatCard label="Open exceptions" value={open} icon={<CircleAlert size={17} />} detail={`${exceptionRate}% exception rate`} />
        <StatCard label="Failed" value={failed} icon={<Timer size={17} />} detail="Need retry" />
      </div>

      <div className="dashboard-middle">
        <Panel title="Status breakdown" subtitle="Counts only — open Documents for the list">
          <div className="statement">
            {byStatus.map(([label, count]) => (
              <div className="statement-row" key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Standardised totals" subtitle="Amounts from completed records only">
          <div className="statement">
            <div className="statement-row">
              <span>Accounts Receivable</span>
              <strong>{fmt(sum(ar))}</strong>
            </div>
            <div className="statement-row">
              <span>Accounts Payable</span>
              <strong>{fmt(sum(ap))}</strong>
            </div>
            <div className="statement-row strong">
              <span>Records</span>
              <strong>{data.records.length}</strong>
            </div>
          </div>
          <p className="empty-state">Export the full list from Standardised Records.</p>
        </Panel>
      </div>
    </div>
  );
}

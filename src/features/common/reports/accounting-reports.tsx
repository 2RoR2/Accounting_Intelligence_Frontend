"use client";
import { useMemo } from "react";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments, getExceptions } from "@/lib/api/document.service";
import { getStandardisedRecords, downloadCsv } from "@/lib/api/record.service";
import { getPerformanceMetrics } from "@/lib/api/processing.service";
import type { User } from "@/types";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/common/ui";
import {
  CircleAlert,
  FileCheck2,
  Files,
  Timer,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";

type SummaryRow = [string, string];

const SUCCESS = {
  accuracy: 95,
  exceptionRate: 10,
  seconds: 20,
  effortReduction: 70,
};

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number) {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function met(ok: boolean) {
  return ok ? "Met" : "Not met";
}

function downloadExcel(filename: string, rows: SummaryRow[]) {
  const cells = rows
    .map(
      (row) =>
        `<Row>${row
          .map(
            (value) =>
              `<Cell><Data ss:Type="${/^-?\\d+(\\.\\d+)?$/.test(value) ? "Number" : "String"}">${value
                .replaceAll("&", "&")
                .replaceAll("<", "<")
                .replaceAll(">", ">")}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Processing Summary">
  <Table>${cells}</Table>
 </Worksheet>
</Workbook>`;
  const url = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPdf(title: string, rows: SummaryRow[]) {
  const body = rows
    .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`)
    .join("");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #2a3a4a; padding: 28px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p { margin: 0 0 18px; color: #5e7384; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6eef5; }
    th { background: #2a3a4a; color: #f6f1e8; }
    tr:nth-child(even) td { background: #f6f1e8; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Accounting Intelligence · Processing Summary · ${new Date().toLocaleString("en-MY")}</p>
  <table>
    <thead><tr><th>Item</th><th>Value</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export function AccountingReportsPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(
    async () => {
      const [docs, exceptions, records, metrics] = await Promise.all([
        getDocuments(user),
        getExceptions(user),
        getStandardisedRecords(user),
        getPerformanceMetrics(user).catch(() => []),
      ]);
      return { docs, exceptions, records, metrics };
    },
    user.id,
  );

  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.docs.length;
    const completed = data.docs.filter((d) =>
      ["COMPLETED", "VALIDATED", "STANDARDISED"].includes(d.status),
    ).length;
    const open = data.exceptions.filter((e) => e.status !== "RESOLVED").length;
    const failed = data.docs.filter((d) => d.status === "FAILED").length;
    const exceptionRate = total ? Math.round((open / total) * 100) : 0;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const avgSeconds = total
      ? Math.round(
          data.docs.reduce((sum, doc) => sum + asNumber((doc as { seconds?: number }).seconds), 0) /
            total,
        )
      : 0;

    const ar = data.records.filter((r) => r.category === "ACCOUNTS_RECEIVABLE");
    const ap = data.records.filter((r) => r.category === "ACCOUNTS_PAYABLE");
    const sum = (rows: typeof data.records) =>
      rows.reduce((acc, r) => acc + asNumber(r.extraction.fields.total?.value), 0);

    const byStatus: SummaryRow[] = [
      ["Uploaded / queued", String(data.docs.filter((d) => ["UPLOADED", "QUEUED"].includes(d.status)).length)],
      ["Processing", String(data.docs.filter((d) => d.status === "PROCESSING").length)],
      [
        "Extracted / in review",
        String(
          data.docs.filter((d) =>
            ["EXTRACTED", "IN_REVIEW", "CORRECTED", "EXCEPTION"].includes(d.status),
          ).length,
        ),
      ],
      ["Standardised", String(completed)],
      ["Failed", String(failed)],
    ];

    const criteria: SummaryRow[] = [
      ["Field extraction accuracy target", `≥ ${SUCCESS.accuracy}%`],
      ["Exception rate", `${exceptionRate}% (target < ${SUCCESS.exceptionRate}%)`],
      ["Exception rate status", met(exceptionRate < SUCCESS.exceptionRate)],
      ["Average processing time", avgSeconds ? `${avgSeconds}s (target ≤ ${SUCCESS.seconds}s)` : "Not available"],
      ["Processing time status", met(avgSeconds > 0 && avgSeconds <= SUCCESS.seconds)],
      ["Manual effort reduction target", `≥ ${SUCCESS.effortReduction}%`],
    ];

    const rows: SummaryRow[] = [
      ["Documents", String(total)],
      ["Standardised", `${completed} (${completionRate}%)`],
      ["Open exceptions", `${open} (${exceptionRate}%)`],
      ["Failed", String(failed)],
      ...byStatus,
      ["Accounts Receivable", fmt(sum(ar))],
      ["Accounts Payable", fmt(sum(ap))],
      ["Standardised records", String(data.records.length)],
      ...criteria,
      ...data.metrics.map((m) => [m.label, `${m.value} (target ${m.target})`] as SummaryRow),
    ];

    return {
      total,
      completed,
      open,
      failed,
      exceptionRate,
      completionRate,
      avgSeconds,
      arTotal: sum(ar),
      apTotal: sum(ap),
      recordCount: data.records.length,
      byStatus,
      criteria,
      rows,
    };
  }, [data]);

  if (loading) return <LoadingState />;
  if (error || !data || !summary) return <ErrorState message={error} retry={refresh} />;

  const exportName = "processing-summary";
  const exportCsv = () => downloadCsv(`${exportName}.csv`, [["Item", "Value"], ...summary.rows]);
  const exportExcel = () => downloadExcel(`${exportName}.xls`, [["Item", "Value"], ...summary.rows]);
  const exportPdf = () => downloadPdf("Processing Summary", summary.rows);

  return (
    <div className="dashboard-page reports-page">
      <PageHeader
        eyebrow="WORKSPACE SUMMARY"
        title="Processing Summary"
        description="Overall totals, status breakdown, and performance against the success criteria. Use Documents, Exceptions, or Standardised Records for detail."
        actions={
          <>
            <button className="btn" onClick={exportCsv}>
              <Download size={15} /> CSV
            </button>
            <button className="btn" onClick={exportExcel}>
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button className="btn" onClick={exportPdf}>
              <FileText size={15} /> PDF
            </button>
          </>
        }
      />

      <div className="stats-grid pipeline-health-grid">
        <StatCard variant="solid" label="Documents" value={summary.total} icon={<Files size={17} />} detail="All uploads" />
        <StatCard
          variant="solid"
          label="Standardised"
          value={summary.completed}
          icon={<FileCheck2 size={17} />}
          detail={`${summary.completionRate}% completed`}
        />
        <StatCard
          variant="solid"
          label="Open exceptions"
          value={summary.open}
          icon={<CircleAlert size={17} />}
          detail={`${summary.exceptionRate}% exception rate`}
        />
        <StatCard variant="solid" label="Failed" value={summary.failed} icon={<Timer size={17} />} detail="Need retry" />
      </div>

      <div className="dashboard-middle">
        <Panel title="Status breakdown" subtitle="Counts only — open Documents for the list">
          <div className="statement">
            {summary.byStatus.map(([label, count]) => (
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
              <strong>{fmt(summary.arTotal)}</strong>
            </div>
            <div className="statement-row">
              <span>Accounts Payable</span>
              <strong>{fmt(summary.apTotal)}</strong>
            </div>
            <div className="statement-row strong">
              <span>Records</span>
              <strong>{summary.recordCount}</strong>
            </div>
          </div>
          <div className="panel-body">
            <p className="empty-state">Export the full list from Standardised Records.</p>
          </div>
        </Panel>
      </div>

      <Panel title="Success criteria" subtitle="Targets from the project brief — current workspace figures">
        <div className="statement">
          {summary.criteria.map(([label, value]) => (
            <div className="statement-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

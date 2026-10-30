"use client";
import Link from "next/link";
import {
  ArrowRight,
  Files,
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Upload,
  FileCheck2,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import type { Document } from "@/types";
import { Badge, DataTable, Panel, StatCard } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getTrends } from "@/lib/api/processing.service";

const money = (value: number) =>
  `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const asNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const total = (docs: Document[], type: string, statuses: string[]) =>
  docs
    .filter((doc) => doc.type === type && statuses.includes(doc.status))
    .reduce((sum, doc) => sum + asNumber(doc.totalAmount), 0);

const agingLabels = ["Upcoming", "1–30 Days", "31–60 Days", "61–90 Days", "91+ Days"];
const agingColors = ["#a8cfe8", "#7aa8c8", "#5a8fb0", "#3d6f8f", "#2a3a4a"];

function agingBuckets(docs: Document[], type: "INVOICE" | "BILL") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [0, 0, 0, 0, 0];
  docs
    .filter(
      (doc) =>
        doc.type === type &&
        doc.totalAmount &&
        doc.dueDate &&
        !["COMPLETED", "VALIDATED", "STANDARDISED"].includes(doc.status),
    )
    .forEach((doc) => {
      const due = new Date(doc.dueDate as string);
      due.setHours(0, 0, 0, 0);
      const days = Math.ceil((today.getTime() - due.getTime()) / 86400000);
      const bucket = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
      buckets[bucket] += asNumber(doc.totalAmount);
    });
  return buckets;
}

function OutstandingPanel({ title, buckets }: { title: string; buckets: number[] }) {
  const totalAmount = buckets.reduce((sum, value) => sum + value, 0);
  return (
    <Panel title={title}>
      <div className="outstanding-chart">
        <div className="outstanding-bar" aria-label={`${title} aging breakdown`}>
          {buckets.map((value, index) => (
            <span
              key={agingLabels[index]}
              title={`${agingLabels[index]}: ${money(value)}`}
              style={{
                width: `${totalAmount ? (value / totalAmount) * 100 : 0}%`,
                background: agingColors[index],
              }}
            />
          ))}
        </div>
        <div className="outstanding-total">
          Total outstanding <strong>{money(totalAmount)}</strong>
        </div>
        <div className="outstanding-legend">
          {agingLabels.map((label, index) => {
            const percentage = totalAmount ? Math.round((buckets[index] / totalAmount) * 100) : 0;
            return (
              <span key={label}>
                <i style={{ background: agingColors[index] }} />
                <b>{label}</b>
                <em>{money(buckets[index])}</em>
                <small>{percentage}%</small>
              </span>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function AccountantDashboard({
  docs,
  exceptions,
}: {
  docs: Document[];
  exceptions: number;
}) {
  const { data: trends } = useResource(() => getTrends("week"), "accountant-dashboard-week");
  const approved = ["COMPLETED", "VALIDATED", "STANDARDISED"];
  const sales = total(docs, "INVOICE", approved);
  const purchases = total(docs, "BILL", approved);
  const receipts = total(docs, "RECEIPT", ["COMPLETED", "VALIDATED", "EXTRACTED"]);
  const notes = docs
    .filter((doc) => ["CREDIT_NOTE", "DEBIT_NOTE"].includes(doc.type) && approved.includes(doc.status))
    .reduce((sum, doc) => sum + asNumber(doc.totalAmount), 0);

  const processing = docs.filter((doc) =>
    ["UPLOADED", "QUEUED", "PROCESSING"].includes(doc.status),
  ).length;
  const review = docs.filter((doc) =>
    ["IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(doc.status),
  ).length;
  const failed = docs.filter((doc) => doc.status === "FAILED").length;
  const standardised = docs.filter((doc) => approved.includes(doc.status)).length;

  const invoiceBuckets = agingBuckets(docs, "INVOICE");
  const billBuckets = agingBuckets(docs, "BILL");
  const invoiceComingDue = invoiceBuckets[0];
  const invoiceOverdue = invoiceBuckets.slice(1).reduce((sum, value) => sum + value, 0);
  const billComingDue = billBuckets[0];
  const billOverdue = billBuckets.slice(1).reduce((sum, value) => sum + value, 0);

  const totalDocs = docs.length || 1;
  const exceptionRate = Math.round((exceptions / totalDocs) * 100);
  const completionRate = Math.round((standardised / totalDocs) * 100);

  return (
    <div className="dashboard-page">
      <div className="dashboard-intro">
        <div>
          <h1>Dashboard</h1>
          <p>Upload → Extract → Validate → Standardise → Money matching</p>
        </div>
        <div className="dashboard-intro-actions">
          <Link className="btn primary" href="/workspace/upload">
            <Plus size={16} /> Upload document
          </Link>
          <Link className="btn" href="/workspace/exceptions">
            <AlertCircle size={16} /> Review exceptions
          </Link>
        </div>
      </div>

      {/* Pipeline health — aligned with success criteria */}
      <div className="stats-grid pipeline-health-grid">
        <StatCard
          variant="solid"
          label="Documents in workspace"
          value={docs.length}
          icon={<Files size={17} />}
          detail="Total ingested"
        />
        <StatCard
          variant="solid"
          label="Standardised"
          value={standardised}
          icon={<FileCheck2 size={17} />}
          detail={`${completionRate}% of total`}
        />
        <StatCard
          variant="solid"
          label="Open exceptions"
          value={exceptions}
          icon={<AlertCircle size={17} />}
          detail={`${exceptionRate}% exception rate`}
        />
        <StatCard
          variant="solid"
          label="Pending review"
          value={review}
          icon={<Clock3 size={17} />}
          detail="Needs human check"
        />
      </div>

      <h2 className="dashboard-section-title">Money position</h2>
      <div className="stats-grid accountant-money-grid">
        <StatCard
          tone="invoice"
          variant="solid"
          label="Invoices · Coming Due"
          value={money(invoiceComingDue)}
          detail="Invoice balance"
        />
        <StatCard
          tone="invoice"
          variant="solid"
          label="Invoices · Overdue"
          value={money(invoiceOverdue)}
          detail="Invoice balance"
        />
        <StatCard
          tone="bill"
          variant="solid"
          label="Bills · Coming Due"
          value={money(billComingDue)}
          detail="Bill balance"
        />
        <StatCard
          tone="bill"
          variant="solid"
          label="Bills · Overdue"
          value={money(billOverdue)}
          detail="Bill balance"
        />
      </div>

      <div className="dashboard-middle outstanding-grid">
        <OutstandingPanel title="Outstanding Invoices" buckets={invoiceBuckets} />
        <OutstandingPanel title="Outstanding Bills" buckets={billBuckets} />
      </div>

      <h2 className="dashboard-section-title">Processing & review</h2>
      <div className="stats-grid processing-review-grid">
        <StatCard tone="processing" variant="solid" label="Processing" value={processing} />
        <StatCard tone="review" variant="solid" label="Pending Review" value={review} />
        <StatCard tone="exception" variant="solid" label="Open Exceptions" value={exceptions} />
        <StatCard tone="failed" variant="solid" label="Failed Jobs" value={failed} />
      </div>

      <div className="dashboard-middle">
        <Panel title="Document Processing Trend" subtitle="Processed documents over the current week">
          <div className="dashboard-trend-placeholder">
            {(trends ?? []).map((point) => (
              <div key={point.day}>
                <i
                  title={`${point.processed} processed`}
                  style={{ height: `${Math.max(12, Math.min(100, point.processed))}%` }}
                />
                <span>{point.day}</span>
              </div>
            ))}
          </div>
          {!trends?.length && <p className="muted-copy">Trend data is not available yet.</p>}
        </Panel>
        <Panel title="Quick actions" subtitle="Move the pipeline forward">
          <div className="detail-list">
            <Link className="btn full" href="/workspace/upload">
              <Upload size={15} /> Upload new document
            </Link>
            <Link className="btn full" href="/workspace/exceptions">
              <AlertCircle size={15} /> Open exception queue
            </Link>
            <Link className="btn full" href="/workspace/records">
              <FileCheck2 size={15} /> View standardised records
            </Link>
            <Link className="btn full" href="/workspace/money-in">
              <ArrowDownToLine size={15} /> Money In matching
            </Link>
            <Link className="btn full" href="/workspace/money-out">
              <ArrowUpFromLine size={15} /> Money Out matching
            </Link>
          </div>
        </Panel>
      </div>

      <Panel
        title="Recent Documents"
        action={
          <Link className="text-link" href="/workspace/documents">
            View all <ArrowRight size={14} />
          </Link>
        }
      >
        <DataTable
          rows={docs.slice(0, 6)}
          rowKey={(doc) => doc.id}
          columns={[
            {
              label: "Document",
              render: (doc) => (
                <Link className="document-link" href={`/workspace/documents/${doc.id}`}>
                  <Files size={16} />
                  {doc.name}
                </Link>
              ),
            },
            { label: "Contact", render: (doc) => doc.supplier ?? doc.customer ?? "—" },
            { label: "Amount", render: (doc) => money(asNumber(doc.totalAmount)) },
            { label: "Status", render: (doc) => <Badge>{doc.status}</Badge> },
          ]}
        />
      </Panel>
    </div>
  );
}

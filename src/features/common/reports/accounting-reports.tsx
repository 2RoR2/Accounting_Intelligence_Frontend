"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileText, RefreshCw, Search } from "lucide-react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getAccountingReports } from "@/lib/api/reports.service";
import { downloadCsv } from "@/lib/api/record.service";
import { Badge, DataTable, ErrorState, LoadingState, PageHeader, Panel, StatCard } from "@/components/common/ui";

export function AccountingReportsPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(() => getAccountingReports(user), user.id);
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(searchParams.get("tab") || "transactions");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = (data?.documents ?? []).filter((row) => {
    const text = `${row.reference} ${row.kind} ${row.status}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (status === "ALL" || row.status === status) &&
      (!from || row.date >= from) &&
      (!to || row.date <= to)
    );
  });

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const active = data.cards.find((card) => card.key === selected) ?? data.cards[0];

  const exportReport = () =>
    downloadCsv(`${active.title.toLowerCase().replaceAll(" ", "-")}.csv`, [
      ["Reference", "Type", "Status", "Date"],
      ...rows.map((row) => [row.reference, row.kind, row.status, row.date]),
    ]);

  return (
    <div className="dashboard-page reports-page">
      <PageHeader
        eyebrow="REPORTS"
        title="Accounting reports"
        description="Review standardised output after extraction and validation. Filter by status or date, then export for downstream use."
        actions={
          <>
            <button className="btn" type="button" onClick={() => refresh()}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className="btn primary" type="button" onClick={exportReport}>
              <Download size={15} /> Export CSV
            </button>
          </>
        }
      />

      <div className="stats-grid reports-summary">
        <StatCard
          variant="solid"
          label="Documents"
          value={data.summary.documentCount}
          detail="In this workspace"
        />
        <StatCard
          variant="solid"
          label="Extracted amount"
          value={`RM ${data.summary.totalAmount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`}
          detail="From standardised records"
        />
        <StatCard
          variant="solid"
          label="Open exceptions"
          value={data.summary.openExceptions}
          detail="Still need review"
        />
        <StatCard
          variant="solid"
          label="Line-item amount"
          value={`RM ${data.summary.lineAmount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`}
          detail="Sum of line items"
        />
      </div>

      <Panel title="Report types" subtitle="Choose a report to filter and export">
        <div className="report-card-grid">
          {data.cards.map((card) => (
            <button
              type="button"
              className={`report-card ${selected === card.key ? "active" : ""}`}
              key={card.key}
              onClick={() => {
                setSelected(card.key);
                window.history.replaceState(null, "", `/workspace/reports?tab=${card.key}`);
              }}
            >
              <FileText size={20} />
              <span>{card.title}</span>
              <Badge>{card.count}</Badge>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={active.title} subtitle="Filtered results from the company workspace">
        <div className="report-toolbar">
          <label className="report-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reference, type, or status"
            />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Report status">
            <option value="ALL">All statuses</option>
            {Array.from(new Set(data.documents.map((row) => row.status))).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Start date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="End date" />
          <span className="report-result-count">
            {rows.length} result{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <DataTable
          rows={rows}
          rowKey={(row) => `${active.key}-${row.reference}`}
          columns={[
            { label: "Reference", render: (row) => <strong>{row.reference}</strong> },
            { label: "Type", render: (row) => row.kind },
            { label: "Status", render: (row) => <Badge>{row.status}</Badge> },
            { label: "Date", render: (row) => row.date },
          ]}
        />
      </Panel>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileText, RefreshCw, Search, Star } from "lucide-react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getAccountingReports } from "@/lib/api/reports.service";
import { downloadCsv } from "@/lib/api/record.service";
import { runBankReconciliation, type BankReconciliationResult } from "@/lib/api/workflow.service";
import { Badge, DataTable, ErrorState, LoadingState, PageHeader, Panel, StatCard } from "@/components/common/ui";

export function AccountingReportsPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(() => getAccountingReports(user), user.id);
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(searchParams.get("tab") || "transactions");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bankInput, setBankInput] = useState("");
  const [transactionInput, setTransactionInput] = useState("");
  const [reconciliation, setReconciliation] = useState<BankReconciliationResult | null>(null);
  const [reconciliationError, setReconciliationError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const rows = (data?.documents ?? []).filter((row) => {
    const text = `${row.reference} ${row.kind} ${row.status}`.toLowerCase();
    return text.includes(query.toLowerCase()) &&
      (status === "ALL" || row.status === status) &&
      (!from || row.date >= from) && (!to || row.date <= to);
  });
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const active = data.cards.find((card) => card.key === selected) ?? data.cards[0];
  const exportReport = () => downloadCsv(`${active.title.toLowerCase().replaceAll(" ", "-")}.csv`, [
    ["Reference", "Type", "Status", "Date"], ...rows.map((row) => [row.reference, row.kind, row.status, row.date]),
  ]);
  const runReconciliation = async () => {
    setReconciliationError("");
    setReconciliation(null);
    try {
      const accountingRecords = JSON.parse(bankInput);
      const bankTransactions = JSON.parse(transactionInput);
      if (!Array.isArray(accountingRecords) || !Array.isArray(bankTransactions)) throw new Error("Both inputs must be JSON arrays.");
      setReconciling(true);
      setReconciliation(await runBankReconciliation(accountingRecords, bankTransactions));
    } catch (err) {
      setReconciliationError(err instanceof Error ? err.message : "Unable to run reconciliation.");
    } finally {
      setReconciling(false);
    }
  };
  return <>
    <PageHeader eyebrow="ACCOUNTING REPORTS" title="Accounting Reports" description="Tenant-scoped reports built from your documents, extracted transactions, reconciliations, and audit history." actions={<><button className="btn" type="button" onClick={() => refresh()}><RefreshCw size={15} /> Refresh</button><button className="btn primary" type="button" onClick={exportReport}><Download size={15} /> Export CSV</button></>} />
    <div className="stats-grid">
      <StatCard label="Documents" value={data.summary.documentCount} />
      <StatCard label="Extracted amount" value={`RM ${data.summary.totalAmount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`} />
      <StatCard label="Open exceptions" value={data.summary.openExceptions} />
      <StatCard label="Line-item amount" value={`RM ${data.summary.lineAmount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`} />
    </div>
    <Panel title={`Accounting Reports (${data.cards.length})`}>
      <div className="report-card-grid">
        {data.cards.map((card) => <button type="button" className={`report-card ${selected === card.key ? "active" : ""}`} key={card.key} onClick={() => { setSelected(card.key); window.history.replaceState(null, "", `/workspace/reports?tab=${card.key}`); }}>
          <FileText size={22} /><span>{card.title}</span><Badge>{card.count}</Badge><Star size={17} />
        </button>)}
      </div>
    </Panel>
    <Panel title={active.title} subtitle="Current data from the company workspace">
      <div className="report-toolbar">
        <label className="report-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reference, type, or status" /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Report status"><option value="ALL">All statuses</option>{Array.from(new Set(data.documents.map((row) => row.status))).map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Report start date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Report end date" />
        <span className="report-result-count">{rows.length} result{rows.length === 1 ? "" : "s"}</span>
      </div>
      <DataTable rows={rows} rowKey={(row) => `${active.key}-${row.reference}`} columns={[
        { label: "Reference", render: (row) => <strong>{row.reference}</strong> },
        { label: "Type", render: (row) => row.kind },
        { label: "Status", render: (row) => <Badge>{row.status}</Badge> },
        { label: "Date", render: (row) => row.date },
      ]} />
    </Panel>
    <Panel title="Bank matching candidates" subtitle="Compare supplied accounting records and bank transactions. Results are proposals for review; they do not confirm settlement or post ledger entries.">
      <p className="panel-body">Candidate results do not confirm a saved reconciliation. Review them against original evidence. Enter amounts as quoted decimal strings; references may be strings, null, or omitted.</p>
      <div className="report-toolbar">
        <label style={{ flex: 1 }}>Accounting records<textarea disabled={reconciling} value={bankInput} onChange={(e) => { setBankInput(e.target.value); setReconciliation(null); }} rows={5} aria-label="Accounting records JSON" /></label>
        <label style={{ flex: 1 }}>Bank transactions<textarea disabled={reconciling} value={transactionInput} onChange={(e) => { setTransactionInput(e.target.value); setReconciliation(null); }} rows={5} aria-label="Bank transactions JSON" /></label>
      </div>
      <button className="btn primary" type="button" onClick={runReconciliation} disabled={reconciling || !bankInput.trim() || !transactionInput.trim()}>{reconciling ? "Matching..." : "Find candidates"}</button>
      {reconciliationError && <p role="alert" className="error-text">{reconciliationError}</p>}
      {reconciliation && <DataTable rows={reconciliation.results} rowKey={(row) => row.accounting_record_id} columns={[
        { label: "Record", render: (row) => <strong>{row.accounting_record_id}</strong> },
        { label: "Candidate status", render: (row) => <Badge>{row.status === "MATCHED" ? "Candidate found" : row.status === "UNMATCHED" ? "No candidate" : "Review required"}</Badge> },
        { label: "Candidate transaction", render: (row) => row.matched_bank_transaction_id ?? "—" },
        { label: "Reason", render: (row) => row.reason ?? "—" },
      ]} />}
    </Panel>
  </>;
}

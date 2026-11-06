"use client";
import { useState } from "react";
import { useResource } from "@/features/common/hooks/use-resource";
import { DataTable, ErrorState, LoadingState, PageHeader, Panel, StatCard } from "@/components/common/ui";
import { getLedgerJournals, getSettlements, getAllocations, getTrialBalance } from "@/lib/api/ledger.service";

export function LedgerPage() {
  const [section, setSection] = useState<"trial" | "journals" | "allocations">("trial");
  const { data, error, loading, refresh } = useResource(async () => {
    const [journals, settlements, allocations, trialBalance] = await Promise.all([getLedgerJournals(), getSettlements(), getAllocations(), getTrialBalance()]);
    return { journals, settlements, allocations, trialBalance };
  }, "internal-ledger");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const posted = data.journals.filter((j) => j.status === "posted").length;
  const unmatched = data.settlements.reduce((sum, s) => sum + Number(s.unmatchedAmount), 0);
  return <div className="ledger-page">
    <PageHeader title="General Ledger" description="Review journals, settlements, and reconciliation allocations." actions={<><button className="btn btn-primary" type="button">+ New</button><button className="btn btn-secondary" type="button" aria-label="More ledger actions">•••</button></>} />
    <div className="stats-grid">
      <StatCard label="Posted journals" value={posted} detail="General ledger" />
      <StatCard label="Settlements" value={data.settlements.length} detail="Recorded payments only" />
      <StatCard label="Allocations" value={data.allocations.filter((a) => a.status === "active").length} detail="Active reconciliation links" />
      <StatCard label="Unmatched amount" value={unmatched.toFixed(2)} detail="Across recorded settlements" />
    </div>
    <div className="ledger-surface">
    <section className="ledger-browser" aria-label="Ledger sections and filters">
      <nav className="ledger-tabs" aria-label="Ledger sections">
        {[['trial', 'Trial balance'], ['journals', 'Journal history'], ['allocations', 'Settlement allocations']].map(([key, label]) => <button key={key} type="button" className={section === key ? 'active' : ''} onClick={() => setSection(key as typeof section)}>{label}</button>)}
      </nav>
      <div className="ledger-filter-bar">
        <label className="ledger-search"><span aria-hidden="true">⌕</span><input aria-label="Search ledger" placeholder="Search journals..." /></label>
        <select aria-label="Journal status" defaultValue=""><option value="">All statuses</option><option value="posted">Posted</option><option value="reversed">Reversed</option></select>
        <select aria-label="Journal source" defaultValue=""><option value="">All sources</option><option value="document">Documents</option><option value="settlement">Settlements</option><option value="adjustment">Adjustments</option></select>
        <input aria-label="Exact amount" placeholder="Exact amount" inputMode="decimal" />
        <input aria-label="Journal date" type="date" />
      </div>
    </section>
    {section === "trial" && <Panel title="Trial balance"><DataTable rows={data.trialBalance} rowKey={(r) => r.accountId} columns={[{ label: "Account", render: (r) => `${r.code} · ${r.name}` }, { label: "Type", render: (r) => r.accountType }, { label: "Debit", render: (r) => r.totalDebit }, { label: "Credit", render: (r) => r.totalCredit }, { label: "Net", render: (r) => r.netBalance }]} /></Panel>}
    {section === "journals" && <Panel title="Journal history"><DataTable rows={data.journals} rowKey={(r) => r.id} columns={[{ label: "Date", render: (r) => r.date }, { label: "Description", render: (r) => r.description }, { label: "Source", render: (r) => r.sourceType }, { label: "Debit", render: (r) => r.totalDebit }, { label: "Credit", render: (r) => r.totalCredit }, { label: "Status", render: (r) => r.status }]} /></Panel>}
    {section === "allocations" && <Panel title="Settlement allocations"><DataTable rows={data.allocations} rowKey={(r) => r.id} columns={[{ label: "Settlement", render: (r) => r.settlementRef }, { label: "Record", render: (r) => r.recordId }, { label: "Direction", render: (r) => r.direction }, { label: "Amount", render: (r) => `${r.currency} ${r.amount}` }, { label: "Unmatched", render: (r) => `${r.currency} ${r.unmatchedSettlementAmount}` }, { label: "Status", render: (r) => r.status }]} /></Panel>}
    </div>
  </div>;
}

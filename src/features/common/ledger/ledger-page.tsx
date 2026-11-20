"use client";

import { useState } from "react";
import { useResource } from "@/features/common/hooks/use-resource";
import { DataTable, ErrorState, LoadingState, PageHeader, Panel, StatCard } from "@/components/common/ui";
import { getLedgerJournals, getSettlements, getAllocations, getTrialBalance } from "@/lib/api/ledger.service";
import { ChartAccounts } from "./chart-accounts";
import { JournalPostingForm } from "./journal-posting-form";
import { currencyTotals } from "@/lib/api/document-contract";

const sections = [
  ["trial", "Trial balance"],
  ["journals", "Journal history"],
  ["allocations", "Settlement allocations"],
  ["accounts", "Chart of accounts"],
] as const;

function amountKey(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? `${BigInt(match[1])}.${(match[2] ?? "").padEnd(2, "0")}` : null;
}

export function LedgerPage({ canPost }: { canPost: boolean }) {
  const [section, setSection] = useState<(typeof sections)[number][0]>("trial");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState("");
  const { data, error, loading, refresh } = useResource(async () => {
    const [journals, settlements, allocations, trialBalance] = await Promise.all([
      getLedgerJournals(), getSettlements(), getAllocations(), getTrialBalance(),
    ]);
    return { journals, settlements, allocations, trialBalance };
  }, "internal-ledger");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const posted = data.journals.filter((journal) => journal.status === "posted").length;
  const unmatched = currencyTotals(data.settlements.map((settlement) => ({
    currency: settlement.currency, total: settlement.unmatchedAmount,
  })));
  const query = search.trim().toLowerCase();
  const requestedAmount = amountKey(amount);
  const journalRows = data.journals.filter((journal) => (
    `${journal.description} ${journal.id} ${journal.sourceId ?? ""} ${journal.sourceType}`.toLowerCase().includes(query)
    && (!status || journal.status === status)
    && (!source || journal.sourceType === source)
    && (!month || journal.date.startsWith(month))
    && (!amount.trim() || (requestedAmount !== null && amountKey(journal.totalDebit) === requestedAmount))
  ));

  return <div className="ledger-page">
    <PageHeader title="General Ledger" description="Review journals, settlements, and reconciliation allocations." />
    <div className="stats-grid">
      <StatCard label="Posted journals" value={posted} detail="General ledger" />
      <StatCard label="Settlements" value={data.settlements.length} detail="Recorded payments only" />
      <StatCard label="Allocations" value={data.allocations.filter((allocation) => allocation.status === "active").length} detail="Active reconciliation links" />
      <StatCard label="Unmatched amount" value={unmatched.map((row) => `${row.currency ?? "Unspecified"} ${row.total}`).join(" / ") || "None"} detail="Grouped by currency" />
    </div>
    <div className="ledger-surface">
      <section className="ledger-browser" aria-label="Ledger sections and filters">
        <nav className="ledger-tabs" aria-label="Ledger sections">
          {sections.map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} className={section === key ? "active" : ""} onClick={() => setSection(key)}>{label}</button>)}
        </nav>
        {section === "journals" && <div className="ledger-filter-bar">
          <input aria-label="Search ledger" placeholder="Search journals" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Journal status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option><option value="posted">Posted</option><option value="reversed">Reversed</option><option value="draft">Draft</option>
          </select>
          <select aria-label="Journal source" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">All sources</option><option value="document">Documents</option><option value="settlement">Settlements</option><option value="adjustment">Adjustments</option><option value="manual">Manual</option><option value="reversal">Reversals</option>
          </select>
          <input aria-label="Exact amount" placeholder="Exact amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <input aria-label="Journal month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>}
      </section>
      {section === "trial" && <Panel title="Trial balance">
        <DataTable rows={data.trialBalance} rowKey={(r) => r.accountId} columns={[
          { label: "Account", render: (r) => `${r.code} · ${r.name}` }, { label: "Type", render: (r) => r.accountType },
          { label: "Debit", render: (r) => r.totalDebit }, { label: "Credit", render: (r) => r.totalCredit }, { label: "Net", render: (r) => r.netBalance },
        ]} />
      </Panel>}
      {section === "journals" && <Panel title="Journal history">
        {canPost && <JournalPostingForm onPosted={refresh} />}
        <DataTable rows={journalRows} rowKey={(r) => r.id} columns={[
          { label: "Date", render: (r) => r.date }, { label: "Description", render: (r) => r.description }, { label: "Source", render: (r) => r.sourceType },
          { label: "Debit", render: (r) => r.totalDebit }, { label: "Credit", render: (r) => r.totalCredit }, { label: "Status", render: (r) => r.status },
        ]} />
      </Panel>}
      {section === "allocations" && <Panel title="Settlement allocations">
        <DataTable rows={data.allocations} rowKey={(r) => r.id} columns={[
          { label: "Settlement", render: (r) => r.settlementRef }, { label: "Record", render: (r) => r.recordId }, { label: "Direction", render: (r) => r.direction },
          { label: "Amount", render: (r) => `${r.currency} ${r.amount}` }, { label: "Unmatched", render: (r) => `${r.currency} ${r.unmatchedSettlementAmount}` },
          { label: "Status", render: (r) => r.status },
        ]} />
      </Panel>}
      {section === "accounts" && <ChartAccounts canEdit={canPost} />}
    </div>
  </div>;
}

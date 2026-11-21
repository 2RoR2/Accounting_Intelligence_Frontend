"use client";

import { useMemo, useState, type SyntheticEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useResource } from "@/features/common/hooks/use-resource";
import { DataTable, ErrorState, LoadingState, Modal, PageHeader, Panel, StatCard } from "@/components/common/ui";
import { ApiError } from "@/lib/api/client";
import { getLedgerJournals, getSettlements, getAllocations, getTrialBalance, reverseJournal, type Journal } from "@/lib/api/ledger.service";
import { ChartAccounts } from "./chart-accounts";
import { JournalPostingForm } from "./journal-posting-form";
import { currencyTotals } from "@/lib/api/document-contract";
import { MonthlyFinance } from "@/features/common/today/monthly-finance";

const sections = [
  ["monthly", "Monthly ledger"],
  ["trial", "Trial balance"],
  ["journals", "Journal history"],
  ["allocations", "Settlement allocations"],
  ["accounts", "Chart of accounts"],
] as const;

function amountKey(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? `${BigInt(match[1])}.${(match[2] ?? "").padEnd(2, "0")}` : null;
}

type HistoryJournal = Journal & { reversedJournalId?: string | null };

export function LedgerPage({ canPost }: { canPost: boolean }) {
  // The open section is in the URL (?section=), so the sidebar's Accounting entries open it and stay highlighted.
  type Section = (typeof sections)[number][0];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("section");
  const section: Section = sections.find(([key]) => key === requested)?.[0] ?? "trial";
  const setSection = (key: Section) => router.replace(`${pathname}?section=${key}`, { scroll: false });
  const base = pathname.split("/").slice(0, 2).join("/");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState("");
  const [reverseTarget, setReverseTarget] = useState<Journal | null>(null);
  const [reverseError, setReverseError] = useState("");
  const [reversing, setReversing] = useState(false);
  const { data, error, loading, refresh, setData } = useResource(async () => {
    const [journals, settlements, allocations, trialBalance] = await Promise.all([
      getLedgerJournals(), getSettlements(), getAllocations(), getTrialBalance(),
    ]);
    return { journals, settlements, allocations, trialBalance };
  }, "internal-ledger");
  const settlements = data?.settlements;
  // Only when the settlements change, not on every search keystroke.
  const unmatched = useMemo(() => currencyTotals((settlements ?? []).map((settlement) => ({
    currency: settlement.currency, total: settlement.unmatchedAmount,
  }))), [settlements]);
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const posted = data.journals.filter((journal) => journal.status === "posted").length;
  const reversedIds = new Set(data.journals.map((journal: HistoryJournal) =>
    // The current list API exposes the original journal as the source of a reversal.
    journal.reversedJournalId ?? (journal.sourceType === "reversal" ? journal.sourceId : null),
  ));
  const query = search.trim().toLowerCase();
  const requestedAmount = amountKey(amount);
  const journalRows = data.journals.filter((journal) => (
    `${journal.description} ${journal.id} ${journal.sourceId ?? ""} ${journal.sourceType}`.toLowerCase().includes(query)
    && (!status || journal.status === status)
    && (!source || journal.sourceType === source)
    && (!month || journal.date.startsWith(month))
    && (!amount.trim() || (requestedAmount !== null && amountKey(journal.totalDebit) === requestedAmount))
  ));

  const confirmReverse = async () => {
    if (!canPost || !reverseTarget || reversing) return;
    setReversing(true);
    setReverseError("");
    try {
      await reverseJournal(reverseTarget.id);
      setData((current) => current && {
        ...current,
        journals: current.journals.map((journal) => journal.id === reverseTarget.id ? { ...journal, status: "reversed" } : journal),
      });
      setReverseTarget(null);
      await refresh();
    } catch (e) {
      setReverseError(e instanceof ApiError ? e.message : "Unable to reverse the journal. Please try again.");
      if (e instanceof ApiError && e.status === 409) void refresh();
    } finally {
      setReversing(false);
    }
  };

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
      {section === "monthly" && <MonthlyFinance asOf={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date())} base={base} userId="ledger" />}
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
          ...(canPost ? [{ label: "Actions", render: (journal: Journal) => {
            if (journal.sourceType === "erp_document") return "Void the document instead";
            if (journal.status !== "posted" || journal.sourceType === "reversal" || reversedIds.has(journal.id)) return null;
            return <button type="button" className="btn small" disabled={reversing} onClick={() => {
              setReverseError("");
              setReverseTarget(journal);
            }}>Reverse</button>;
          } }] : []),
        ]} />
        {canPost && reverseTarget && <Modal title="Reverse journal" onClose={(event?: SyntheticEvent) => {
          if (reversing) event?.preventDefault();
          else setReverseTarget(null);
        }}>
          <div className="panel-body">
            <p><strong>{reverseTarget.description}</strong> ({reverseTarget.date})</p>
            <p>This adds a reversal journal on the same date; the original stays in the history.</p>
            {reverseError && <div className="notice danger" role="alert">{reverseError}</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" disabled={reversing} onClick={() => setReverseTarget(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={reversing} onClick={() => void confirmReverse()}>
              {reversing ? "Reversing…" : "Reverse"}
            </button>
          </div>
        </Modal>}
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

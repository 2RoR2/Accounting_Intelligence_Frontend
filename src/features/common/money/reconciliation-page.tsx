"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Landmark, Sparkles, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, PageHeader, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { decideMatch, getMoneyTransactions } from "@/lib/api/money.service";
import type { BankReconciliationCandidate, BankMoneyTransaction, User } from "@/types";

export function ReconciliationPage({ user }: { user: User }) {
  const moneyInPath = user.role === "LOCAL_ADMIN" ? "/company/money-in" : "/workspace/money-in";
  const { data, loading, error, refresh } = useResource(
    () => Promise.all([getMoneyTransactions(user, "money_in"), getMoneyTransactions(user, "money_out")]),
    "reconciliation",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const rows = useMemo(() => (data ?? []).flat().filter((row) => row.candidates?.some((candidate) => candidate.status === "proposed")), [data]);

  async function decide(row: BankMoneyTransaction, candidate: BankReconciliationCandidate, decision: "confirm" | "reject") {
    setBusy(candidate.id); setNotice(""); setActionError("");
    try {
      await decideMatch(user, candidate.id, decision, candidate.revision, decision === "reject" ? "Rejected during reconciliation review" : undefined);
      setNotice(decision === "confirm" ? "Match confirmed." : "Candidate rejected.");
      await refresh();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Unable to save reconciliation decision."); }
    finally { setBusy(null); }
  }

  return <>
    <PageHeader eyebrow="BANKING" title="Reconciliation" description="Review proposed matches between imported bank transactions and standardised records." actions={<Link className="btn primary reconciliation-import" href={moneyInPath}><UploadCloud size={16} /> Import bank statement</Link>} />
    {notice && <div className="notice success" role="status">{notice}</div>}
    {actionError && <p className="error-text" role="alert">{actionError}</p>}
    <div className="reconciliation-stats">
      <div><span>Needs review</span><strong>{rows.length}</strong><small>Proposed matches</small></div>
      <div><span>Banking workflow</span><strong><CheckCircle2 size={22} /> Ready</strong><small>Review and confirm safely</small></div>
      <div><span>Next step</span><strong><Landmark size={22} /> Import</strong><small>Bring in a bank statement</small></div>
    </div>
    <Panel title="Proposed matches" subtitle="Confirm a match only when the bank row and record agree.">
      {loading && <p className="loading-state">Loading reconciliation candidates…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && rows.length === 0 && <div className="reconciliation-empty"><div className="reconciliation-empty-icon"><Sparkles size={24} /></div><h3>No matches need review yet</h3><p>Import a bank statement to compare transactions against your standardised records. Suggested matches will appear here for confirmation.</p><Link className="btn primary" href={moneyInPath}>Go to Money In <ArrowRight size={15} /></Link></div>}
      {!loading && rows.length > 0 && <div className="reconciliation-list">
        {rows.flatMap((row) => (row.candidates ?? []).filter((candidate) => candidate.status === "proposed").map((candidate) => <div className="reconciliation-card" key={candidate.id}>
          <div className="reconciliation-card-heading"><div><strong>{row.description || "Bank transaction"}</strong><span>{row.postedDate} · {row.direction === "money_in" ? "Money In" : "Money Out"}</span></div><Badge>PROPOSED</Badge></div>
          <div className="reconciliation-card-grid"><div><span>Bank amount</span><strong>{row.currency ?? ""} {row.amount ?? "—"}</strong></div><div><span>Record</span><strong>{candidate.recordCode}</strong></div><div><span>Candidate amount</span><strong>{candidate.currency ?? ""} {candidate.amount ?? "—"}</strong></div><div><span>Reason</span><strong>{candidate.reasons.join(", ") || "Suggested match"}</strong></div></div>
          <div className="reconciliation-actions"><button className="btn primary" disabled={busy === candidate.id} onClick={() => void decide(row, candidate, "confirm")}>Confirm match</button><button className="btn" disabled={busy === candidate.id} onClick={() => void decide(row, candidate, "reject")}>Reject</button></div>
        </div>))}
      </div>}
    </Panel>
  </>;
}

"use client";
/** One journal's lines and where it came from (audit 24 Nov: the journal list showed totals only). */
import Link from "next/link";
import { DataTable, ErrorState, LoadingState, StatusBadge } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { recordHref, typeLabel } from "@/features/common/trace/trace-links";
import { getLedgerJournal } from "@/lib/api/ledger.service";

export function JournalDetailPanel({ base, journalId }: { base: string; journalId: string }) {
  const { data, loading, error, refresh } = useResource(() => getLedgerJournal(journalId), `journal:${journalId}`);
  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const sourceHref = data.source ? recordHref(base, data.source) : null;
  const journalHref = (id: string) => `${base}/ledger?section=journals&q=${encodeURIComponent(id)}`;
  return <div className="panel-body journal-detail">
    <dl className="detail-list">
      <div><dt>Date</dt><dd>{data.date}{data.periodCode ? ` · period ${data.periodCode}` : ""}</dd></div>
      <div><dt>Status</dt><dd><StatusBadge status={data.status} /></dd></div>
      <div><dt>Source</dt><dd>{data.source
        ? sourceHref ? <Link href={sourceHref}>{typeLabel(data.source.kind, data.source.type)} {data.source.number}</Link>
          : `${typeLabel(data.source.kind, data.source.type)} ${data.source.number}`
        : data.sourceType === "manual" ? "Manual journal" : "—"}</dd></div>
      <div><dt>Posted by</dt><dd>{data.postedBy ?? "—"}{data.postedAt ? ` · ${data.postedAt.slice(0, 16).replace("T", " ")}` : ""}</dd></div>
      {data.reversesJournalId && <div><dt>Reverses</dt><dd><Link href={journalHref(data.reversesJournalId)}>the original journal</Link></dd></div>}
      {data.reversedByJournalId && <div><dt>Reversed by</dt><dd><Link href={journalHref(data.reversedByJournalId)}>a reversal journal</Link></dd></div>}
    </dl>
    <DataTable rows={data.lines} rowKey={(line) => String(line.lineNumber)} columns={[
      { label: "Account", render: (line) => `${line.code} ${line.name}` },
      { label: "Description", render: (line) => line.description || "—" },
      { label: "Debit", render: (line) => line.debit === "0.00" ? "" : line.debit },
      { label: "Credit", render: (line) => line.credit === "0.00" ? "" : line.credit },
    ]} />
    <p role="status"><strong>Total</strong> debit {data.totalDebit} · credit {data.totalCredit}{data.balanced ? " · balanced" : " · NOT balanced"}</p>
  </div>;
}

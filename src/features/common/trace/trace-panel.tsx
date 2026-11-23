"use client";

import Link from "next/link";
import { ErrorState, LoadingState, Panel, StatusBadge, formatDate, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getTrace, type TraceNode } from "@/lib/api/trace.service";
import { recordHref, typeLabel } from "./trace-links";

/**
 * The chain around one record, oldest step first: scanned upload → quotation → invoice or bill → credit and debit
 * notes → payments → the bank line they were matched to → the journals (a reversal follows the journal it undoes).
 * Read-only; each step links to its page. `type` is a typed document type, or `record`, `upload`, `bank-transaction`,
 * `settlement` or `journal`.
 */
export function TracePanel({ base, type, id, title = "Trace" }: { base: string; type: string; id: string; title?: string }) {
  const { data, loading, error, refresh } = useResource(() => getTrace(type, id), `trace:${type}:${id}`);
  return <Panel title={title} subtitle="Where this record came from and what it led to.">
    {loading && <LoadingState variant="table" />}
    {error && !data && <ErrorState message={error} retry={() => void refresh()} />}
    {data && (data.nodes.length <= 1
      ? <p className="p-5 trace-empty">Nothing else is linked to this record yet.</p>
      : <ol className="trace-chain" aria-label="Linked records, oldest first">
        {data.nodes.map((node) => <TraceStep key={node.key} base={base} node={node} />)}
      </ol>)}
    {data?.truncated && <p className="p-5 trace-empty">This chain is long; only the first records are shown.</p>}
  </Panel>;
}

function TraceStep({ base, node }: { base: string; node: TraceNode }) {
  const href = node.isSubject ? null : recordHref(base, node);
  const label = typeLabel(node.kind, node.type);
  const heading = <><span className="trace-type">{label}</span> <strong>{node.number}</strong></>;
  return <li className={`trace-step trace-${node.kind}${node.isSubject ? " trace-current" : ""}`} aria-current={node.isSubject ? "step" : undefined}>
    <div className="trace-main">
      <div className="trace-title">
        {href ? <Link href={href}>{heading}</Link> : heading}
        {node.isSubject && <span className="trace-here">You are here</span>}
        <StatusBadge status={node.status} />
      </div>
      <div className="trace-meta">
        {node.date && <span>{formatDate(node.date)}</span>}
        {node.party && <span>{node.party}</span>}
        {node.detail && node.kind !== "journal" && <span>{node.detail}</span>}
      </div>
      {node.via.length > 0 && <ul className="trace-via">
        {node.via.map((via) => <li key={`${via.text}:${via.key}`}>
          {via.text} {typeLabel(via.key.split(":")[0], via.type).toLowerCase()} {via.number}
          {via.amount && <> · {money(via.amount)}</>}
          {via.status === "reversed" && <> · undone</>}
        </li>)}
      </ul>}
    </div>
    {node.amount !== null && <div className="trace-amount">{money(node.amount)}</div>}
  </li>;
}

"use client";

import { DataTable, EmptyState, ErrorState, LoadingState, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getWorkloadReport } from "@/lib/api/workload";
import { monthLabel } from "@/lib/business-summary";
import { NOT_MEASURED, countLabel, rateLabel, sc2Label, statsLabel } from "@/lib/workload";

const fieldLabel = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Workload per document from what the system records. Every figure shows its n; nothing is estimated. */
export function WorkloadPanel() {
  const { data, error, loading, refresh } = useResource(() => getWorkloadReport(), "workload-report");
  const overall = data?.overall;

  return <Panel title="Workload" subtitle="Per document, from the corrections, type choices and decisions AccordAI records. Nothing here is estimated.">
    {loading && <LoadingState />}
    {error && <ErrorState message={error} retry={refresh} />}
    {data && overall && overall.documents === 0 && <EmptyState message={`${NOT_MEASURED}. Figures appear here once documents have been read and reviewed.`} />}
    {data && overall && overall.documents > 0 && <>
      <dl className="panel-body detail-list">
        <div><dt>Documents</dt><dd>{overall.documents}</dd></div>
        <div><dt>Touches per document</dt><dd>{statsLabel(overall.touches)}
          <br /><small>{[countLabel(overall.touchTotals.fieldEdits, "field edit"), countLabel(overall.touchTotals.lineItemChanges, "line-item change"),
            countLabel(overall.touchTotals.typeChoices, "type choice"), countLabel(overall.touchTotals.decisions, "decision")].join(" · ")}</small></dd></div>
        <div><dt>Corrected fields per document</dt><dd>{statsLabel(overall.correctedFields)}</dd></div>
        <div><dt>First-pass exception rate</dt><dd>{rateLabel(overall.firstPass.exceptions, overall.firstPass.checked, overall.firstPass.rate)}
          {overall.firstPass.excluded > 0 && <><br /><small>{overall.firstPass.excluded} excluded: no system result yet (still processing or failed)</small></>}</dd></div>
        <div><dt>Ready without any correction</dt><dd>{rateLabel(overall.readyWithoutCorrection.withoutCorrection, overall.readyWithoutCorrection.ready, overall.readyWithoutCorrection.rate)}
          {overall.readyWithoutCorrection.notReady > 0 && <><br /><small>{overall.readyWithoutCorrection.notReady} not approved yet, so not counted</small></>}</dd></div>
        <div><dt>Review time per document</dt><dd>{overall.reviewTime.measured ? statsLabel(overall.reviewTime, "s") : `${NOT_MEASURED}: no timed reviews recorded`}</dd></div>
        <div><dt>SC2: at least 70% less manual entry</dt><dd>{sc2Label(data.effortStudy)}
          <br /><small>{data.sc2.note}</small></dd></div>
      </dl>
      {data.periods.length > 0 && <DataTable rows={data.periods} rowKey={(row) => row.period} columns={[
        { label: "Month", render: (row) => monthLabel(row.period) },
        { label: "Documents", render: (row) => row.documents },
        { label: "Touches", render: (row) => statsLabel(row.touches) },
        { label: "Corrected fields", render: (row) => statsLabel(row.correctedFields) },
        { label: "First-pass exceptions", render: (row) => rateLabel(row.firstPass.exceptions, row.firstPass.checked, row.firstPass.rate) },
        { label: "Ready without correction", render: (row) => rateLabel(row.readyWithoutCorrection.withoutCorrection, row.readyWithoutCorrection.ready, row.readyWithoutCorrection.rate) },
      ]} />}
      <p className="panel-body"><small>
        {data.correctedFieldKeys.length
          ? `Most corrected fields: ${data.correctedFieldKeys.slice(0, 5).map((row) => `${fieldLabel(row.fieldKey)} (${row.documents} document${row.documents === 1 ? "" : "s"})`).join(", ")}.`
          : "No field has been corrected yet."}
      </small></p>
    </>}
  </Panel>;
}

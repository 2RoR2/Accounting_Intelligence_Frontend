"use client";

import { EmptyState, ErrorState, LoadingState, PageHeader, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getLatestBenchmark } from "@/lib/api/benchmark.service";

const percentage = (value: number) => new Intl.NumberFormat("en-MY", { style: "percent", maximumFractionDigits: 1 }).format(value);

export function EvaluationPage() {
  const { data, error, loading, refresh } = useResource(getLatestBenchmark, "latest-benchmark");

  return <>
    <PageHeader title="Performance evaluation" description="Extraction performance on synthetic data." />
    <Panel title="Latest benchmark">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {data === null && <EmptyState message="Not measured yet. Results appear here once an extraction benchmark has been run." />}
      {data && <dl className="panel-body detail-list">
        <div><dt>Data</dt><dd>synthetic data · Hold-out set</dd></div>
        <div><dt>Engine</dt><dd>Lite extraction</dd></div>
        {Object.keys(data.models ?? {}).length > 0 && <div><dt>Model</dt><dd>{Object.keys(data.models ?? {}).join(", ")}</dd></div>}
        <div><dt>Run time</dt><dd><time dateTime={data.created_at}>{data.created_at}</time></dd></div>
        <div><dt>Documents</dt><dd>{data.documents.length}</dd></div>
        {data.overall.accuracy != null && <div><dt>Field accuracy</dt><dd>{percentage(data.overall.accuracy)}</dd></div>}
        {data.seconds_per_document?.total && <div><dt>Processing time per document</dt><dd>{data.seconds_per_document.total.median} s median · {data.seconds_per_document.total.p90} s at the 90th percentile</dd></div>}
        <div><dt>Exception rate</dt><dd>{data.exception_rate == null ? "Not measured yet" : percentage(data.exception_rate)}</dd></div>
      </dl>}
    </Panel>
  </>;
}

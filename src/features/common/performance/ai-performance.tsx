"use client";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments } from "@/lib/api/document.service";
import { getPerformanceMetrics } from "@/lib/api/processing.service";
import { Badge, DataTable, ErrorState, LoadingState, PageHeader, Panel, StatCard } from "@/components/common/ui";

export function AiPerformancePage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(async () => {
    const [docs, metrics] = await Promise.all([
      getDocuments(user),
      getPerformanceMetrics(user),
    ]);
    return { docs, metrics };
  }, user.id);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const metric = (label: string) => data.metrics.find((item) => item.label === label);
  const processed = metric("Processed documents");
  const success = metric("Processing success rate");
  const average = metric("Avg. processing time");
  const exceptions = metric("Open exception rate");

  return (
    <>
      <PageHeader
        eyebrow="AI PERFORMANCE"
        title="AI performance"
        description="Overall extraction accuracy, processing speed, and exception handling against the success criteria."
      />
      <div className="stats-grid">
        <StatCard label="Processed documents" value={processed?.value ?? "—"} detail="Completed queue jobs" />
        <StatCard label="Processing success" value={success?.value ?? "—"} detail={success?.change || "Queue outcome"} />
        <StatCard label="Average processing" value={average?.value ?? "—"} detail={average?.target || "End-to-end duration"} />
        <StatCard label="Open exception rate" value={exceptions?.value ?? "—"} detail={exceptions?.change || "Current review workload"} />
      </div>
      <Panel title="Performance metrics">
        <DataTable
          rows={data.metrics}
          rowKey={(m) => m.label}
          columns={[
            { label: "Metric", render: (m) => m.label },
            { label: "Value", render: (m) => m.value },
          ]}
        />
      </Panel>
      <Panel title="Recent processing">
        <DataTable
          rows={data.docs.slice(0, 15)}
          rowKey={(d) => d.id}
          columns={[
            { label: "Document", render: (d) => d.name },
            { label: "Status", render: (d) => <Badge>{d.status}</Badge> },
            { label: "Type", render: (d) => d.type },
          ]}
        />
      </Panel>
    </>
  );
}

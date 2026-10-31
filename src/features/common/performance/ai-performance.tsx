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

  const total = data.docs.length || 1;
  const extracted = data.docs.filter((d) =>
    !["UPLOADED", "QUEUED", "PROCESSING", "FAILED"].includes(d.status),
  ).length;
  const accuracy = Math.round((extracted / total) * 100);

  return (
    <>
      <PageHeader
        eyebrow="AI PERFORMANCE"
        title="AI performance"
        description="Overall extraction accuracy, processing speed, and exception handling against the success criteria."
      />
      <div className="stats-grid">
        <StatCard label="Documents processed" value={data.docs.length} />
        <StatCard label="Extraction coverage" value={`${accuracy}%`} detail="Target ≥ 95%" />
        <StatCard label="Processing target" value="≤ 20s" detail="Per document" />
        <StatCard label="Exception target" value="< 10%" detail="Routed for review" />
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

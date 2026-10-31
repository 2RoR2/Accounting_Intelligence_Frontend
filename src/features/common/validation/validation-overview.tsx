"use client";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments, getExceptions } from "@/lib/api/document.service";
import { getPerformanceMetrics } from "@/lib/api/processing.service";
import { Badge, DataTable, ErrorState, LoadingState, PageHeader, Panel, StatCard } from "@/components/common/ui";

export function ValidationOverviewPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(async () => {
    const [docs, exceptions] = await Promise.all([
      getDocuments(user),
      getExceptions(user),
    ]);
    return { docs, exceptions };
  }, user.id);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const total = data.docs.length || 1;
  const validated = data.docs.filter((d) =>
    ["VALIDATED", "STANDARDISED", "COMPLETED"].includes(d.status),
  ).length;
  const open = data.exceptions.filter((e) => e.status !== "RESOLVED").length;
  const rate = Math.round((open / total) * 100);

  return (
    <>
      <PageHeader
        eyebrow="VALIDATION"
        title="Validation overview"
        description="See which documents passed validation and which still need review. Exception rate should stay below 10%."
      />
      <div className="stats-grid">
        <StatCard label="Documents checked" value={data.docs.length} />
        <StatCard label="Validated" value={validated} detail={`${Math.round((validated / total) * 100)}%`} />
        <StatCard label="Open exceptions" value={open} detail={`${rate}% exception rate`} />
        <StatCard label="Target" value="< 10%" detail="Exception rate goal" />
      </div>
      <Panel title="Documents by validation status">
        <DataTable
          rows={data.docs.slice(0, 20)}
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

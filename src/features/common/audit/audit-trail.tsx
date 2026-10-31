"use client";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getAuditLogs } from "@/lib/api/audit.service";
import { Badge, DataTable, ErrorState, LoadingState, PageHeader, Panel } from "@/components/common/ui";
import { formatDate } from "@/components/common/ui";

export function AuditTrailPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(() => getAuditLogs(user), user.id);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  return (
    <>
      <PageHeader
        eyebrow="AUDIT TRAIL"
        title="Audit trail"
        description="History of document processing, validation decisions, and user actions in this workspace."
      />
      <Panel title="Recent activity">
        <DataTable
          rows={data.slice(0, 30)}
          rowKey={(a) => a.id}
          columns={[
            { label: "Action", render: (a) => a.action },
            { label: "User", render: (a) => a.user },
            { label: "Resource", render: (a) => a.resource },
            { label: "When", render: (a) => formatDate(a.timestamp) },
          ]}
        />
      </Panel>
    </>
  );
}

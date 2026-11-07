"use client";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments, getExceptions } from "@/lib/api/document.service";
import { Badge, DataTable, ErrorState, LoadingState, PageHeader, Panel, StatCard } from "@/components/common/ui";

const PASSED = new Set(["VALIDATED", "STANDARDISED", "COMPLETED"]);
const NEEDS_REVIEW = new Set(["EXCEPTION", "IN_REVIEW", "FAILED"]);

export function ValidationOverviewPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(async () => {
    const [docs, exceptions] = await Promise.all([
      getDocuments(user),
      getExceptions(user),
    ]);
    return { docs, exceptions };
  }, user.id);

  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const total = data.docs.length || 1;
  const validated = data.docs.filter((d) => PASSED.has(d.status)).length;
  const open = data.exceptions.filter((e) => e.status !== "RESOLVED").length;
  const exceptionRate = Math.round((open / total) * 100);
  const validatedRate = Math.round((validated / total) * 100);

  const rows = data.docs.map((doc) => {
    const docExceptions = data.exceptions.filter((e) => e.documentId === doc.id);
    const openForDoc = docExceptions.filter((e) => e.status !== "RESOLVED").length;
    const passed = PASSED.has(doc.status) && openForDoc === 0;
    const rate = passed ? 100 : openForDoc > 0 ? Math.max(0, 100 - openForDoc * 25) : NEEDS_REVIEW.has(doc.status) ? 0 : 50;
    return { ...doc, openForDoc, rate, passed };
  });

  return (
    <>
      <PageHeader
        eyebrow="VALIDATION"
        title="Validation overview"
        description="Company-wide validation performance. Exception rate should stay below 10%."
      />
      <div className="stats-grid">
        <StatCard label="Documents checked" value={data.docs.length} />
        <StatCard label="Validated" value={validated} detail={`${validatedRate}%`} />
        <StatCard label="Open exceptions" value={open} detail={`${exceptionRate}% exception rate`} />
        <StatCard label="Target" value="< 10%" detail="Exception rate goal" />
      </div>
      <Panel title="Documents by validation status">
        <DataTable
          rows={rows}
          rowKey={(d) => d.id}
          columns={[
            { label: "Document", render: (d) => d.name },
            { label: "Type", render: (d) => d.type },
            { label: "Status", render: (d) => <Badge>{d.status}</Badge> },
            { label: "Open exceptions", render: (d) => d.openForDoc },
            {
              label: "Validation",
              render: (d) => (
                <span style={{ fontWeight: 650, color: d.passed ? "#1d6abd" : d.openForDoc > 0 ? "#c2410c" : "#5e7384" }}>
                  {d.passed ? "Passed" : d.openForDoc > 0 ? "Needs review" : d.status}
                </span>
              ),
            },
            { label: "Rate", render: (d) => `${d.rate}%` },
          ]}
        />
      </Panel>
    </>
  );
}

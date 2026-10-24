"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { StandardisedRecord, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getStandardisedRecords } from "@/lib/api/record.service";
import { decimalDisplay as money } from "@/lib/api/document-contract";
import {
  Badge,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  SearchInput,
  formatDate,
} from "@/components/common/ui";

type Flow = "in" | "out";

const CATEGORY: Record<Flow, StandardisedRecord["category"]> = {
  in: "ACCOUNTS_RECEIVABLE",
  out: "ACCOUNTS_PAYABLE",
};

export function MoneyFlowPage({
  user,
  flow,
}: {
  user: User;
  flow: Flow;
}) {
  const { data: records, error, loading, refresh } = useResource(
    () => getStandardisedRecords(user),
    user.id,
  );
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!records) return [];
    const target = CATEGORY[flow];
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (r.category !== target) return false;
      const invoice = r.extraction.fields.invoice?.value ?? "";
      const supplier = r.extraction.fields.supplier?.value ?? "";
      return `${r.id} ${invoice} ${supplier}`.toLowerCase().includes(q);
    });
  }, [records, flow, search]);

  const total = useMemo(() => {
    return filtered.reduce((sum, r) => {
      const raw = r.extraction.fields.total?.value ?? "0";
      const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [filtered]);

  if (loading) return <LoadingState />;
  if (error || !records) return <ErrorState message={error} retry={refresh} />;

  const title = flow === "in" ? "Money In" : "Money Out";
  const description =
    flow === "in"
      ? "Standardised sales and receipt records."
      : "Standardised bills and expense records.";

  return (
    <>
      <PageHeader title={title} description={description} />

      <div className="stats-row" style={{ marginBottom: 16 }}>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Records</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{filtered.length}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Total amount</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{money(String(total))}</div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by reference or contact…"
          />
        </div>
        <DataTable
          rows={filtered}
          rowKey={(r) => r.id}
          columns={[
            {
              label: "Record",
              render: (r) => (
                <div>
                  <strong>{r.id}</strong>
                  <small>{r.extraction.fields.invoice?.value ?? ""}</small>
                </div>
              ),
            },
            {
              label: "Contact",
              render: (r) => r.extraction.fields.supplier?.value ?? "—",
            },
            {
              label: "Date",
              render: (r) => r.extraction.fields.date?.value ?? formatDate(r.createdAt),
            },
            {
              label: "Amount",
              render: (r) => <strong>{money(r.extraction.fields.total?.value ?? "")}</strong>,
            },
            {
              label: "Status",
              render: (r) => <Badge>{r.status}</Badge>,
            },
            {
              label: "Validation",
              render: (r) => <Badge>{r.validation}</Badge>,
            },
            {
              label: "",
              render: (r) => (
                <a
                  className="text-link"
                  href={`/${user.role === "LOCAL_ADMIN" ? "company" : "workspace"}/documents/${r.documentId}`}
                >
                  Source <ArrowRight size={14} />
                </a>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}

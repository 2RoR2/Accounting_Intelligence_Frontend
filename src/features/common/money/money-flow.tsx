"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { User } from "@/types";
import type {
  BankMoneyTransactionDetail,
  MatchStatus,
  MoneyDirection,
} from "@/types/money";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  getMoneyTransactionDetail,
  getMoneyTransactions,
} from "@/lib/api/money.service";
import { decimalDisplay as money } from "@/lib/api/document-contract";
import {
  Badge,
  DataTable,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
} from "@/components/common/ui";

const MATCH_LABEL: Record<MatchStatus, string> = {
  unmatched: "Unmatched",
  proposed: "Proposed",
  matched: "Matched",
  ignored: "Ignored",
};

export function MoneyFlowPage({
  user,
  direction,
}: {
  user: User;
  direction: MoneyDirection;
}) {
  const { data: rows, error, loading, refresh } = useResource(
    () => getMoneyTransactions(user, direction),
    `${user.id}:${direction}`,
  );
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<BankMoneyTransactionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    const d = await getMoneyTransactionDetail(user, id);
    setDetail(d ?? null);
    setDetailLoading(false);
  };

  if (loading) return <LoadingState />;
  if (error || !rows) return <ErrorState message={error} retry={refresh} />;

  const q = search.toLowerCase();
  const filtered = rows.filter((r) =>
    `${r.description} ${r.reference ?? ""} ${r.relatedRecordCode ?? ""} ${r.relatedDocumentCode ?? ""} ${r.bankAccountRef ?? ""}`
      .toLowerCase()
      .includes(q),
  );
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
  const matched = filtered.filter((r) => r.matchStatus === "matched").length;

  const title = direction === "money_in" ? "Money In" : "Money Out";
  const description =
    direction === "money_in"
      ? "Bank statement credits. Verify each row against a standardised record."
      : "Bank statement debits. Verify each row against a standardised record.";

  const rolePath = user.role === "LOCAL_ADMIN" ? "company" : "workspace";

  return (
    <>
      <PageHeader title={title} description={description} />

      <div className="stats-row" style={{ marginBottom: 16 }}>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Bank rows</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{filtered.length}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Total amount</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{money(String(total), "MYR")}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Verified</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{matched}</div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search description, reference, bank or record…"
          />
        </div>
        <DataTable
          rows={filtered}
          rowKey={(r) => r.id}
          columns={[
            { label: "Date", render: (r) => r.postedDate },
            {
              label: "Bank description",
              render: (r) => <strong>{r.description}</strong>,
            },
            { label: "Reference", render: (r) => r.reference || "—" },
            { label: "Bank account", render: (r) => r.bankAccountRef || "—" },
            {
              label: "Amount",
              render: (r) => <strong>{money(String(r.amount), r.currency)}</strong>,
            },
            {
              label: "Verification",
              render: (r) => <Badge>{MATCH_LABEL[r.matchStatus] ?? r.matchStatus}</Badge>,
            },
            {
              label: "Related record",
              render: (r) => r.relatedRecordCode || "—",
            },
            {
              label: "",
              render: (r) => (
                <button
                  className="text-link"
                  type="button"
                  onClick={() => void openDetail(r.id)}
                >
                  Verify <ArrowRight size={14} />
                </button>
              ),
            },
          ]}
        />
      </Panel>

      {detail && (
        <Modal title={detail.description} onClose={() => setDetail(null)}>
          <div className="panel-body">
            {detailLoading && <LoadingState />}
            <p style={{ marginBottom: 12, color: "var(--muted)" }}>
              Bank statement row. Verify it against the related standardised record.
            </p>
            <div className="detail-list">
              <div>
                <span>Date</span>
                <strong>{detail.postedDate}</strong>
              </div>
              <div>
                <span>Direction</span>
                <strong>{detail.direction === "money_in" ? "Money In (credit)" : "Money Out (debit)"}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>{money(String(detail.amount), detail.currency)}</strong>
              </div>
              <div>
                <span>Reference</span>
                <strong>{detail.reference || "—"}</strong>
              </div>
              <div>
                <span>Bank account</span>
                <strong>{detail.bankAccountRef || "—"}</strong>
              </div>
              <div>
                <span>Verification</span>
                <Badge>{MATCH_LABEL[detail.matchStatus] ?? detail.matchStatus}</Badge>
              </div>
              <div>
                <span>Related record</span>
                <strong>{detail.relatedRecordCode || "Not matched yet"}</strong>
              </div>
              <div>
                <span>Related document</span>
                <strong>{detail.relatedDocumentCode || "—"}</strong>
              </div>
              {detail.amountDelta != null && (
                <div>
                  <span>Amount difference</span>
                  <strong>{money(String(detail.amountDelta), detail.currency)}</strong>
                </div>
              )}
            </div>

            {detail.relatedDocumentId && (
              <a
                className="btn"
                style={{ marginTop: 16 }}
                href={`/${rolePath}/documents/${detail.relatedDocumentId}`}
              >
                Open source document
              </a>
            )}
            {detail.relatedRecordId && (
              <a
                className="btn"
                style={{ marginTop: 8, marginLeft: 8 }}
                href={`/${rolePath}/records`}
              >
                View records
              </a>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

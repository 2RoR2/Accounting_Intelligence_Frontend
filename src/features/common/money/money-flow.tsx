"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { User } from "@/types";
import type { MoneyDirection, MoneyTransactionDetail } from "@/types/money";
import { useResource } from "@/features/common/hooks/use-resource";
import { getMoneyTransactionDetail, getMoneyTransactions } from "@/lib/api/money.service";
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
  formatDate,
} from "@/components/common/ui";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  ready: "Ready",
  void: "Void",
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
  const [detail, setDetail] = useState<MoneyTransactionDetail | null>(null);
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
    `${r.transactionNumber} ${r.referenceNumber ?? ""} ${r.customerName ?? ""} ${r.vendorName ?? ""}`
      .toLowerCase()
      .includes(q),
  );
  const total = filtered.reduce((s, r) => s + Number(r.itemTotal || 0), 0);

  const title = direction === "money_in" ? "Money In" : "Money Out";
  const description =
    direction === "money_in"
      ? "Receipts and customer payments."
      : "Payments and supplier bills.";

  return (
    <>
      <PageHeader title={title} description={description} />

      <div className="stats-row" style={{ marginBottom: 16 }}>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Transactions</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{filtered.length}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Item total</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{money(String(total))}</div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search number, reference or contact…"
          />
        </div>
        <DataTable
          rows={filtered}
          rowKey={(r) => r.id}
          columns={[
            { label: "Number", render: (r) => <strong>{r.transactionNumber}</strong> },
            { label: "Date", render: (r) => r.transactionDate },
            {
              label: "Contact",
              render: (r) => r.customerName || r.vendorName || "—",
            },
            { label: "Reference", render: (r) => r.referenceNumber || "—" },
            {
              label: "Amount",
              render: (r) => <strong>{money(String(r.itemTotal))}</strong>,
            },
            {
              label: "Status",
              render: (r) => <Badge>{STATUS_LABEL[r.status] ?? r.status}</Badge>,
            },
            {
              label: "",
              render: (r) => (
                <button className="text-link" type="button" onClick={() => void openDetail(r.id)}>
                  View <ArrowRight size={14} />
                </button>
              ),
            },
          ]}
        />
      </Panel>

      {detail && (
        <Modal title={detail.transactionNumber} onClose={() => setDetail(null)}>
          <div className="panel-body">
            {detailLoading && <LoadingState />}
            <div className="detail-list">
              <div><span>Date</span><strong>{detail.transactionDate}</strong></div>
              <div><span>Status</span><Badge>{STATUS_LABEL[detail.status]}</Badge></div>
              <div><span>Contact</span><strong>{detail.customerName || detail.vendorName || "—"}</strong></div>
              <div><span>Reference</span><strong>{detail.referenceNumber || "—"}</strong></div>
              <div><span>Item total</span><strong>{money(String(detail.itemTotal))}</strong></div>
              <div><span>Payment total</span><strong>{money(String(detail.paymentTotal))}</strong></div>
              <div><span>Fee total</span><strong>{money(String(detail.feeTotal))}</strong></div>
            </div>

            <h4 style={{ marginTop: 16 }}>Items</h4>
            <DataTable
              rows={detail.items}
              rowKey={(i) => i.id}
              columns={[
                { label: "Account", render: (i) => `${i.accountCode ?? ""} ${i.accountName ?? ""}`.trim() },
                { label: "Description", render: (i) => i.description || "—" },
                { label: "Amount", render: (i) => money(String(i.amount)) },
                { label: "Tax", render: (i) => i.taxCode || "—" },
              ]}
            />

            <h4 style={{ marginTop: 16 }}>Payments</h4>
            <DataTable
              rows={detail.payments}
              rowKey={(p) => p.id}
              columns={[
                { label: "Method", render: (p) => p.paymentMethodName || "—" },
                { label: "Bank / Cash", render: (p) => p.bankAccountName || "—" },
                { label: "Amount", render: (p) => money(String(p.amount)) },
                { label: "Fee", render: (p) => money(String(p.feeAmount)) },
                { label: "Ref", render: (p) => p.referenceNumber || "—" },
              ]}
            />

            {detail.sourceDocumentId && (
              <a
                className="btn"
                style={{ marginTop: 12 }}
                href={`/${user.role === "LOCAL_ADMIN" ? "company" : "workspace"}/documents/${detail.sourceDocumentId}`}
              >
                Source document
              </a>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

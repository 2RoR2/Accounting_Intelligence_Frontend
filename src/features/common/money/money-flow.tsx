"use client";

import { useRef, useState } from "react";
import { Trash2, UploadCloud } from "lucide-react";
import type { User } from "@/types";
import type {
  BankMoneyTransactionDetail,
  MatchStatus,
  MoneyDirection,
} from "@/types/money";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  decideMatch,
  deleteBankTransaction,
  getCashSummary,
  getMoneyTransactionDetail,
  getMoneyTransactions,
  importBankStatement,
} from "@/lib/api/money.service";
import { decimalDisplay as money } from "@/lib/api/document-contract";
import {
  Badge,
  DataTable,
  ErrorState,
  Filter,
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
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<BankMoneyTransactionDetail | null>(null);
  const [preview, setPreview] = useState<"document" | "record" | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: rows, error, loading, refresh } = useResource(
    () => getMoneyTransactions(user, direction),
    `${user.id}:${direction}:${refreshKey}`,
  );
  const { data: summary } = useResource(
    () => getCashSummary(user),
    `${user.id}:cash:${refreshKey}`,
  );

  const reload = () => setRefreshKey((k) => k + 1);

  const openDetail = async (id: string) => {
    setPreview(null);
    setDetailLoading(true);
    const d = await getMoneyTransactionDetail(user, id);
    setDetail(d ?? null);
    setDetailLoading(false);
  };

  const onDecide = async (decision: "confirm" | "reject") => {
    if (!detail) return;
    setBusy(true);
    const updated = await decideMatch(user, detail.id, decision);
    setBusy(false);
    if (updated) {
      setDetail(updated);
      setNotice(decision === "confirm" ? "Match confirmed." : "Match rejected.");
      reload();
    }
  };

  const onDelete = async (id: string) => {
    setBusy(true);
    const ok = await deleteBankTransaction(user, id);
    setBusy(false);
    if (ok) {
      setNotice("Bank row deleted.");
      setDetail(null);
      reload();
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setNotice("");
    const result = await importBankStatement(user, file.name);
    setBusy(false);
    setNotice(`Imported ${result.fileName}. ${result.added} bank rows added (demo).`);
    reload();
  };

  if (loading) return <LoadingState />;
  if (error || !rows) return <ErrorState message={error} retry={refresh} />;

  const q = search.toLowerCase();
  const filtered = rows.filter((r) => {
    const searchable = [
      r.description,
      r.reference ?? "",
      r.relatedRecordCode ?? "",
      r.relatedDocumentCode ?? "",
      r.bankAccountRef ?? "",
      r.postedDate,
      String(r.amount),
    ]
      .join(" ")
      .toLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (statusFilter && r.matchStatus !== statusFilter) return false;
    if (dateFrom && r.postedDate < dateFrom) return false;
    if (dateTo && r.postedDate > dateTo) return false;
    return true;
  });
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
  const matched = filtered.filter((r) => r.matchStatus === "matched").length;
  const cashNet = (summary?.moneyIn ?? 0) - (summary?.moneyOut ?? 0);

  const title = direction === "money_in" ? "Money In" : "Money Out";
  const description =
    direction === "money_in"
      ? "Bank statement credits. Import a statement, then review each row against a standardised record."
      : "Bank statement debits. Import a statement, then review each row against a standardised record.";

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".csv,.pdf,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void onImport(file);
                e.target.value = "";
              }}
            />
            <button
              className="btn primary"
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <UploadCloud size={16} /> Import bank statement
            </button>
          </>
        }
      />

      {notice && (
        <div className="notice success" style={{ marginBottom: 12 }}>
          {notice}
        </div>
      )}

      <Panel className="cash-summary-panel">
        <div
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, #2a3a4a 0%, #3d5166 100%)",
            color: "#f6f1e8",
            borderRadius: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 13, letterSpacing: 0.4, opacity: 0.8 }}>
              CASH SUMMARY (MONEY IN − MONEY OUT)
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, marginTop: 4 }}>
              {money(String(cashNet), "MYR")}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              Not a profit & loss statement — cash movement only
            </div>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Money In</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {money(String(summary?.moneyIn ?? 0), "MYR")}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Money Out</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {money(String(summary?.moneyOut ?? 0), "MYR")}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div
        className="stats-row"
        style={{
          margin: "16px 0",
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Bank rows</small>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{filtered.length}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>This page total</small>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{money(String(total), "MYR")}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Verified</small>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{matched}</div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="filter-bar" style={{ flexWrap: "wrap", gap: 8 }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search description, reference, bank, record, date or amount…"
          />
          <input
            aria-label="From date"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ minWidth: 150 }}
          />
          <input
            aria-label="To date"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ minWidth: 150 }}
          />
          <Filter
            label="Statuses"
            value={statusFilter}
            onChange={setStatusFilter}
            options={["matched", "proposed", "unmatched", "ignored"]}
          />
          {(search || dateFrom || dateTo || statusFilter) && (
            <button
              className="btn small"
              type="button"
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setStatusFilter("");
              }}
            >
              Clear
            </button>
          )}
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
              label: "Action",
              render: (r) => (
                <button
                  className="btn small"
                  type="button"
                  onClick={() => void openDetail(r.id)}
                >
                  Review
                </button>
              ),
            },
          ]}
        />
      </Panel>

      {detail && (
        <Modal title={detail.description} onClose={() => setDetail(null)}>
          <div
            className="panel-body"
            style={{ maxHeight: "70vh", overflowY: "auto", paddingBottom: 24 }}
          >
            {detailLoading && <LoadingState />}
            <p style={{ marginBottom: 12, color: "var(--muted)" }}>
              Bank statement row. Compare it with the related standardised record, then confirm or reject.
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

            {preview === "document" && detail.relatedDocumentCode && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  border: "1px solid var(--line, #e5e0d8)",
                  borderRadius: 8,
                  background: "#faf8f5",
                }}
              >
                <strong>Source document (demo)</strong>
                <div className="detail-list" style={{ marginTop: 8 }}>
                  <div><span>Code</span><strong>{detail.relatedDocumentCode}</strong></div>
                  <div><span>Type</span><strong>{detail.relatedDocumentCode.startsWith("INVOICE") ? "Invoice" : "Bill"}</strong></div>
                  <div><span>Total</span><strong>{money(String(detail.amount), detail.currency)}</strong></div>
                  <div><span>Status</span><Badge>VALIDATED</Badge></div>
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
                  Dummy preview for the client demo. The real document opens from the documents list once the backend is connected.
                </p>
              </div>
            )}

            {preview === "record" && detail.relatedRecordCode && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  border: "1px solid var(--line, #e5e0d8)",
                  borderRadius: 8,
                  background: "#faf8f5",
                }}
              >
                <strong>Standardised record (demo)</strong>
                <div className="detail-list" style={{ marginTop: 8 }}>
                  <div><span>Record</span><strong>{detail.relatedRecordCode}</strong></div>
                  <div><span>Document</span><strong>{detail.relatedDocumentCode || "—"}</strong></div>
                  <div><span>Amount</span><strong>{money(String(detail.amount), detail.currency)}</strong></div>
                  <div><span>Status</span><Badge>STANDARDISED</Badge></div>
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
                  Dummy preview for the client demo. The real record opens from the records list once the backend is connected.
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button
                className="btn primary"
                type="button"
                disabled={busy || detail.matchStatus === "matched" || !detail.relatedRecordId}
                onClick={() => void onDecide("confirm")}
              >
                Confirm match
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || detail.matchStatus === "unmatched"}
                onClick={() => void onDecide("reject")}
              >
                Reject
              </button>
              {detail.relatedDocumentId && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setPreview(preview === "document" ? null : "document")}
                >
                  Open source document
                </button>
              )}
              {detail.relatedRecordId && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setPreview(preview === "record" ? null : "record")}
                >
                  View record
                </button>
              )}
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void onDelete(detail.id)}
                style={{ marginLeft: "auto", color: "#b42318" }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { ArrowRight, UploadCloud } from "lucide-react";
import type { User } from "@/types";
import type {
  BankMoneyTransactionDetail,
  MatchStatus,
  MoneyDirection,
} from "@/types/money";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  decideMatch,
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
  const [detail, setDetail] = useState<BankMoneyTransactionDetail | null>(null);
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
      ? "Bank statement credits. Import a statement, then verify each row against a standardised record."
      : "Bank statement debits. Import a statement, then verify each row against a standardised record.";

  const rolePath = user.role === "LOCAL_ADMIN" ? "company" : "workspace";

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

      <div className="stats-row" style={{ marginBottom: 16 }}>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Bank rows</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{filtered.length}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>This page total</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{money(String(total), "MYR")}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Verified</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{matched}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: "12px 16px" }}>
            <small style={{ color: "var(--muted)" }}>Cash summary (in − out)</small>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              {money(String((summary?.moneyIn ?? 0) - (summary?.moneyOut ?? 0)), "MYR")}
            </div>
            <small style={{ color: "var(--muted)" }}>
              In {money(String(summary?.moneyIn ?? 0), "MYR")} · Out {money(String(summary?.moneyOut ?? 0), "MYR")}
            </small>
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
                <a
                  className="btn"
                  href={`/${rolePath}/documents/${detail.relatedDocumentId}`}
                >
                  Open source document
                </a>
              )}
              {detail.relatedRecordId && (
                <a className="btn" href={`/${rolePath}/records`}>
                  View records
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

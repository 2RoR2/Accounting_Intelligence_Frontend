"use client";

import { useEffect, useRef, useState } from "react";
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
  discardBankImportPreview,
  confirmBankImport,
  getCashSummary,
  getMoneyTransactionDetail,
  getMoneyTransactions,
  ignoreBankTransaction,
  previewBankImport,
  type BankImportPreview,
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

type ImportColumn = "posted_date" | "value_date" | "description" | "reference" | "debit" | "credit" | "currency";
const IMPORT_COLUMNS: Array<{ key: ImportColumn; label: string; required: boolean }> = [
  { key: "posted_date", label: "Posted date", required: true },
  { key: "value_date", label: "Value date", required: false },
  { key: "description", label: "Description", required: true },
  { key: "reference", label: "Reference", required: false },
  { key: "debit", label: "Debit (Money Out)", required: true },
  { key: "credit", label: "Credit (Money In)", required: true },
  { key: "currency", label: "Currency", required: true },
];

function csvHeaders(text: string): string[] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const headers: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i];
    if (char === '"' && quoted && firstLine[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      headers.push(value.trim());
      value = "";
    } else value += char;
  }
  headers.push(value.trim());
  if (quoted || headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("The CSV needs one header row with unique, non-empty column names.");
  }
  return headers;
}

function guessColumn(headers: string[], key: ImportColumn): string {
  const normalized = (header: string) => header.toLowerCase().replace(/[^a-z]/g, "");
  const matches: Record<ImportColumn, string[]> = {
    posted_date: ["date", "transactiondate", "posteddate", "bookingdate"],
    value_date: ["valuedate"],
    description: ["description", "details", "narrative", "transactiondetails"],
    reference: ["reference", "ref", "transactionreference"],
    debit: ["debit", "withdrawal", "moneyout"],
    credit: ["credit", "deposit", "moneyin"],
    currency: ["currency", "ccy"],
  };
  return headers.find((header) => matches[key].includes(normalized(header))) ?? "";
}

function addDecimalValues(values: Array<string | null | undefined>): string {
  const cents = values.reduce((total, value) => {
    if (!value || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return total;
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return total + (negative ? -amount : amount);
  }, 0n);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

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
  const [statusOpen, setStatusOpen] = useState(false);
  const [detail, setDetail] = useState<BankMoneyTransactionDetail | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<Record<ImportColumn, string>>({
    posted_date: "", value_date: "", description: "", reference: "", debit: "", credit: "", currency: "",
  });
  const [accountRef, setAccountRef] = useState("");
  const [dateFormat, setDateFormat] = useState<"" | "iso" | "dmy" | "mdy">("");
  const [importPreview, setImportPreview] = useState<BankImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!statusRef.current?.contains(event.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

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
    setActionError("");
    setDecisionReason("");
    setDetailLoading(true);
    try {
      const d = await getMoneyTransactionDetail(user, id);
      setDetail(d ?? null);
      setSelectedCandidateId(d?.candidateId ?? d?.candidates?.find((candidate) => candidate.status === "proposed")?.id ?? "");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to load the bank row.");
    } finally {
      setDetailLoading(false);
    }
  };

  const onDecide = async (decision: "confirm" | "reject") => {
    const candidate = detail?.candidates?.find((item) => item.id === selectedCandidateId);
    if (!detail || detail.status !== "proposed" || !candidate || candidate.status !== "proposed" || !selectedCandidateId) return;
    if (decision === "reject" && !decisionReason.trim()) {
      setActionError("Enter a reason before rejecting a proposed match.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const updated = await decideMatch(user, selectedCandidateId, decision, candidate.revision, decisionReason);
      setDetail(updated);
      setSelectedCandidateId(updated.candidateId ?? "");
      setDecisionReason("");
      setNotice(decision === "confirm" ? "Match confirmed." : "Match rejected.");
      reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The reconciliation decision was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusy(true);
    setActionError("");
    try {
      const ok = await ignoreBankTransaction(user, id);
      if (!ok) throw new Error("The bank row was not marked as ignored.");
      setNotice("Bank row ignored. Its imported evidence is retained.");
      setDetail(null);
      reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to ignore the bank row.");
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setActionError("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setActionError("Bank statement import currently supports CSV files only.");
      return;
    }
    try {
      const headers = csvHeaders(await file.text());
      setImportFile(file);
      setImportHeaders(headers);
      setImportMapping(Object.fromEntries(IMPORT_COLUMNS.map(({ key }) => [key, guessColumn(headers, key)])) as Record<ImportColumn, string>);
      setImportPreview(null);
      setAccountRef("");
      setDateFormat("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to read the CSV header.");
    }
  };

  const prepareImport = async () => {
    if (!importFile || !dateFormat || !accountRef.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      const mapping = Object.fromEntries(Object.entries(importMapping).filter(([, header]) => header)) as Record<string, string>;
      const preview = await previewBankImport(user, importFile, accountRef.trim(), mapping, dateFormat);
      setImportPreview(preview);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to preview the bank statement.");
    } finally {
      setBusy(false);
    }
  };

  const finishImport = async (confirm: boolean) => {
    if (!importPreview) return;
    setBusy(true);
    setActionError("");
    try {
      if (confirm) {
        const result = await confirmBankImport(user, importPreview.importId);
        setNotice(`Imported ${result.rowCount} bank rows. ${result.candidatesProposed} exact match candidates need review.`);
      } else {
        await discardBankImportPreview(user, importPreview.importId);
        setNotice("Bank import preview discarded; source rows remain retained as ignored evidence.");
      }
      setImportFile(null);
      setImportPreview(null);
      reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to complete the bank import.");
    } finally {
      setBusy(false);
    }
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
  const matched = filtered.filter((r) => r.matchStatus === "matched").length;
  const pageTotals = Array.from(new Set(filtered.map((row) => row.currency ?? ""))).map((currency) => ({
    currency: currency || null,
    amount: addDecimalValues(filtered.filter((row) => (row.currency ?? "") === currency).map((row) => row.amount)),
  }));

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
              accept=".csv,text/csv"
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
        <div
          className="notice success"
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#e8f6ee",
            color: "#0f6b3c",
            border: "1px solid #b7e4c7",
            fontWeight: 500,
          }}
        >
          {notice}
        </div>
      )}

      {actionError && <p role="alert" className="error-text">{actionError}</p>}

      <Panel className="cash-summary-panel">
        <div style={{ padding: 20, background: "linear-gradient(135deg, #2a3a4a 0%, #3d5166 100%)", color: "#f6f1e8", borderRadius: 12 }}>
          <div style={{ fontSize: 13, letterSpacing: 0.4, opacity: 0.8 }}>CASH SUMMARY BY CURRENCY</div>
          <div style={{ fontSize: 13, opacity: 0.85, margin: "4px 0 14px" }}>Cash movement only; this is not a profit and loss statement.</div>
          {summary?.currencies.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {summary.currencies.map((item) => {
              const currency = item.currency;
              const label = currency ?? "Currency unavailable";
              const net = currency ? addDecimalValues([item.moneyIn, `-${item.moneyOut}`]) : null;
              return <div key={label} style={{ borderTop: "1px solid rgba(255,255,255,.25)", paddingTop: 10 }}>
                <strong>{label}</strong>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}><span>Money In</span><strong>{money(item.moneyIn, currency)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>Money Out</span><strong>{money(item.moneyOut, currency)}</strong></div>
                {net !== null && <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>Net movement</span><strong>{money(net, currency)}</strong></div>}
              </div>;
            })}
          </div> : <p style={{ margin: 0 }}>No imported bank transactions yet.</p>}
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
            <div style={{ fontSize: 18, fontWeight: 600 }}>{pageTotals.length ? pageTotals.map((item) => <div key={item.currency ?? "none"}>{money(item.amount, item.currency)}</div>) : "—"}</div>
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
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            Search covers bank description, reference, bank account, related record, related document, date and amount.
          </div>
          <div className="filter-bar" style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div style={{ minWidth: 260, flex: "1 1 260px" }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                Search
              </label>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Description, reference, bank, record…"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                Date from
              </label>
              <input
                aria-label="Date from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ minWidth: 150 }}
              />
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 8 }}>until</div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                Date to
              </label>
              <input
                aria-label="Date to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ minWidth: 150 }}
              />
            </div>
            <div ref={statusRef} style={{ position: "relative" }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                Verification
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => setStatusOpen((open) => !open)}
                aria-expanded={statusOpen}
                style={{ minWidth: 150, justifyContent: "space-between" }}
              >
                {statusFilter ? MATCH_LABEL[statusFilter as MatchStatus] : "All statuses"}
              </button>
              {statusOpen && (
                <div
                  role="listbox"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: 160,
                    background: "#fff",
                    border: "1px solid #e5e0d8",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(42, 58, 74, 0.12)",
                    zIndex: 20,
                    padding: 4,
                  }}
                >
                  {[
                    ["", "All statuses"],
                    ["matched", "Matched"],
                    ["proposed", "Proposed"],
                    ["unmatched", "Unmatched"],
                    ["ignored", "Ignored"],
                  ].map(([value, label]) => (
                    <button
                      key={value || "all"}
                      type="button"
                      role="option"
                      aria-selected={statusFilter === value}
                      onClick={() => {
                        setStatusFilter(value);
                        setStatusOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: 0,
                        background: statusFilter === value ? "#2a3a4a" : "transparent",
                        color: statusFilter === value ? "#f6f1e8" : "#2a3a4a",
                        borderRadius: 6,
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                style={{ marginBottom: 2 }}
              >
                Clear filters
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 12px" }}>
            Date filter uses the bank row Date column. Showing {filtered.length} of {rows.length} rows.
          </div>
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
              render: (r) => <strong>{money(r.amount, r.currency)}</strong>,
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

      {importFile && (
        <Modal title={importPreview ? "Review bank statement import" : "Map bank statement columns"} onClose={() => {
          if (busy) return;
          if (importPreview) setActionError("Choose Confirm import or Discard preview to close this review.");
          else setImportFile(null);
        }}>
          <div className="panel-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {!importPreview ? <>
              <p>CSV only. Check the column mapping and choose the date format used by this statement. The account label should be a name such as “Main current account”, not an account number.</p>
              <p><strong>File:</strong> {importFile.name}</p>
              <label style={{ display: "block", margin: "12px 0" }}>Bank account label
                <input value={accountRef} onChange={(event) => setAccountRef(event.target.value)} maxLength={64} placeholder="Main current account" style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ display: "block", margin: "12px 0" }}>Date format
                <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as typeof dateFormat)} style={{ display: "block", width: "100%", marginTop: 4 }}>
                  <option value="">Choose date format</option><option value="iso">YYYY-MM-DD</option><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option>
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                {IMPORT_COLUMNS.map(({ key, label, required }) => <label key={key}>{label}{required ? " *" : " (optional)"}
                  <select value={importMapping[key]} onChange={(event) => setImportMapping((current) => ({ ...current, [key]: event.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }}>
                    <option value="">{required ? "Choose column" : "Not mapped"}</option>
                    {importHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>)}
              </div>
              <div className="modal-actions" style={{ marginTop: 18 }}>
                <button className="btn" type="button" disabled={busy} onClick={() => setImportFile(null)}>Cancel</button>
                <button className="btn primary" type="button" disabled={busy || !accountRef.trim() || !dateFormat || IMPORT_COLUMNS.some(({ key, required }) => required && !importMapping[key])} onClick={() => void prepareImport()}>{busy ? "Reading statement…" : "Preview rows"}</button>
              </div>
            </> : <>
              <p>{importPreview.rowCount} new rows; {importPreview.duplicateRowsSkipped} duplicates skipped; {importPreview.needsReviewCount} rows need review. Confirming imports the rows and proposes only exact candidate matches.</p>
              {importPreview.sampleRows.length > 0 && <div style={{ overflowX: "auto" }}><table><thead><tr><th>Row</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Currency</th><th>Import state</th></tr></thead><tbody>
                {importPreview.sampleRows.map((row) => <tr key={row.sourceRow}><td>{row.sourceRow}</td><td>{row.postedDate ?? "—"}</td><td>{row.description || "—"}</td><td>{row.debit ?? "—"}</td><td>{row.credit ?? "—"}</td><td>{row.currency ?? "—"}</td><td>{row.status === "needs_review" ? `Needs review: ${row.reviewReasons.join(", ")}` : row.direction === "money_in" ? "Money In" : "Money Out"}</td></tr>)}
              </tbody></table></div>}
              <div className="modal-actions" style={{ marginTop: 18 }}>
                <button className="btn" type="button" disabled={busy} onClick={() => void finishImport(false)}>Discard preview</button>
                <button className="btn primary" type="button" disabled={busy || !importPreview.canConfirm} onClick={() => void finishImport(true)}>{busy ? "Saving…" : "Confirm import"}</button>
              </div>
            </>}
            {actionError && <p role="alert" className="error-text" style={{ marginTop: 12 }}>{actionError}</p>}
          </div>
        </Modal>
      )}

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
                <strong>{money(detail.amount, detail.currency)}</strong>
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
            </div>

            {(detail.candidates?.length ?? 0) > 0 && <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontWeight: 600 }}>Reconciliation candidate
                <select value={selectedCandidateId} onChange={(event) => setSelectedCandidateId(event.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
                  {detail.candidates?.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.status !== "proposed" || detail.status !== "proposed"}>
                    {candidate.recordCode} — {candidate.category.replace(/_/g, " ")} — {candidate.currency ?? "Unknown currency"} {candidate.amount ?? "amount unavailable"} ({candidate.status})
                  </option>)}
                </select>
              </label>
              {(() => {
                const candidate = detail.candidates?.find((item) => item.id === selectedCandidateId);
                return candidate ? <div className="detail-list" style={{ marginTop: 10 }}>
                  <div><span>Record reference</span><strong>{candidate.reference ?? "—"}</strong></div>
                  <div><span>Party</span><strong>{candidate.party ?? "—"}</strong></div>
                  <div><span>Candidate amount</span><strong>{money(candidate.amount, candidate.currency)}</strong></div>
                  <div><span>Amount difference</span><strong>{money(candidate.amountDelta, candidate.currency)}</strong></div>
                  <div><span>Match evidence</span><strong>{candidate.reasons.join(", ") || "No reason supplied"}</strong></div>
                  {candidate.dateDeltaDays !== null && <div><span>Date difference</span><strong>{candidate.dateDeltaDays} days</strong></div>}
                </div> : <p>No proposed candidate is available. This row needs manual review.</p>;
              })()}
            </div>}

            <label style={{ display: "block", marginTop: 14 }}>Decision note{selectedCandidateId ? " (required when rejecting)" : ""}
              <textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} maxLength={2000} rows={3} style={{ display: "block", width: "100%", marginTop: 4 }} placeholder="Explain the review decision" />
            </label>
            {actionError && <p role="alert" className="error-text">{actionError}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button
                className="btn primary"
                type="button"
                disabled={busy || detail.status !== "proposed" || !selectedCandidateId || detail.candidates?.find((item) => item.id === selectedCandidateId)?.status !== "proposed"}
                onClick={() => void onDecide("confirm")}
              >
                Confirm match
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || detail.status !== "proposed" || !selectedCandidateId || detail.candidates?.find((item) => item.id === selectedCandidateId)?.status !== "proposed" || !decisionReason.trim()}
                onClick={() => void onDecide("reject")}
              >
                Reject
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || !(detail.status === "imported" || detail.status === "needs_review")}
                onClick={() => void onDelete(detail.id)}
                style={{ marginLeft: "auto", color: "#b42318" }}
              >
                <Trash2 size={14} /> Ignore row
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

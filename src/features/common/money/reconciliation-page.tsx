"use client";
import Link from "next/link";
import { CheckCircle2, Landmark, Sparkles, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge, Modal, PageHeader, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  confirmBankImport,
  decideMatch,
  discardBankImportPreview,
  getMoneyTransactions,
  previewBankImport,
  type BankImportPreview,
} from "@/lib/api/money.service";
import type { BankReconciliationCandidate, BankMoneyTransaction, User } from "@/types";

type ImportColumn = "posted_date" | "value_date" | "description" | "reference" | "debit" | "credit" | "currency";
const IMPORT_COLUMNS: Array<{ key: ImportColumn; label: string; required: boolean }> = [
  { key: "posted_date", label: "Posted date", required: true },
  { key: "value_date", label: "Value date", required: false },
  { key: "description", label: "Description", required: true },
  { key: "reference", label: "Reference", required: false },
  { key: "debit", label: "Debit (Money Out)", required: true },
  { key: "credit", label: "Credit (Money In)", required: true },
  { key: "currency", label: "Currency", required: false },
];

function csvHeaders(text: string): string[] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const headers: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i];
    if (char === '"' && quoted && firstLine[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { headers.push(value.trim()); value = ""; }
    else value += char;
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

export function ReconciliationPage({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, loading, error, refresh } = useResource(
    () => Promise.all([getMoneyTransactions(user, "money_in"), getMoneyTransactions(user, "money_out")]),
    "reconciliation",
  );
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<Record<ImportColumn, string>>({
    posted_date: "", value_date: "", description: "", reference: "", debit: "", credit: "", currency: "",
  });
  const [accountRef, setAccountRef] = useState("");
  const [dateFormat, setDateFormat] = useState<"" | "iso" | "dmy" | "mdy">("");
  const [defaultCurrency, setDefaultCurrency] = useState("MYR");
  const [importPreview, setImportPreview] = useState<BankImportPreview | null>(null);
  const rows = useMemo(() => (data ?? []).flat().filter((row) => row.candidates?.some((candidate) => candidate.status === "proposed")), [data]);

  async function onImport(file: File | undefined) {
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
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to read the CSV header.");
    }
  }

  async function prepareImport() {
    if (!importFile || !dateFormat || !accountRef.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      const mapping = Object.fromEntries(Object.entries(importMapping).filter(([, header]) => header)) as Record<string, string>;
      setImportPreview(await previewBankImport(user, importFile, accountRef.trim(), mapping, dateFormat, defaultCurrency));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to preview the bank statement.");
    } finally {
      setBusy(false);
    }
  }

  async function finishImport(confirm: boolean) {
    if (!importPreview) return;
    setBusy(true);
    setActionError("");
    try {
      if (confirm) {
        const result = await confirmBankImport(user, importPreview.importId);
        setNotice(`Imported ${result.rowCount} bank rows. Credits went to Money In and debits to Money Out. ${result.candidatesProposed} exact matches need review.`);
      } else {
        await discardBankImportPreview(user, importPreview.importId);
        setNotice("Bank import preview discarded.");
      }
      setImportFile(null);
      setImportPreview(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to complete the bank import.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(row: BankMoneyTransaction, candidate: BankReconciliationCandidate, decision: "confirm" | "reject") {
    setBusyId(candidate.id); setNotice(""); setActionError("");
    try {
      await decideMatch(user, candidate.id, decision, candidate.revision, decision === "reject" ? "Rejected during reconciliation review" : undefined);
      setNotice(decision === "confirm" ? "Match confirmed." : "Candidate rejected.");
      await refresh();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Unable to save reconciliation decision."); }
    finally { setBusyId(null); }
  }

  return <>
    <PageHeader
      eyebrow="BANKING"
      title="Reconciliation"
      description="Upload a bank statement here. Credits are separated into Money In and debits into Money Out, then each row can be checked against the linked standardised record or original document."
      actions={
        <>
          <input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ""; }} />
          <button className="btn primary" type="button" disabled={busy} onClick={() => fileRef.current?.click()}><UploadCloud size={16} /> Upload bank statement</button>
        </>
      }
    />
    {notice && <div className="notice success" role="status">{notice}</div>}
    {actionError && <p className="error-text" role="alert">{actionError}</p>}
    <div className="reconciliation-stats">
      <div><span>Needs review</span><strong>{rows.length}</strong><small>Proposed matches</small></div>
      <div><span>Banking workflow</span><strong><CheckCircle2 size={22} /> Ready</strong><small>Confirm or reject each match</small></div>
      <div><span>Next step</span><strong><Landmark size={22} /> Upload</strong><small>Bring in a bank statement</small></div>
    </div>
    <Panel title="Proposed matches" subtitle={user.role === "LOCAL_ADMIN" ? "All bank statements uploaded for this company." : "Confirm a match only when the bank row and record agree."}>
      {loading && <p className="loading-state">Loading reconciliation candidates…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && rows.length === 0 && <div className="reconciliation-empty"><div className="reconciliation-empty-icon"><Sparkles size={24} /></div><h3>No matches need review yet</h3><p>Upload a bank statement to compare transactions against standardised records.</p></div>}
      {!loading && rows.length > 0 && <div className="reconciliation-list">
        {rows.flatMap((row) => (row.candidates ?? []).filter((candidate) => candidate.status === "proposed").map((candidate) => <div className="reconciliation-card" key={candidate.id}>
          <div className="reconciliation-card-heading"><div><strong>{row.description || "Bank transaction"}</strong><span>{row.postedDate} · {row.direction === "money_in" ? "Money In" : "Money Out"}</span></div><Badge>PROPOSED</Badge></div>
          <div className="reconciliation-card-grid">
            <div><span>Bank amount</span><strong>{row.currency ?? ""} {row.amount ?? "—"}</strong></div>
            <div><span>Record</span><strong>{candidate.recordId ? <Link href={`${base}/records/${candidate.recordId}`}>{candidate.recordCode}</Link> : candidate.recordCode}</strong></div>
            <div><span>Original document</span><strong>{candidate.documentId ? <Link href={`${base}/documents/${candidate.documentId}`}>{candidate.documentCode || "Open document"}</Link> : "—"}</strong></div>
            <div><span>Candidate amount</span><strong>{candidate.currency ?? ""} {candidate.amount ?? "—"}</strong></div>
            <div><span>Reason</span><strong>{candidate.reasons.join(", ") || "Suggested match"}</strong></div>
          </div>
          <div className="reconciliation-actions">
            <button className="btn primary" disabled={busyId === candidate.id} onClick={() => void decide(row, candidate, "confirm")}>Confirm match</button>
            <button className="btn" disabled={busyId === candidate.id} onClick={() => void decide(row, candidate, "reject")}>Reject</button>
          </div>
        </div>))}
      </div>}
    </Panel>

    {importFile && (
      <Modal title={importPreview ? "Review bank statement import" : "Map bank statement columns"} onClose={() => {
        if (busy) return;
        if (importPreview) setActionError("Choose Confirm import or Discard preview to close this review.");
        else setImportFile(null);
      }}>
        <div className="panel-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {!importPreview ? <>
            <p>Upload the statement once. Credits are separated into Money In and debits into Money Out.</p>
            <p><strong>File:</strong> {importFile.name}</p>
            <label style={{ display: "block", margin: "12px 0" }}>Bank account label
              <input value={accountRef} onChange={(event) => setAccountRef(event.target.value)} maxLength={64} placeholder="Main current account" style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
            <label style={{ display: "block", margin: "12px 0" }}>Date format
              <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as typeof dateFormat)} style={{ display: "block", width: "100%", marginTop: 4 }}>
                <option value="">Choose date format</option><option value="iso">YYYY-MM-DD</option><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option>
              </select>
            </label>
            <label style={{ display: "block", margin: "12px 0" }}>Default currency
              <input value={defaultCurrency} onChange={(event) => setDefaultCurrency(event.target.value.toUpperCase())} maxLength={3} placeholder="MYR" style={{ display: "block", width: "100px", marginTop: 4 }} />
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
            <p>{importPreview.rowCount} new rows; {importPreview.duplicateRowsSkipped} duplicates skipped; {importPreview.needsReviewCount} rows need review. Confirming separates the rows into Money In and Money Out.</p>
            {importPreview.sampleRows.length > 0 && <div style={{ overflowX: "auto" }}><table><thead><tr><th>Row</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Currency</th><th>Goes to</th></tr></thead><tbody>
              {importPreview.sampleRows.map((row) => <tr key={row.sourceRow}><td>{row.sourceRow}</td><td>{row.postedDate ?? "—"}</td><td>{row.description || "—"}</td><td>{row.debit ?? "—"}</td><td>{row.credit ?? "—"}</td><td>{row.currency ?? "—"}</td><td>{row.direction === "money_in" ? "Money In" : "Money Out"}</td></tr>)}
            </tbody></table></div>}
            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button className="btn" type="button" disabled={busy} onClick={() => void finishImport(false)}>Discard preview</button>
              <button className="btn primary" type="button" disabled={busy || !importPreview.canConfirm} onClick={() => void finishImport(true)}>{busy ? "Importing…" : "Confirm import"}</button>
            </div>
          </>}
        </div>
      </Modal>
    )}
  </>;
}

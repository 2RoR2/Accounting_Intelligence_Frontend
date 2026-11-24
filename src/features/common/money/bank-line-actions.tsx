"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, Field, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { amountInCents, decimalAmount, documentGroup, documentHref } from "@/features/common/erp/document-logic";
import { decimalDisplay } from "@/lib/api/document-contract";
import { listCatalog, type DocumentType } from "@/lib/api/erp.service";
import { getLedgerAccounts } from "@/lib/api/ledger.service";
import {
  getBankPaymentPreview, getMoneyTransactionDetail, matchRecordedDocument, postBankPayment, recordBankExpense, searchMatchRecords,
  searchRecordedDocuments, unmatchRecordedDocument, type BankPaymentPosting, type ManualMatchRecord, type RecordedDocumentCandidate,
} from "@/lib/api/money.service";
import type { User } from "@/types";
import type { BankMoneyTransaction, BankMoneyTransactionDetail } from "@/types/money";
import {
  allocationCents, allocationTotals, bankPaymentNotPosted, canAllocateBankLine, canMatchRecord, canPostBankPayment,
  defaultAllocation, isUnallocated, MATCH_LIMIT, needsBankAccountChoice, needsBankMatchRefresh, PAYMENT_WAITING_FOR_ADMIN,
  submitBankAllocations,
} from "./allocation-logic";

type RunBankAction = (action: () => Promise<string>, fallback: string, resetDraft?: () => void) => Promise<void>;

export function bankLineMoney(value: string, currency?: string | null) {
  return !currency || currency === "MYR" ? money(value) : decimalDisplay(value, currency);
}

export function BankLineDocumentLink({ line, base }: { line: BankMoneyTransaction; base: string }) {
  if (line.recordedDocumentId && line.recordedDocumentType) {
    // A matched voucher or payment received opens under Purchases or Sales, a recorded money in/out under bank entries.
    const group = documentGroup(line.recordedDocumentType as DocumentType) ?? "bank-entries";
    return <Link href={documentHref(base, group, line.recordedDocumentType as DocumentType, line.recordedDocumentId)}>
      {line.recordedDocumentNumber || "Open document"}{line.recordedByMatch ? " (matched)" : ""}
    </Link>;
  }
  return line.relatedDocumentId
    ? <Link href={`${base}/documents/${line.relatedDocumentId}`}>{line.relatedDocumentCode || "Open document"}</Link>
    : "—";
}

/** The payment journal lines, as previewed before posting or as posted. */
export function PaymentJournalTable({ lines, currency }: { lines: BankPaymentPosting["lines"]; currency?: string | null }) {
  return <DataTable
    rows={lines.map((entry, index) => ({ ...entry, index }))}
    rowKey={(entry) => String(entry.index)}
    columns={[
      { label: "Account", render: (entry) => `${entry.code} ${entry.name}` },
      { label: "Description", render: (entry) => entry.description },
      { label: "Debit", render: (entry) => bankLineMoney(entry.debit, currency) },
      { label: "Credit", render: (entry) => bankLineMoney(entry.credit, currency) },
    ]}
  />;
}

export function BankLineActions({ user, line, busy, onBusyChange, onLineLoaded }: {
  user: User;
  line: BankMoneyTransactionDetail;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onLineLoaded: (line: BankMoneyTransactionDetail) => void;
}) {
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [payment, setPayment] = useState<BankPaymentPosting | null>(null);

  async function reloadLine() {
    setRefreshRequired(true);
    setRefreshError("");
    try {
      const updated = await getMoneyTransactionDetail(user, line.id);
      if (!updated || allocationCents(updated.allocatedAmount ?? "") === null || allocationCents(updated.remainingAmount ?? "") === null) {
        throw new Error("The bank line balances were unavailable.");
      }
      onLineLoaded(updated);
      setRefreshRequired(false);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : "Unable to reload the bank line.");
    }
  }

  const run: RunBankAction = async (action, fallback, resetDraft) => {
    if (busy || refreshRequired) return;
    onBusyChange(true);
    setFailure("");
    setNotice("");
    setPayment(null);
    try {
      try {
        setNotice(await action());
      } catch (e) {
        setFailure(e instanceof Error ? e.message : fallback);
        if (!needsBankMatchRefresh(e)) return;
        setNotice("Check the latest bank line before retrying.");
      }
      resetDraft?.();
      await reloadLine();
    } finally {
      onBusyChange(false);
    }
  };

  const canManage = user.role === "LOCAL_ADMIN" || user.role === "ACCOUNTANT";
  const canAllocate = canManage && canAllocateBankLine(line);
  const canPost = canPostBankPayment(user.role, line);
  const disabled = busy || refreshRequired;
  // A local admin sees the journal before posting it; the preview never writes anything.
  const preview = useResource(() => canPost ? getBankPaymentPreview(line.id) : Promise.resolve(undefined),
    `payment-preview:${line.id}:${line.allocatedAmount}:${line.paymentPosted ? 1 : 0}:${canPost ? 1 : 0}`);
  const waitingForAdmin = !canPost && !payment && bankPaymentNotPosted(line);
  function postPayment() {
    if (!canPost || disabled) return;
    void run(async () => {
      const posted = await postBankPayment(line.id);
      if (!posted) throw new Error("The payment posting response was unavailable.");
      setPayment(posted);
      return "";
    }, "Unable to post this payment.");
  }

  return <>
    {!refreshRequired && (allocationCents(line.allocatedAmount ?? "") ?? 0n) > 0n && <p role="status">
      Already matched {bankLineMoney(line.allocatedAmount, line.currency)} · Left to match {bankLineMoney(line.remainingAmount, line.currency)}
    </p>}
    {notice && <p role="status">{notice}</p>}
    {failure && <p className="notice danger" role="alert">{failure}</p>}
    {refreshError && <div className="notice danger" role="alert">
      <p>Unable to refresh the bank line. {refreshError}</p>
      <button className="btn small" type="button" disabled={busy} onClick={async () => {
        onBusyChange(true);
        try { await reloadLine(); } finally { onBusyChange(false); }
      }}>Reload bank line</button>
    </div>}
    {(canPost || line.paymentPosted || payment || waitingForAdmin) && <section className="transaction-review-section">
      <div className="transaction-review-section-heading"><h3>Ledger payment</h3></div>
      {(line.paymentPosted || payment) && <p role="status">Payment posted</p>}
      {waitingForAdmin && <p role="status"><strong>{PAYMENT_WAITING_FOR_ADMIN}.</strong> The match is saved. The payment
        reaches the ledger when a local admin posts it from &quot;Bank payments to post&quot; on the Dashboard.</p>}
      {payment && payment.lines.length > 0 && <PaymentJournalTable lines={payment.lines} currency={line.currency} />}
      {canPost && !payment && <>
        {preview.loading && !preview.data && <p role="status">Loading the payment journal…</p>}
        {preview.error && <p className="notice danger" role="alert">{preview.error}</p>}
        {preview.data && !preview.data.canPost && <p className="notice danger" role="alert">
          Cannot post this payment now: {preview.data.blockedReason}</p>}
        {preview.data?.canPost && <>
          <p>Journal to post on {preview.data.journalDate} (period {preview.data.periodCode}):</p>
          <PaymentJournalTable lines={preview.data.lines} currency={line.currency} />
        </>}
      </>}
      {canPost && <button type="button" className="btn primary" disabled={disabled || preview.data?.canPost === false}
        onClick={postPayment}>Post payment to ledger</button>}
    </section>}
    {canAllocate && isUnallocated(line) && <RecordBankLine line={line} busy={disabled} run={run} />}
    {canManage && line.recordedByMatch && line.recordedDocumentId && <UnmatchRecordedDocument line={line} busy={disabled} run={run} />}
    {canAllocate && isUnallocated(line) && <MatchRecordedDocument line={line} busy={disabled} run={run} />}
    {canAllocate && <MatchBankLine user={user} line={line} busy={disabled} run={run} />}
  </>;
}

function RecordBankLine({ line, busy, run }: {
  line: BankMoneyTransactionDetail;
  busy: boolean;
  run: RunBankAction;
}) {
  const expense = line.direction === "money_out";
  const action = expense ? "Record as expense" : "Record as income";
  const accountType = expense ? "expense" : "income";
  const { data, loading, error, refresh } = useResource(getLedgerAccounts, line.tenantId);
  const accounts = (data ?? []).filter((account) => account.accountType.toLowerCase() === accountType);
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [chooseBankAccount, setChooseBankAccount] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const canRecord = !busy && accounts.some((account) => account.id === accountId) &&
    (!chooseBankAccount || !!bankAccountId);

  function record() {
    if (!canRecord) return;
    void run(async () => {
      try {
        const result = await recordBankExpense(line.id, accountId, description.trim() || undefined, bankAccountId || undefined);
        return `Created document ${result.documentNumber}.`;
      } catch (error) {
        if (needsBankAccountChoice(error)) setChooseBankAccount(true);
        throw error;
      }
    }, "Unable to record this bank line.");
  }

  return (
    <section className="transaction-review-section">
      <div className="transaction-review-section-heading"><h3>{action}</h3></div>
      {loading && <p role="status">Loading ledger accounts…</p>}
      {error && <>
        <p className="notice danger" role="alert">{error}</p>
        <button type="button" className="btn small" onClick={() => void refresh()}>Retry ledger accounts</button>
      </>}
      {data && accounts.length === 0 && <p>No {accountType} accounts are available.</p>}
      {accounts.length > 0 && <form onSubmit={(event) => { event.preventDefault(); void record(); }}>
        <Field label={expense ? "Expense ledger account" : "Income ledger account"}>
          <select value={accountId} required disabled={busy} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Choose an account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </Field>
        <Field label="Description (optional)">
          <input value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {chooseBankAccount && <BankAccountSelect tenantId={line.tenantId} value={bankAccountId} busy={busy} onChange={setBankAccountId} />}
        <button type="submit" className="btn primary" disabled={!canRecord}>{action}</button>
      </form>}
    </section>
  );
}

function BankAccountSelect({ tenantId, value, busy, onChange }: {
  tenantId: string;
  value: string;
  busy: boolean;
  onChange: (id: string) => void;
}) {
  const { data, loading, error, refresh } = useResource(() => listCatalog("bank-account"), tenantId);
  const accounts = (data ?? []).filter((account) => account.isActive);
  return <>
    <Field label="Bank account">
      <select value={value} required disabled={busy || loading || !accounts.length} onChange={(event) => onChange(event.target.value)}>
        <option value="">{loading ? "Loading bank accounts…" : "Choose a bank account"}</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>
          {[account.code, account.name].filter(Boolean).join(" · ")}
        </option>)}
      </select>
    </Field>
    {error && <>
      <p className="notice danger" role="alert">{error}</p>
      <button type="button" className="btn small" disabled={busy} onClick={() => void refresh()}>Retry bank accounts</button>
    </>}
    {data && !accounts.length && <p>No active bank accounts are available in Catalog.</p>}
  </>;
}

type AllocationDraft = { record: ManualMatchRecord; amount: string };

function validAllocation({ record, amount }: AllocationDraft) {
  const cents = allocationCents(amount);
  return cents !== null && cents > 0n && cents <= amountInCents(record.remainingAmount);
}

function MatchBankLine({ user, line, busy, run }: {
  user: User;
  line: BankMoneyTransactionDetail;
  busy: boolean;
  run: RunBankAction;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ManualMatchRecord[]>();
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [searching, setSearching] = useState(false);
  const [failure, setFailure] = useState("");
  const { allocated, remaining, exceedsAvailable } = allocationTotals(line, allocations.map((item) => item.amount));
  const matchingRecords = matches?.filter((record) => canMatchRecord(line, record));
  const compatible = allocations.every(({ record }) => canMatchRecord(line, record));
  const canMatch = !busy && !searching && allocations.length > 0 && !exceedsAvailable && compatible && allocations.every(validAllocation);
  const atLimit = allocations.length >= MATCH_LIMIT;

  async function search() {
    if (searching || busy) return;
    setSearching(true);
    setFailure("");
    setMatches(undefined);
    try {
      setMatches(await searchMatchRecords(line.id, query.trim()));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Unable to search approved records.");
    } finally {
      setSearching(false);
    }
  }

  function match() {
    if (!canMatch) return;
    setFailure("");
    void run(async () => {
      const remaining = await submitBankAllocations(user, line, allocations.map(({ record, amount }) => ({
        recordId: record.recordId,
        amount: decimalAmount(amountInCents(amount)),
      })));
      return amountInCents(remaining) > 0n ? "Allocations saved." : "Bank line matched.";
    }, "Unable to match the selected records.", () => {
      setAllocations([]);
      setMatches(undefined);
    });
  }

  return (
    <section className="transaction-review-section">
      <div className="transaction-review-section-heading"><h3>Match to several</h3></div>
      <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Field label="Search approved records to allocate">
          <input value={query} disabled={busy || searching} onChange={(event) => setQuery(event.target.value)} />
        </Field>
        <button type="submit" className="btn" disabled={busy || searching}>{searching ? "Searching…" : "Search"}</button>
      </form>
      {matchingRecords?.length === 0 && <p role="status">No matching approved records in {line.currency}.</p>}
      {matchingRecords && matchingRecords.length > 0 && <ul>
        {matchingRecords.map((record) => {
          const amount = defaultAllocation(record.remainingAmount, remaining);
          const checked = allocations.some((item) => item.record.recordId === record.recordId);
          const reference = record.invoiceNumber || record.reference;
          return <li key={record.recordId}>
            <strong>{record.recordCode}</strong>
            {reference && ` · ${reference}`}{record.party && ` · ${record.party}`}
            {" · "}{bankLineMoney(record.remainingAmount, record.currency)} outstanding{" "}
            <button className="btn small" type="button" aria-label={`Add ${record.recordCode}`}
              disabled={busy || checked || atLimit || amount === "0.00"}
              onClick={() => setAllocations([...allocations, { record, amount }])}>{checked ? "Added" : "Add"}</button>
          </li>;
        })}
      </ul>}
      {allocations.map((item) => {
        const { record, amount } = item;
        const label = `Amount for ${record.recordCode}`;
        const valid = validAllocation(item);
        return <div key={record.recordId} className="transaction-match-search">
          <Field label={label} hint={`Outstanding ${bankLineMoney(record.remainingAmount, record.currency)}`}>
            <input value={amount} inputMode="decimal" disabled={busy} aria-invalid={!valid}
              onChange={(event) => setAllocations(allocations.map((draft) =>
                draft.record.recordId === record.recordId ? { ...draft, amount: event.target.value } : draft))} />
          </Field>
          <button className="btn small" type="button" aria-label={`Remove ${record.recordCode}`} disabled={busy}
            onClick={() => setAllocations(allocations.filter((draft) => draft.record.recordId !== record.recordId))}>Remove</button>
        </div>;
      })}
      {allocations.length > 0 && <p role="status">
        After this match, allocated {bankLineMoney(allocated, line.currency)} · Remaining {bankLineMoney(remaining, line.currency)}
      </p>}
      {exceedsAvailable && <p className="notice danger" role="alert">The allocated total exceeds the amount left to match.</p>}
      {!compatible && <p className="notice danger" role="alert">Select only eligible records in {line.currency}.</p>}
      {allocations.some((item) => !validAllocation(item)) && <p className="notice danger" role="alert">
        Enter a positive amount with up to two decimal places for each record, up to its outstanding amount.
      </p>}
      {atLimit && <p>Up to {MATCH_LIMIT} records can be matched at a time.</p>}
      {failure && <p className="notice danger" role="alert">{failure}</p>}
      <button type="button" className="btn primary" disabled={!canMatch} onClick={() => void match()}>Match selected records</button>
    </section>
  );
}

/**
 * 24 Nov demo (bug f): a bill already paid by a payment voucher could not be matched to its bank line, because only
 * open records were offered. The line is the bank's copy of the voucher: link the two, nothing is posted again.
 */
/** Undo a manual match with a reason (review of #52). A money document recorded from the line is undone by voiding it. */
function UnmatchRecordedDocument({ line, busy, run }: { line: BankMoneyTransactionDetail; busy: boolean; run: RunBankAction }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const number = line.recordedDocumentNumber || "the payment";
  return <section className="transaction-review-section">
    <div className="transaction-review-section-heading"><h3>Matched to {number}</h3></div>
    <p>This line was matched by hand to {number}, which was already posted. If it is the wrong payment, unmatch it; nothing is reversed.</p>
    {!open ? <button type="button" className="btn" disabled={busy} onClick={() => setOpen(true)}>Unmatch…</button> : <>
      <Field label="Why is this match wrong? *" hint="Saved with your name in the audit trail.">
        <input value={reason} disabled={busy} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <button type="button" className="btn danger" disabled={busy || reason.trim().length < 5}
        onClick={() => void run(async () => { await unmatchRecordedDocument(line.id, reason.trim()); setOpen(false); setReason("");
          return `Unmatched from ${number}. The line can be matched again.`; }, "Unable to unmatch this bank line.")}>Unmatch</button>{" "}
      <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </>}
  </section>;
}

function MatchRecordedDocument({ line, busy, run }: { line: BankMoneyTransactionDetail; busy: boolean; run: RunBankAction }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RecordedDocumentCandidate[]>();
  const [confirming, setConfirming] = useState<RecordedDocumentCandidate | null>(null);
  const [searching, setSearching] = useState(false);
  const [failure, setFailure] = useState("");
  async function search() {
    if (busy || searching) return;
    setSearching(true); setFailure("");
    try { setRows(await searchRecordedDocuments(line.id, query.trim())); setSearched(query.trim()); }
    catch (e) { setFailure(e instanceof Error ? e.message : "Unable to search payments."); }
    finally { setSearching(false); }
  }
  const label = line.direction === "money_in" ? "payment received or money-in document" : "payment voucher or money-out document";
  // Without a search, only documents that can be this line's copy; a search also shows why others cannot.
  const [searched, setSearched] = useState("");
  const shown = rows && (searched ? rows : rows.filter((row) => !row.problem));
  const hidden = rows && shown ? rows.length - shown.length : 0;
  return <section className="transaction-review-section">
    <div className="transaction-review-section-heading"><h3>Already recorded as a payment</h3></div>
    <p>If this line is a {label} you already issued, match it here. Nothing is posted again.</p>
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <Field label="Number, contact or reference (optional)">
        <input value={query} disabled={busy || searching} onChange={(event) => setQuery(event.target.value)} placeholder="PV-2026-00001" />
      </Field>
      <button type="submit" className="btn" disabled={busy || searching}>{searching ? "Searching…" : "Find payments"}</button>
    </form>
    {shown?.length === 0 && <p role="status">No issued {label} in {line.currency} for this amount is waiting for a bank line.
      {hidden > 0 ? ` ${hidden} other ${hidden === 1 ? "document differs" : "documents differ"}; search by number to see why.` : ""}</p>}
    {shown && shown.length > 0 && !confirming && <ul>{shown.map((row) => <li key={row.documentId}>
      <strong>{row.number}</strong> · {row.documentDate}{row.contactName ? ` · ${row.contactName}` : ""} · {bankLineMoney(row.amount, row.currency)}
      {row.problem ? <small> · {row.problem}</small> : <> <button type="button" className="btn small primary" disabled={busy}
        onClick={() => setConfirming(row)}>Match to {row.number}</button></>}
    </li>)}</ul>}
    {/* Review of #52: with two vouchers of the same amount a wrong pick is easy, so say exactly what is matched first. */}
    {confirming && <div className="notice" role="group" aria-label={`Confirm the match to ${confirming.number}`}>
      <p><strong>Match this bank line to {confirming.number}?</strong></p>
      <dl className="detail-list">
        <div><dt>Document</dt><dd>{confirming.number}{confirming.reference && confirming.reference !== confirming.number ? ` (${confirming.reference})` : ""}</dd></div>
        <div><dt>Contact</dt><dd>{confirming.contactName || "—"}</dd></div>
        <div><dt>Document date</dt><dd>{confirming.documentDate}</dd></div>
        <div><dt>Amount</dt><dd>{bankLineMoney(confirming.amount, confirming.currency)}</dd></div>
        <div><dt>Bank line</dt><dd>{line.postedDate} · {line.description} · {bankLineMoney(line.amount ?? "", line.currency)}</dd></div>
      </dl>
      <p>Nothing is posted: the document already is. A wrong match can be unmatched with a reason.</p>
      <button type="button" className="btn primary" disabled={busy} onClick={() => {
        const row = confirming;
        void run(async () => { await matchRecordedDocument(line.id, row.documentId); setRows(undefined); setConfirming(null); return `Matched to ${row.number}.`; },
          "Unable to match this payment.");
      }}>Confirm match</button>{" "}
      <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
    </div>}
    {failure && <p className="notice danger" role="alert">{failure}</p>}
  </section>;
}

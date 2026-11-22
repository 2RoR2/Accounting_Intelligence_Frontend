"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, Field, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { amountInCents, decimalAmount, documentHref } from "@/features/common/erp/document-logic";
import { decimalDisplay } from "@/lib/api/document-contract";
import { listCatalog } from "@/lib/api/erp.service";
import { getLedgerAccounts } from "@/lib/api/ledger.service";
import {
  getMoneyTransactionDetail, postBankPayment, recordBankExpense, searchMatchRecords,
  type BankPaymentPosting, type ManualMatchRecord,
} from "@/lib/api/money.service";
import type { User } from "@/types";
import type { BankMoneyTransaction, BankMoneyTransactionDetail } from "@/types/money";
import {
  allocationCents, allocationTotals, canAllocateBankLine, canMatchRecord, canPostBankPayment, defaultAllocation,
  isUnallocated, MATCH_LIMIT, needsBankAccountChoice, needsBankMatchRefresh, submitBankAllocations,
} from "./allocation-logic";

type RunBankAction = (action: () => Promise<string>, fallback: string, resetDraft?: () => void) => Promise<void>;

export function bankLineMoney(value: string, currency?: string | null) {
  return !currency || currency === "MYR" ? money(value) : decimalDisplay(value, currency);
}

export function BankLineDocumentLink({ line, base }: { line: BankMoneyTransaction; base: string }) {
  if (line.recordedDocumentId && line.recordedDocumentType) {
    return <Link href={documentHref(base, "bank-entries", line.recordedDocumentType, line.recordedDocumentId)}>
      {line.recordedDocumentNumber || "Open document"}
    </Link>;
  }
  return line.relatedDocumentId
    ? <Link href={`${base}/documents/${line.relatedDocumentId}`}>{line.relatedDocumentCode || "Open document"}</Link>
    : "—";
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
    {(canPost || line.paymentPosted || payment) && <section className="transaction-review-section">
      <div className="transaction-review-section-heading"><h3>Ledger payment</h3></div>
      {(line.paymentPosted || payment) && <p role="status">Payment posted</p>}
      {payment && payment.lines.length > 0 && <DataTable
        rows={payment.lines.map((entry, index) => ({ ...entry, index }))}
        rowKey={(entry) => String(entry.index)}
        columns={[
          { label: "Account", render: (entry) => `${entry.code} ${entry.name}` },
          { label: "Description", render: (entry) => entry.description },
          { label: "Debit", render: (entry) => bankLineMoney(entry.debit, line.currency) },
          { label: "Credit", render: (entry) => bankLineMoney(entry.credit, line.currency) },
        ]}
      />}
      {canPost && <button type="button" className="btn primary" disabled={disabled} onClick={postPayment}>Post payment to ledger</button>}
    </section>}
    {canAllocate && isUnallocated(line) && <RecordBankLine line={line} busy={disabled} run={run} />}
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

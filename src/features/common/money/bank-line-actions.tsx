"use client";

import { useState } from "react";
import { Field, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { amountInCents, decimalAmount } from "@/features/common/erp/document-logic";
import { decimalDisplay } from "@/lib/api/document-contract";
import { getLedgerAccounts } from "@/lib/api/ledger.service";
import { matchBankRecords, recordBankExpense, searchMatchRecords, type ManualMatchRecord } from "@/lib/api/money.service";
import type { BankMoneyTransactionDetail } from "@/types/money";
import { allocationCents, allocationTotals, defaultAllocation, MATCH_LIMIT } from "./allocation-logic";

export type RecordedBankLine = Awaited<ReturnType<typeof recordBankExpense>>;
export type MatchedBankLine = Awaited<ReturnType<typeof matchBankRecords>>;

export function bankLineMoney(value: string, currency?: string | null) {
  return !currency || currency === "MYR" ? money(value) : decimalDisplay(value, currency);
}

export function RecordBankLine({ line, busy, onBusyChange, onRecorded }: {
  line: BankMoneyTransactionDetail;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onRecorded: (result: RecordedBankLine) => void;
}) {
  const expense = line.direction === "money_out";
  const action = expense ? "Record as expense" : "Record as income";
  const accountType = expense ? "expense" : "income";
  const { data, loading, error, refresh } = useResource(getLedgerAccounts, line.tenantId);
  const accounts = (data ?? []).filter((account) => account.accountType.toLowerCase() === accountType);
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [failure, setFailure] = useState("");
  const canRecord = !busy && accounts.some((account) => account.id === accountId);

  async function record() {
    if (!canRecord) return;
    onBusyChange(true);
    setFailure("");
    try {
      onRecorded(await recordBankExpense(line.id, accountId, description.trim() || undefined));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Unable to record this bank line.");
    } finally {
      onBusyChange(false);
    }
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
        {failure && <p className="notice danger" role="alert">{failure}</p>}
        <button type="submit" className="btn primary" disabled={!canRecord}>{action}</button>
      </form>}
    </section>
  );
}

type AllocationDraft = { record: ManualMatchRecord; amount: string };

function validAllocation({ record, amount }: AllocationDraft) {
  const cents = allocationCents(amount);
  return cents !== null && cents > 0n && cents <= amountInCents(record.remainingAmount);
}

export function MatchBankLine({ line, available, busy, onBusyChange, onMatched }: {
  line: BankMoneyTransactionDetail;
  available: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onMatched: (result: MatchedBankLine) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ManualMatchRecord[]>();
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [searching, setSearching] = useState(false);
  const [failure, setFailure] = useState("");
  const { allocated, remaining, exceedsAvailable } = allocationTotals(available, allocations.map((item) => item.amount));
  const category = line.direction === "money_out" ? "ACCOUNTS_PAYABLE" : "ACCOUNTS_RECEIVABLE";
  const canMatch = !busy && !searching && allocations.length > 0 && !exceedsAvailable && allocations.every(validAllocation);
  const atLimit = allocations.length >= MATCH_LIMIT;

  async function search() {
    if (searching || busy) return;
    setSearching(true);
    setFailure("");
    setMatches(undefined);
    try {
      const results = await searchMatchRecords(line.id, query.trim());
      setMatches(results.filter((record) => record.category.toUpperCase() === category));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Unable to search approved records.");
    } finally {
      setSearching(false);
    }
  }

  async function match() {
    if (!canMatch) return;
    onBusyChange(true);
    setFailure("");
    try {
      const result = await matchBankRecords(line.id, allocations.map(({ record, amount }) => ({
        recordId: record.recordId,
        amount: decimalAmount(amountInCents(amount)),
      })));
      setAllocations([]);
      setMatches(undefined);
      onMatched(result);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Unable to match the selected records.");
    } finally {
      onBusyChange(false);
    }
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
      {matches?.length === 0 && <p role="status">No matching approved records.</p>}
      {matches && matches.length > 0 && <ul>
        {matches.map((record) => {
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
      <p role="status">
        Allocated {bankLineMoney(allocated, line.currency)} · Remaining {bankLineMoney(remaining, line.currency)}
      </p>
      {exceedsAvailable && <p className="notice danger" role="alert">The allocated total exceeds the amount left to match.</p>}
      {allocations.some((item) => !validAllocation(item)) && <p className="notice danger" role="alert">
        Enter a positive amount with up to two decimal places for each record, up to its outstanding amount.
      </p>}
      {atLimit && <p>Up to {MATCH_LIMIT} records can be matched at a time.</p>}
      {failure && <p className="notice danger" role="alert">{failure}</p>}
      <button type="button" className="btn primary" disabled={!canMatch} onClick={() => void match()}>Match selected records</button>
    </section>
  );
}

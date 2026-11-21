"use client";

import { useRef, useState, type FormEvent } from "react";
import { ErrorState, Field, LoadingState } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { createManualJournal, getAccountingPeriods, getLedgerAccounts, postSupplierPayment } from "@/lib/api/ledger.service";
import { journalAttemptKey, settleJournalAttempt, type JournalAttemptContent } from "@/lib/api/journal-attempts";

export function JournalPostingForm({ onPosted, payment }: {
  onPosted: () => void | Promise<void>;
  payment?: { transactionId: string; postedDate: string | null };
}) {
  const [hasOpened, setHasOpened] = useState(false);
  return <details className="panel-body" onToggle={(event) => {
    if (event.currentTarget.open) setHasOpened(true);
  }}>
    <summary className="btn">
      {payment ? "Record supplier payment journal" : "Post a manual journal"}
    </summary>
    {hasOpened && <JournalInputs onPosted={onPosted} payment={payment} />}
  </details>;
}

function JournalInputs({ onPosted, payment }: {
  onPosted: () => void | Promise<void>;
  payment?: { transactionId: string; postedDate: string | null };
}) {
  const { data, loading, error, refresh } = useResource(async () => {
    const [periods, accounts] = await Promise.all([getAccountingPeriods(), getLedgerAccounts()]);
    return { periods: periods.filter((period) => period.status === "open"), accounts };
  }, "journal-posting-options");
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  if (loading) return <LoadingState />;
  if (!data) return <ErrorState message={error} retry={refresh} />;
  const debitAccounts = data.accounts.filter((account) => !payment || account.accountType === "liability");
  const creditAccounts = data.accounts.filter((account) => !payment || account.accountType === "asset");
  if (!data.periods.length || !debitAccounts.length || !creditAccounts.length) {
    return <p>An open period and eligible ledger accounts are required.</p>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const element = event.currentTarget;
    const input = new FormData(element);
    const periodId = String(input.get("period"));
    const debit = String(input.get("debit"));
    const credit = String(input.get("credit"));
    const journalDate = String(input.get("date"));
    if (debit === credit) { setFailure("Pick two different ledger accounts."); return; }
    submitting.current = true;
    setBusy(true);
    setFailure("");
    setNotice("");
    // The key follows the content and survives the form unmounting (see journal-attempts).
    const content: JournalAttemptContent = {
      periodId, journalDate, description: String(input.get("description") ?? "").trim(),
      lines: [{ accountId: debit, debit: String(input.get("amount")) }, { accountId: credit, credit: String(input.get("amount")) }],
    };
    try {
      const result = payment
        ? await postSupplierPayment(payment.transactionId, { periodId, payableAccountId: debit, bankAccountId: credit, journalDate })
        : await createManualJournal({ ...content, idempotencyKey: journalAttemptKey(content) });
      if (!payment) settleJournalAttempt(content);
      element.reset();
      setNotice(result.idempotent ? "Journal was already recorded." : "Journal posted.");
      void onPosted();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "The journal could not be posted.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <>
    {failure && <ErrorState message={failure} />}
    {notice && <p role="status">{notice}</p>}
    <form className="ledger-filter-bar journal-posting-form" onSubmit={submit}>
      <Field label="Open period"><select name="period" required><option value="">Choose period</option>
        {data.periods.map((period) => <option key={period.id} value={period.id}>{period.periodCode}</option>)}
      </select></Field>
      <Field label="Journal date"><input type="date" name="date" required defaultValue={payment?.postedDate ?? ""} /></Field>
      <Field label={payment ? "Payable account" : "Debit account"}><select name="debit" required><option value="">Choose account</option>
        {debitAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
      </select></Field>
      <Field label={payment ? "Bank account" : "Credit account"}><select name="credit" required><option value="">Choose account</option>
        {creditAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
      </select></Field>
      {!payment && <>
        <Field label="Amount"><input name="amount" type="number" min="0.01" step="0.01" required /></Field>
        <Field label="Description"><input name="description" maxLength={500} required /></Field>
      </>}
      <button className="btn primary" disabled={busy}>Post journal</button>
    </form>
  </>;
}

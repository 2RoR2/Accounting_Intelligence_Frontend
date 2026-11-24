"use client";

import { useState, type FormEvent } from "react";
import { DataTable, ErrorState, Field, LoadingState, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { createChartAccount, getChartAccounts, getLedgerAccounts, getTrialBalance, type AccountClass } from "@/lib/api/ledger.service";

const classes: AccountClass[] = ["asset", "liability", "equity", "revenue", "cogs", "expense"];

export function ChartAccounts({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, refresh } = useResource(() => getChartAccounts(true), "chart-of-accounts");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  if (loading) return <LoadingState />;
  if (!data) return <ErrorState message={error} retry={refresh} />;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      await createChartAccount({
        code: String(form.get("code") ?? "").trim(),
        name: String(form.get("name") ?? "").trim(),
        accountClass: String(form.get("accountClass")) as AccountClass,
        parentId: String(form.get("parentId") || "") || null,
      });
      element.reset();
      setMessage("Account added.");
      await refresh();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "The account could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <Panel title="Chart of accounts" subtitle="Categories used when coding bank activity. Journals use ledger accounts.">
    {canEdit && <div className="panel-body">
      {failure && <ErrorState message={failure} />}
      {message && <p role="status">{message}</p>}
      <form className="ledger-filter-bar ledger-wrap-form" onSubmit={save}>
        <Field label="Account code"><input name="code" required maxLength={50} /></Field>
        <Field label="Account name"><input name="name" required maxLength={200} /></Field>
        <Field label="Account class"><select name="accountClass">{classes.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Parent account"><select name="parentId">
          <option value="">None</option>
          {data.filter((account) => account.isActive).map((account) => (
            <option key={account.id} value={account.id}>{account.code} {account.name}</option>
          ))}
        </select></Field>
        <button className="btn primary" disabled={busy}>Add account</button>
      </form>
    </div>}
    <DataTable rows={data} rowKey={(row) => row.id}
      emptyMessage={canEdit ? "No accounts yet. Use Add account to set one up." : "No accounts yet. Ask a local admin to set up the chart of accounts."}
      columns={[
      { label: "Code", render: (row) => row.code },
      { label: "Name", render: (row) => row.name },
      { label: "Class", render: (row) => row.accountClass },
      { label: "Status", render: (row) => row.isActive ? "Active" : "Inactive" },
    ]} />
  </Panel>;
}

/**
 * The accounts journals post to (1010 Bank, 2000 Payables...), with their posted balance. Audit 24 Nov: the Chart of
 * accounts page showed only the bank-coding categories, so an accountant could not see the ledger chart at all.
 */
export function LedgerAccountsPanel() {
  const { data, loading, error, refresh } = useResource(async () => {
    const [accounts, trial] = await Promise.all([getLedgerAccounts(), getTrialBalance().catch(() => [])]);
    const balance = new Map(trial.map((row) => [row.accountId, row]));
    return accounts.map((account) => ({ ...account, row: balance.get(account.id) }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, "ledger-accounts");
  return <Panel title="Ledger accounts" subtitle="The accounts journals post to, with their posted balance (debit less credit).">
    {loading && <LoadingState variant="table" />}
    {error && !data && <ErrorState message={error} retry={refresh} />}
    {data && <DataTable rows={data} rowKey={(row) => row.id} emptyMessage="No ledger accounts yet." columns={[
      { label: "Code", render: (row) => row.code },
      { label: "Name", render: (row) => row.name },
      { label: "Type", render: (row) => row.accountType },
      { label: "Debit", render: (row) => row.row?.totalDebit ?? "0.00" },
      { label: "Credit", render: (row) => row.row?.totalCredit ?? "0.00" },
      { label: "Balance", render: (row) => row.row?.netBalance ?? "0.00" },
    ]} />}
  </Panel>;
}

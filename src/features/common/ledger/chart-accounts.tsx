"use client";

import { useState, type FormEvent } from "react";
import { DataTable, ErrorState, Field, LoadingState, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { createChartAccount, getChartAccounts, type AccountClass } from "@/lib/api/ledger.service";

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
      <form className="ledger-filter-bar" onSubmit={save}>
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
    <DataTable rows={data} rowKey={(row) => row.id} columns={[
      { label: "Code", render: (row) => row.code },
      { label: "Name", render: (row) => row.name },
      { label: "Class", render: (row) => row.accountClass },
      { label: "Status", render: (row) => row.isActive ? "Active" : "Inactive" },
    ]} />
  </Panel>;
}

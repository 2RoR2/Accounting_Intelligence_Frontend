"use client";
import { useState } from "react";
import { ErrorState, LoadingState, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getPostingAccounts, setPostingAccounts, type PostingPurpose } from "@/lib/api/erp.service";
import { getLedgerAccounts } from "@/lib/api/ledger.service";
import { accountLabel, accountsForPurpose, changedPostingAccounts, errorMessage, purposeLabel } from "./catalog-logic";

/** Default posting accounts: the ledger accounts sales and purchase documents post to. Company admins only. */
export function PostingAccountsPanel({ canEdit }: { canEdit: boolean }) {
  if (!canEdit) return <Panel title="Posting accounts">
    <div className="panel-body"><p>Only a company admin can change posting accounts.</p></div>
  </Panel>;
  return <PostingAccountsEditor />;
}

function PostingAccountsEditor() {
  const [chosen, setChosen] = useState<Partial<Record<PostingPurpose, string>>>({});
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, error, loading, refresh, setData } = useResource(async () => {
    const [rows, accounts] = await Promise.all([getPostingAccounts(), getLedgerAccounts()]);
    return { rows, accounts };
  }, "erp-posting-accounts");

  if (loading) return <LoadingState variant="form" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const changes = changedPostingAccounts(data.rows, chosen);
  const changed = Object.keys(changes).length > 0;

  const save = async () => {
    if (!changed) return;
    setBusy(true); setFailure(""); setSaved("");
    try {
      const rows = await setPostingAccounts(changes);
      setData({ ...data, rows });
      setChosen({});
      setSaved("Posting accounts saved.");
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return <Panel title="Posting accounts" subtitle="Where sales and purchase documents post in the ledger when no other account is chosen.">
    <div className="panel-body" style={{ display: "grid", gap: 14 }}>
      {failure && <div className="notice danger" role="alert">{failure}</div>}
      {saved && <div className="notice" role="status">{saved}</div>}
      {data.rows.map((row) => {
        const options = accountsForPurpose(data.accounts, row.purpose);
        const value = chosen[row.purpose] ?? row.accountId ?? "";
        const id = `posting-${row.purpose}`;
        return <div className="field" key={row.purpose}>
          <label htmlFor={id}>{purposeLabel(row.purpose)}</label>
          <select id={id} value={value} onChange={(e) => { setSaved(""); setChosen((current) => ({ ...current, [row.purpose]: e.target.value })); }}>
            <option value="">Not set</option>
            {row.accountId && !options.some((account) => account.id === row.accountId) &&
              <option value={row.accountId}>{row.code ? `${row.code} · ${row.name ?? ""}` : "Current account"}</option>}
            {options.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
          </select>
          {row.problem && <small className="notice danger" style={{ display: "block", marginTop: 6 }}>{row.problem}</small>}
          {!options.length && <small>No matching accounts in the chart of accounts yet.</small>}
        </div>;
      })}
    </div>
    <div className="modal-actions">
      <button type="button" className="btn" disabled={!changed || busy} onClick={() => { setChosen({}); setFailure(""); }}>Discard changes</button>
      <button type="button" className="btn primary" disabled={!changed || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
    </div>
  </Panel>;
}

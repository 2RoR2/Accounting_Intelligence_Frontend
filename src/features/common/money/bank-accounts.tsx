"use client";

import Link from "next/link";
import { DataTable, ErrorState, LoadingState, PageHeader, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getMoneyTransactions } from "@/lib/api/money.service";
import { getChartAccounts } from "@/lib/api/ledger.service";
import { currencyTotals } from "@/lib/api/document-contract";
import type { BankMoneyTransaction } from "@/types/money";
import type { User } from "@/types";

type ImportedAccount = { ref: string; lines: number; lastDate: string; moneyIn: string; moneyOut: string };

/** One row per bank account seen in imported statements, with money in and out per currency. */
export function importedAccounts(rows: BankMoneyTransaction[]): ImportedAccount[] {
  const byRef = new Map<string, BankMoneyTransaction[]>();
  for (const row of rows) {
    const ref = row.bankAccountRef?.trim() || "Account not stated";
    byRef.set(ref, [...(byRef.get(ref) ?? []), row]);
  }
  const totals = (items: BankMoneyTransaction[]) => currencyTotals(items.map((item) => ({ currency: item.currency, total: item.amount ?? "0" })))
    .map((total) => `${total.currency ?? "Unspecified"} ${total.total}`).join(" / ") || "—";
  return [...byRef.entries()].map(([ref, items]) => ({
    ref,
    lines: items.length,
    lastDate: items.map((item) => item.postedDate).sort().at(-1) ?? "—",
    moneyIn: totals(items.filter((item) => item.direction === "money_in")),
    moneyOut: totals(items.filter((item) => item.direction === "money_out")),
  })).sort((a, b) => a.ref.localeCompare(b.ref));
}

/**
 * Bank › Accounts (read-only): accounts from imported bank statements and the bank/cash accounts in
 * the chart of accounts. There is no bank-account register on this branch, so nothing here is editable.
 */
export function BankAccountsPage({ user }: { user: User }) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const { data, error, loading, refresh } = useResource(async () => {
    const [moneyIn, moneyOut, chart] = await Promise.all([
      getMoneyTransactions(user, "money_in"), getMoneyTransactions(user, "money_out"), getChartAccounts().catch(() => null),
    ]);
    return { imported: importedAccounts([...moneyIn, ...moneyOut]), chart };
  }, `bank-accounts:${user.id}`);
  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const ledgerAccounts = (data.chart ?? []).filter((account) => account.accountClass === "asset" && /bank|cash/i.test(account.name));
  return <>
    <PageHeader title="Bank accounts" description="Accounts found in your imported bank statements, and the bank and cash accounts in the ledger." />
    <Panel title="From imported statements" subtitle="Totals are imported bank lines, not posted balances.">
      {data.imported.length
        ? <DataTable rows={data.imported} rowKey={(row) => row.ref} columns={[
            { label: "Account", render: (row) => row.ref },
            { label: "Bank lines", render: (row) => row.lines },
            { label: "Latest line", render: (row) => row.lastDate },
            { label: "Money in", render: (row) => row.moneyIn },
            { label: "Money out", render: (row) => row.moneyOut },
          ]} />
        : <p className="empty-state">No bank statements imported yet. <Link href={`${base}/money-in`}>Import one in Money In</Link>.</p>}
    </Panel>
    <Panel title="In the chart of accounts" subtitle="Asset accounts named bank or cash.">
      {data.chart === null
        ? <p className="empty-state">— The chart of accounts could not be loaded.</p>
        : ledgerAccounts.length
          ? <DataTable rows={ledgerAccounts} rowKey={(row) => row.id} columns={[
              { label: "Code", render: (row) => row.code }, { label: "Name", render: (row) => row.name },
              { label: "Status", render: (row) => (row.isActive ? "Active" : "Inactive") },
            ]} />
          : <p className="empty-state">No bank or cash accounts in the chart of accounts. <Link href={`${base}/ledger?section=accounts`}>Open Chart of Accounts</Link>.</p>}
    </Panel>
  </>;
}

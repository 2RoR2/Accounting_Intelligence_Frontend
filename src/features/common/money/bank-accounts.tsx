"use client";

import Link from "next/link";
import { DataTable, EmptyState, LoadingState, PageHeader, Panel, StatusBadge, formatDate, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { currencyTotals } from "@/lib/api/document-contract";
import { listCatalog, type CatalogEntry } from "@/lib/api/erp.service";
import { getChartAccounts, getLedgerAccounts, getTrialBalance, type TrialBalanceRow } from "@/lib/api/ledger.service";
import { getMoneyTransactions } from "@/lib/api/money.service";
import type { BankMoneyTransaction } from "@/types/money";
import type { User } from "@/types";

type ImportedAccount = { ref: string; lines: number; lastDate: string; moneyIn: string; moneyOut: string };
type BankAccountIdentity = Pick<CatalogEntry, "code" | "name" | "data">;
type ImportedLineSummary = { lines: number; lastDate: string };

const catalogText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalizedRef = (value?: string | null) => value?.trim().toLowerCase() ?? "";
/** Account numbers: drop spaces, dashes and dots only, keep letters, compare case-insensitively. */
const accountNumberKey = (value: string) => value.replace(/[\s.-]/g, "").toLowerCase();

export function matchesBankAccount(ref: string | null | undefined, account: BankAccountIdentity): boolean {
  const normalized = normalizedRef(ref);
  if (!normalized) return false;
  if (normalized === normalizedRef(account.code) || normalized === normalizedRef(account.name)) return true;
  const accountNumber = accountNumberKey(catalogText(account.data.accountNumber));
  return accountNumber !== "" && accountNumberKey(normalized) === accountNumber;
}

export function summarizeBankImports(
  accounts: ReadonlyArray<BankAccountIdentity & { id: string }>,
  rows: readonly BankMoneyTransaction[],
) {
  const linked = new Map<string, ImportedLineSummary>();
  const unlinked: BankMoneyTransaction[] = [];
  for (const row of rows) {
    const matches = accounts.filter((account) => matchesBankAccount(row.bankAccountRef, account));
    // A reference that fits two bank accounts stays unlinked so someone can sort it out.
    if (matches.length !== 1) { unlinked.push(row); continue; }
    for (const account of matches) {
      const summary = linked.get(account.id) ?? { lines: 0, lastDate: "" };
      summary.lines += 1;
      if (row.postedDate > summary.lastDate) summary.lastDate = row.postedDate;
      linked.set(account.id, summary);
    }
  }
  return { linked, unlinked: importedAccounts(unlinked) };
}

export function postedBankBalance(row?: Pick<TrialBalanceRow, "totalDebit" | "totalCredit">): string {
  if (!row) return "0.00";
  const credit = row.totalCredit.startsWith("-") ? row.totalCredit.slice(1) : `-${row.totalCredit}`;
  const [balance] = currencyTotals([{ total: row.totalDebit }, { total: credit }]);
  return balance?.total ?? "0.00";
}

/** One row per bank account seen in imported statements, with money in and out per currency. */
export function importedAccounts(rows: BankMoneyTransaction[]): ImportedAccount[] {
  const byRef = new Map<string, BankMoneyTransaction[]>();
  for (const row of rows) {
    const ref = row.bankAccountRef?.trim() || "Account not stated";
    const items = byRef.get(ref);
    if (items) items.push(row);
    else byRef.set(ref, [row]);
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

function BankAccountsError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="notice danger" role="alert">
    {message}
    <div className="mt-2"><button type="button" className="btn small" onClick={retry}>Try again</button></div>
  </div>;
}

function ChartAccountsFallback({ base, userId }: { base: string; userId: string }) {
  const { data, loading, error, refresh } = useResource(getChartAccounts, `bank-chart-accounts:${userId}`);
  const accounts = data?.filter((account) => account.accountClass === "asset" && /bank|cash/i.test(account.name)) ?? [];
  return <Panel title="In the chart of accounts" subtitle="Asset accounts named bank or cash.">
    {loading ? <LoadingState variant="table" />
      : !data ? <BankAccountsError message={error || "Unable to load the chart of accounts."} retry={refresh} />
      : accounts.length ? <DataTable rows={accounts} rowKey={(row) => row.id} columns={[
          { label: "Code", render: (row) => row.code },
          { label: "Name", render: (row) => row.name },
          { label: "Status", render: (row) => (row.isActive ? "Active" : "Inactive") },
        ]} />
      : <EmptyState message="No bank or cash accounts in the chart of accounts."
          action={<Link href={`${base}/ledger?section=accounts`}>Open chart of accounts</Link>} />}
  </Panel>;
}

const formatImportedTotals = (totals: string) =>
  totals.replace(/\bMYR (-?\d+(?:\.\d+)?)/g, (_, amount: string) => money(amount));

export function BankAccountsPage({ user }: { user: User }) {
  const admin = user.role === "LOCAL_ADMIN";
  const base = admin ? "/company" : "/workspace";
  const { data, error, loading, refresh } = useResource(async () => {
    const [accounts, moneyIn, moneyOut] = await Promise.all([
      listCatalog("bank-account", true),
      getMoneyTransactions(user, "money_in"),
      getMoneyTransactions(user, "money_out"),
    ]);
    const imports = summarizeBankImports(accounts, [...moneyIn, ...moneyOut]);
    // Ledger details are extra: if they fail, keep the accounts and imported statements; balances show "—".
    const ledger = accounts.length
      ? await Promise.all([getLedgerAccounts(), getTrialBalance()]).catch(() => null)
      : null;
    const [ledgerAccounts, trialBalance] = ledger ?? [[], []];
    const ledgerById = new Map(ledgerAccounts.map((account) => [account.id, account]));
    const trialBalanceById = new Map(trialBalance.map((row) => [row.accountId, row]));
    return {
      accounts: accounts.map((account) => {
        const ledgerId = account.ledgerAccountId;
        const ledger = ledgerId ? ledgerById.get(ledgerId) : undefined;
        return {
          id: account.id,
          name: account.name,
          isActive: account.isActive,
          bank: catalogText(account.data.bankName),
          accountNumber: catalogText(account.data.accountNumber),
          ledgerAccount: [account.ledgerAccountCode || ledger?.code, ledger?.name].filter(Boolean).join(" · "),
          balance: ledgerId && ledger ? postedBankBalance(trialBalanceById.get(ledgerId)) : null,
          imports: imports.linked.get(account.id),
        };
      }),
      unlinked: imports.unlinked,
    };
  }, `bank-accounts:${user.id}`);

  return <>
    <PageHeader title="Bank accounts" actions={admin &&
      <Link className="btn primary" href={`${base}/catalog?kind=bank-account`}>Add bank account</Link>} />
    {loading ? <LoadingState variant="table" />
      : !data ? <BankAccountsError message={error || "Unable to load bank accounts."} retry={refresh} />
      : <>
        <Panel title="Bank accounts">
          {data.accounts.length ? <DataTable rows={data.accounts} rowKey={(row) => row.id} columns={[
            { label: "Name", render: (row) => <>{row.name}{!row.isActive && <> <StatusBadge status="inactive" /></>}</> },
            { label: "Bank", render: (row) => row.bank || "—" },
            { label: "Account number", render: (row) => row.accountNumber || "—" },
            { label: "Ledger account", render: (row) => row.ledgerAccount || "—" },
            { label: "Ledger balance", render: (row) => row.balance === null ? "—" : money(row.balance) },
            { label: "Imported bank lines", render: (row) => row.imports?.lines ?? 0 },
            { label: "Latest line date", render: (row) => formatDate(row.imports?.lastDate) },
            { label: "Actions", render: () => <div className="actions">
              <Link href={`${base}/reconciliation`}>Reconcile</Link>
              <Link href={`${base}/money-in`}>Money in</Link>
              <Link href={`${base}/money-out`}>Money out</Link>
            </div> },
          ]} /> : <EmptyState message={admin
            ? "No bank accounts yet. Select Add bank account to open the catalog."
            : "No bank accounts yet. A company administrator can add one in the catalog."} />}
        </Panel>
        <Panel title="Imported statements not linked to a bank account"
          subtitle={data.unlinked.length ? "Add a bank account in the catalog with the account number shown in the statement." : undefined}>
          {data.unlinked.length ? <DataTable rows={data.unlinked} rowKey={(row) => row.ref} columns={[
            { label: "Account", render: (row) => row.ref },
            { label: "Bank lines", render: (row) => row.lines },
            { label: "Latest line date", render: (row) => formatDate(row.lastDate) },
            { label: "Money in", render: (row) => formatImportedTotals(row.moneyIn) },
            { label: "Money out", render: (row) => formatImportedTotals(row.moneyOut) },
          ]} /> : <EmptyState message="No unlinked statements." />}
        </Panel>
        {!data.accounts.length && <ChartAccountsFallback base={base} userId={user.id} />}
      </>}
  </>;
}

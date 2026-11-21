"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable, ErrorState } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getProfitAndLossDashboard } from "@/lib/api/ledger.service";
import { DASHBOARD_REFRESH_MS, pollWhileVisible } from "@/lib/dashboard";

export function MonthlyFinance({ asOf, base, userId }: { asOf: string; base: string; userId: string }) {
  const [months, setMonths] = useState(12);
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");

  return (
    <section className="dash-card" aria-labelledby="dash-finance-title">
      <div className="dash-card-head">
        <div>
          <h2 id="dash-finance-title">Monthly finances</h2>
          <p>Income, expenses and net result by currency.</p>
        </div>
        <Link className="btn" href={`${base}/ledger`}>Open ledger</Link>
      </div>
      <div className="ledger-filter-bar">
        <label>Period{" "}
          <select value={months} onChange={(event) => setMonths(Number(event.target.value))}>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
        </label>
        <label>Basis{" "}
          <select value={basis} onChange={(event) => setBasis(event.target.value === "cash" ? "cash" : "accrual")}>
            <option value="accrual">Accrual</option>
            <option value="cash">Cash estimate</option>
          </select>
        </label>
      </div>
      <MonthlyResults key={`${userId}:${asOf}:${months}:${basis}`} asOf={asOf} months={months} basis={basis} />
    </section>
  );
}

function MonthlyResults({ asOf, months, basis }: { asOf: string; months: number; basis: "accrual" | "cash" }) {
  const start = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - months + 1);
  const from = start.toISOString().slice(0, 10);
  const { data, error, loading, refresh } = useResource(
    () => getProfitAndLossDashboard(from, asOf, basis),
    `${from}:${asOf}:${basis}`,
  );
  // Same 30 s visible refresh as the rest of the Dashboard, so journals posted meanwhile appear.
  useEffect(() => pollWhileVisible(() => { void refresh(); }, DASHBOARD_REFRESH_MS, document), [refresh]);
  if (loading) return <p className="dash-muted" role="status">Loading monthly finances.</p>;
  if (!data) return <ErrorState message={error || "Monthly finances are unavailable."} retry={refresh} />;
  if (!data.periods.length) return <p className="dash-muted">
    {basis === "accrual" ? "No income or expense journals in this period." : "No qualifying cash activity in this period."}
  </p>;

  return <>
    <p className="dash-muted">{data.accrualNote || data.cashBasisNote}</p>
    <div className="dash-money-grid">
      {data.totals.map((row) => <div className="dash-money" key={row.currency}>
        <strong>{row.currency === "UNSPECIFIED" ? "Currency unspecified" : row.currency}</strong>
        <span>Income {row.income}</span>
        <span>Expenses {row.expenses}</span>
        <span>Net result {row.netProfit}</span>
      </div>)}
    </div>
    <DataTable rows={[...data.periods].reverse()} rowKey={(row) => `${row.period}:${row.currency}`} columns={[
      { label: "Month", render: (row) => row.period.slice(0, 7) },
      { label: "Currency", render: (row) => row.currency === "UNSPECIFIED" ? "Unspecified" : row.currency },
      { label: "Income", render: (row) => row.income },
      { label: "Expenses", render: (row) => row.expenses },
      { label: "Net result", render: (row) => row.netProfit },
    ]} />
  </>;
}

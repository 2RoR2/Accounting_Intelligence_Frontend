"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { EmptyState, ErrorState, Field, formatDate, LoadingState, money, PageHeader, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  getBusinessSummary,
  type BusinessSummary,
  type SummaryOverdue,
  type SummaryOwed,
  type SummaryParty,
  type SummaryProduct,
  type SummaryResult,
} from "@/lib/api/business-summary";
import { monthLabel, overdueLabel, shareOfTotal, trendScale } from "@/lib/business-summary";
import "@/styles/business-summary.css";

type View = "month" | "today";

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return <div className="biz-figure">
    <span>{label}</span>
    <strong className={tone ? `biz-${tone}` : undefined}>{money(value)}</strong>
    {hint && <small>{hint}</small>}
  </div>;
}

function Headline({ result, view }: { result: SummaryResult; view: View }) {
  const period = view === "today" ? "today" : "this month";
  return <section className="biz-figures" aria-label={`Headline figures for ${period}`}>
    <Figure label="Sales" value={result.sales} hint="Posted sales, recorded tax excluded" />
    <Figure label="Purchases and expenses" value={result.expenses} hint="Cost of sales and running costs" />
    <Figure label="Gross profit" value={result.grossProfit}
      hint={result.costOfSalesTracked ? "Sales less cost of sales" : "No cost-of-sales accounts, so this equals sales"} />
    <Figure label="Net profit" value={result.netProfit} tone={Number(result.netProfit) < 0 ? "bad" : "good"}
      hint="Gross profit less running costs" />
    <Figure label="Cash in" value={result.cashIn} hint="Into cash and bank accounts" />
    <Figure label="Cash out" value={result.cashOut} hint="Out of cash and bank accounts" />
  </section>;
}

/** Open items and the books differ by payments posted on account and not yet matched to an invoice or bill. */
function Unallocated({ owed, noun }: { owed: SummaryOwed; noun: "invoices" | "bills" }) {
  if (!owed.unallocated || Number(owed.unallocated) === 0) return null;  // older backend: field absent
  return <p className="biz-muted">
    Open {noun} {money(owed.openItems)}, less {money(owed.unallocated)} unallocated payments
  </p>;
}

function Position({ result }: { result: SummaryResult }) {
  const { bank, receivables, payables, asOf } = result.position;
  return <section className="biz-position" aria-label="Where the business stands">
    <Panel title="Bank balance" subtitle={`As of ${formatDate(asOf)}`} className="biz-card">
      <p className="biz-total">{money(bank.total)}</p>
      {bank.accounts.length === 0
        ? <p className="biz-muted">No bank or cash account is set up yet.</p>
        : <ul className="biz-accounts">{bank.accounts.map((account) => <li key={account.accountId}>
          <span>{account.name}</span><strong>{money(account.balance)}</strong>
        </li>)}</ul>}
    </Panel>
    <Panel title="Owed to us" subtitle="Customers still to pay" className="biz-card">
      <p className="biz-total">{money(receivables.total)}</p>
      <Unallocated owed={receivables} noun="invoices" />
      <p className={Number(receivables.overdue) > 0 ? "biz-overdue" : "biz-muted"}>
        {Number(receivables.overdue) > 0
          ? `${money(receivables.overdue)} overdue (${receivables.overdueCount} ${receivables.overdueCount === 1 ? "invoice" : "invoices"})`
          : "Nothing overdue"}
      </p>
    </Panel>
    <Panel title="Owed by us" subtitle="Suppliers we still owe" className="biz-card">
      <p className="biz-total">{money(payables.total)}</p>
      <Unallocated owed={payables} noun="bills" />
      <p className={Number(payables.overdue) > 0 ? "biz-overdue" : "biz-muted"}>
        {Number(payables.overdue) > 0
          ? `${money(payables.overdue)} overdue (${payables.overdueCount} ${payables.overdueCount === 1 ? "bill" : "bills"})`
          : "Nothing overdue"}
      </p>
    </Panel>
  </section>;
}

function TopList({ title, rows, empty }: { title: string; rows: SummaryParty[]; empty: string }) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2);
  return <Panel title={title} className="biz-card">
    {rows.length === 0 ? <p className="biz-muted">{empty}</p> : <ol className="biz-top">
      {rows.map((row) => <li key={row.name}>
        <div><span>{row.name}</span><strong>{money(row.amount)}</strong></div>
        <i style={{ width: `${Math.round(shareOfTotal(row.amount, total) * 100)}%` }} aria-hidden="true" />
      </li>)}
    </ol>}
  </Panel>;
}

function OverdueTable({ title, rows, empty }: { title: string; rows: SummaryOverdue[]; empty: string }) {
  return <Panel title={title} subtitle="Largest overdue amounts first, up to 10" className="biz-card">
    {rows.length === 0 ? <p className="biz-muted">{empty}</p> : <div className="data-table-wrap">
      <table className="data-table biz-table">
        <thead><tr><th>Contact</th><th>Number</th><th>Due</th><th>Overdue</th><th className="num">Outstanding</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.documentNumber}-${row.contactName}`}>
          <td>{row.contactName}</td>
          <td>{row.documentNumber}</td>
          <td>{row.dueDate ? formatDate(row.dueDate) : "No due date"}</td>
          <td><span className="biz-chip">{overdueLabel(row.daysOverdue)}</span></td>
          <td className="num">{money(row.outstanding)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </Panel>;
}

/** Six months of sales and expenses as bars with the net profit line over them. Plain SVG on the page's theme colours. */
function TrendChart({ trend }: { trend: BusinessSummary["trend"] }) {
  const scale = trendScale(trend);
  const width = 600;
  const height = 230;
  const left = 12;
  const top = 18;
  const bottom = 34;
  const plot = height - top - bottom;
  const y = (value: number) => top + (1 - scale.share(value)) * plot;
  const zero = y(0);
  const slot = (width - left * 2) / trend.length;
  const bar = Math.min(26, slot / 3);
  const points = trend.map((row, index) => `${left + slot * index + slot / 2},${y(Number(row.netProfit))}`).join(" ");
  return <figure className="biz-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sales, expenses and net profit for the last six months">
      <line x1={left} x2={width - left} y1={zero} y2={zero} className="biz-axis" />
      {trend.map((row, index) => {
        const centre = left + slot * index + slot / 2;
        const sales = Number(row.sales);
        const expenses = Number(row.expenses);
        return <g key={row.month}>
          <rect className="biz-bar-sales" x={centre - bar - 1} width={bar} y={Math.min(y(sales), zero)} height={Math.abs(zero - y(sales))} rx="2">
            <title>{`${monthLabel(row.month)} sales ${money(row.sales)}`}</title>
          </rect>
          <rect className="biz-bar-expenses" x={centre + 1} width={bar} y={Math.min(y(expenses), zero)} height={Math.abs(zero - y(expenses))} rx="2">
            <title>{`${monthLabel(row.month)} expenses ${money(row.expenses)}`}</title>
          </rect>
          <circle className="biz-dot" cx={centre} cy={y(Number(row.netProfit))} r="4">
            <title>{`${monthLabel(row.month)} net profit ${money(row.netProfit)}`}</title>
          </circle>
          <text x={centre} y={height - 12} textAnchor="middle" className="biz-axis-label">{monthLabel(row.month)}</text>
        </g>;
      })}
      <polyline className="biz-line" points={points} />
    </svg>
    <figcaption className="biz-legend">
      <span><i className="biz-key-sales" /> Sales</span>
      <span><i className="biz-key-expenses" /> Expenses</span>
      <span><i className="biz-key-profit" /> Net profit</span>
    </figcaption>
    <table className="biz-trend-values">
      <caption className="sr-only">Sales, expenses and net profit by month</caption>
      <thead><tr><th>Month</th><th className="num">Sales</th><th className="num">Expenses</th><th className="num">Net profit</th></tr></thead>
      <tbody>{trend.map((row) => <tr key={row.month}>
        <td>{monthLabel(row.month)}</td><td className="num">{money(row.sales)}</td>
        <td className="num">{money(row.expenses)}</td><td className="num">{money(row.netProfit)}</td>
      </tr>)}</tbody>
    </table>
  </figure>;
}

function BreakdownTable({ title, subtitle, head, rows, total, empty }: {
  title: string;
  subtitle: string;
  head: string;
  rows: Array<{ key: string; label: string; detail?: string | null; amount: string; named: boolean }>;
  total: string;
  empty: string;
}) {
  return <Panel title={title} subtitle={subtitle} className="biz-card">
    {rows.length === 0 ? <p className="biz-muted">{empty}</p> : <div className="data-table-wrap">
      <table className="data-table biz-table">
        <thead><tr><th>{head}</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.key} className={row.named ? undefined : "biz-unnamed"}>
            <td>{row.label}{row.detail && <small> · {row.detail}</small>}</td>
            <td className="num">{money(row.amount)}</td>
          </tr>)}
          <tr className="biz-total-row"><th>Total</th><td className="num">{money(total)}</td></tr>
        </tbody>
      </table>
    </div>}
  </Panel>;
}

const partyRows = (rows: SummaryParty[]) =>
  rows.map((row) => ({ key: row.name, label: row.name, detail: `${row.entries} ${row.entries === 1 ? "entry" : "entries"}`, amount: row.amount, named: row.named }));
const productRows = (rows: SummaryProduct[]) =>
  rows.map((row) => ({ key: row.name, label: row.name, detail: row.quantity ? `qty ${row.quantity}` : null, amount: row.amount, named: row.named }));

function SummaryBody({ data, view }: { data: BusinessSummary; view: View }) {
  const result = view === "today" ? data.today : data.month;
  const { month } = data;
  return <>
    <Headline result={result} view={view} />
    <p className="biz-note">
      {data.profitNote} Recorded tax this month: output {money(month.recordedTax.outputTax)}, input {money(month.recordedTax.inputTax)}
      {" "}({month.recordedTax.note.toLowerCase()}).
    </p>
    <Position result={result} />
    <div className="biz-two">
      <OverdueTable title="Overdue invoices" rows={data.overdueInvoices} empty="No customer invoice is overdue." />
      <OverdueTable title="Overdue bills" rows={data.overdueBills} empty="No supplier bill is overdue." />
    </div>
    {view === "today" ? <p className="biz-hint">Switch to “This month” for the top customers and suppliers, the six-month trend and the breakdown tables.</p> : <>
      <div className="biz-two">
        <TopList title="Top 5 customers" rows={data.topCustomers} empty="No sales to a named customer this month." />
        <TopList title="Top 5 suppliers" rows={data.topSuppliers} empty="No purchases from a named supplier this month." />
      </div>
      <Panel title="Last six months" subtitle="Sales, expenses and net profit, month by month" className="biz-card">
        <TrendChart trend={data.trend} />
      </Panel>
      <div className="biz-three">
        <BreakdownTable title="Sales by customer" subtitle="Posted sales this month" head="Customer"
          rows={partyRows(data.salesByCustomer)} total={month.sales} empty="No sales posted this month." />
        <BreakdownTable title="Purchases by supplier" subtitle="Posted purchases and expenses this month" head="Supplier"
          rows={partyRows(data.purchasesBySupplier)} total={month.expenses} empty="No purchases posted this month." />
        <BreakdownTable title="Sales by product" subtitle="From typed invoices and notes; the rest is not itemised" head="Product"
          rows={productRows(data.salesByProduct)} total={month.sales} empty="No sales posted this month." />
      </div>
    </>}
  </>;
}

export function BusinessSummaryPage() {
  const [view, setView] = useState<View>("month");
  const [month, setMonth] = useState("");
  const { data, error, refresh } = useResource(() => getBusinessSummary(month || undefined), `business-summary:${month}`);
  const latest = data?.date.slice(0, 7);
  const periodText = !data ? "" : view === "today"
    ? formatDate(data.today.date)
    : `${formatDate(data.month.fromDate)} – ${formatDate(data.month.toDate)}`;
  const quiet = data && view === "month" && Number(data.month.sales) === 0 && Number(data.month.expenses) === 0;

  return <div className="dashboard-page reports-page biz-summary">
    <PageHeader
      title="Business summary"
      description="The figures an owner checks first, from posted books only."
      actions={<button type="button" className="btn" disabled={!data} onClick={() => window.print()}>
        <Printer size={15} aria-hidden /> Print / Save as PDF
      </button>}
    />
    <div className="biz-controls">
      <div className="biz-toggle" role="group" aria-label="Period">
        {([["month", "This month"], ["today", "Today"]] as const).map(([key, label]) =>
          <button key={key} type="button" className={view === key ? "active" : ""} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      </div>
      <Field label="Month">
        <input type="month" value={month || data?.monthCode || ""} max={latest} min="2000-01" required
          onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} />
      </Field>
      {data && <p className="biz-period">{periodText}</p>}
    </div>
    {data && <div className="biz-print-head">
      <strong>{data.company}</strong>
      <span>Business summary · {view === "today" ? "Today" : "This month"} · {periodText}</span>
      <span>Amounts in {data.currency}. Recorded tax, not a tax return.</span>
    </div>}
    {error && <ErrorState message={error} retry={refresh} />}
    {!data && !error && <LoadingState variant="dashboard" />}
    {quiet && <EmptyState message="Nothing is posted in this month yet. Posted invoices, bills and bank entries show up here." />}
    {data && <SummaryBody data={data} view={view} />}
  </div>;
}

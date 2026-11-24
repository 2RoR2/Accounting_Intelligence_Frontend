"use client";

import Link from "next/link";
import { documentDisplayName } from "@/lib/document-display-name";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarClock, CheckCircle2, ClipboardCheck, FileSearch, Files, HandCoins,
  Landmark, Plus, Receipt, RotateCcw, Search, ShieldAlert, Send, type LucideIcon,
} from "lucide-react";
import { DashboardWidgets } from "./dashboard-widgets";
import { useDashboardLayout } from "./use-dashboard-layout";
import { ErrorState, LoadingState, StatusBadge, formatDate } from "@/components/common/ui";
import { MalaysiaDayNight } from "@/components/common/dashboard/malaysia-day-night";
import { useResource } from "@/features/common/hooks/use-resource";
import { getHomeSummary } from "@/lib/api/home.service";
import { getDocuments } from "@/lib/api/document.service";
import { getMoneyTransactions } from "@/lib/api/money.service";
import { getProfitAndLossDashboard } from "@/lib/api/ledger.service";
import { DASHBOARD_REFRESH_MS, dashboardView, firstName, greetingFor, pollWhileVisible } from "@/lib/dashboard";
import { documentKindLabel } from "@/lib/glossary";
import { areaFor, monthEndView, type TileId, type TodayRole, type TodayTileView } from "@/lib/today";
import {
  DASH_PERIODS, agingFigures, periodRange, periodRows, postedTotals, rm, type DashPeriod, type MoneyFigure,
} from "@/lib/template-dashboard";
import type { User } from "@/types";

const ICONS: Record<TileId, LucideIcon> = {
  toReview: FileSearch, needsFixing: ShieldAlert, readyToApprove: ClipboardCheck, waitingApproval: Send,
  bankToMatch: Landmark, billsDueSoon: CalendarClock, billsOverdue: AlertTriangle, invoicesOverdue: HandCoins,
  journalsToPost: Receipt, paymentsToPost: Landmark,
};
const AGE_LABEL: Record<string, string> = {
  not_due: "Not due", no_due_date: "No due date", "1_30_days": "1–30 days", "31_60_days": "31–60 days",
  "61_90_days": "61–90 days", over_90_days: "Over 90 days",
};
const AGE_ORDER = ["not_due", "no_due_date", "1_30_days", "31_60_days", "61_90_days", "over_90_days"];
const NO_JOURNALS = "No posted journals in this period. Approved documents count once they are posted.";

const documentAction = (status: string) => {
  if (status === "FAILED") return "See problem";
  if (["EXTRACTED", "IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(status)) return "Review";
  if (["UPLOADED", "QUEUED", "PROCESSING"].includes(status)) return "Check progress";
  return "View record";
};

/** One line of "Attention needed": the count and what it is (or "—" with the reason when the backend cannot give it). */
function AttentionRow({ tile }: { tile: TodayTileView }) {
  const Icon = ICONS[tile.id];
  const unavailable = tile.tone === "unavailable";
  const content = <>
    <span className={`dash-row-icon dash-tone-${tile.tone}`} aria-hidden><Icon size={18} /></span>
    <span className="dash-row-text">
      {unavailable
        ? <strong>{tile.title}: <span className="dash-row-unknown">{tile.value.toLowerCase()}</span></strong>
        : <strong><b>{tile.value}</b> {tile.title.toLowerCase()}</strong>}
      <small>{unavailable ? tile.details[0] ?? "" : tile.caption}</small>
    </span>
    <ArrowRight size={18} aria-hidden className="dash-row-arrow" />
  </>;
  return tile.href ? <Link className="dash-attention-row" href={tile.href}>{content}</Link> : <div className="dash-attention-row">{content}</div>;
}

/** "INVOICES · RM 1,200.00 · Outstanding": the whole tile opens the matching approved records. */
function MoneyKpi({ kind, label, figure, currency, href, hint }: { kind: "invoice" | "bill"; label: string; figure: MoneyFigure; currency: string; href: string; hint: string }) {
  const note = figure.amount === null ? hint
    : figure.otherCurrencies ? `${label} · plus ${figure.otherCurrencies} other currenc${figure.otherCurrencies === 1 ? "y" : "ies"}` : label;
  return <Link href={href} className={`dashboard-reference-kpi kpi-${kind}`} title={figure.amount === null ? hint : undefined}>
    <span>{kind === "invoice" ? "INVOICES" : "BILLS"}</span><strong>{rm(figure.amount, currency)}</strong><small>{note}</small><b>{kind === "invoice" ? "＋" : "−"}</b>
  </Link>;
}

function Bars({ values, label, tone }: { values: Array<{ key: string; value: number; title: string }>; label: string; tone?: (value: number) => string }) {
  const max = Math.max(1, ...values.map((item) => Math.abs(item.value)));
  return <div className={`dashboard-mini-chart${tone ? " pnl-chart" : ""}`} role="img" aria-label={label}>
    {values.map((item) => <span key={item.key} className={tone?.(item.value)} title={item.title} style={{ height: `${Math.max(4, (Math.abs(item.value) / max) * 100)}%` }} />)}
  </div>;
}

/** The Dashboard: the team's `latest_update` layout with live figures; "—" marks a figure the data cannot give yet. */
export function DashboardPage({ user }: { user: User }) {
  const role: TodayRole = user.role === "LOCAL_ADMIN" ? "LOCAL_ADMIN" : "ACCOUNTANT";
  const base = `/${areaFor(role)}`;
  const [period, setPeriod] = useState<DashPeriod>("12m");
  const [bankAccount, setBankAccount] = useState("all");
  const summary = useResource(() => getHomeSummary(user), `dashboard:${user.id}`);
  const asOf = summary.data?.asOf ?? new Date().toISOString().slice(0, 10);
  const currency = summary.data?.currency ?? "MYR";
  const range = periodRange(period, asOf);
  const months = periodRange("12m", asOf);
  const pnl = useResource(() => getProfitAndLossDashboard(range.fromDate, range.toDate, "accrual", range.granularity).catch(() => null),
    `dashboard-pnl:${user.id}:${range.fromDate}:${range.toDate}:${range.granularity}`);
  const monthly = useResource(() => getProfitAndLossDashboard(months.fromDate, months.toDate, "accrual", "month").catch(() => null),
    `dashboard-monthly:${user.id}:${months.fromDate}:${months.toDate}`);
  const bank = useResource(() => Promise.all([getMoneyTransactions(user, "money_in"), getMoneyTransactions(user, "money_out")])
    .then(([moneyIn, moneyOut]) => [...moneyIn, ...moneyOut]).catch(() => null), `dashboard-bank:${user.id}`);
  const recent = useResource(() => getDocuments(user).catch(() => []), `dashboard-docs:${user.id}`);
  const toReview = useResource(() => getDocuments(user, { lane: "to-review" }).catch(() => null), `dashboard-review:${user.id}`);
  const { refresh: r1 } = summary, { refresh: r2 } = pnl, { refresh: r3 } = monthly, { refresh: r5 } = recent, { refresh: r6 } = toReview;
  // An open Dashboard stays current: refresh every 30 s while the tab is visible, and on return to it.
  // Bank lines load once: that list is the whole imported history, too heavy to poll.
  useEffect(() => pollWhileVisible(() => { [r1, r2, r3, r5, r6].forEach((refresh) => void refresh()); }, DASHBOARD_REFRESH_MS, document),
    [r1, r2, r3, r5, r6]);
  const bankRows = useMemo(() => bank.data ?? [], [bank.data]);
  const bankAccounts = useMemo(() => [...new Set(bankRows.map((row) => row.bankAccountRef).filter((ref): ref is string => !!ref))].sort(), [bankRows]);

  const layout = useDashboardLayout(user.id);

  if (summary.loading) return <LoadingState variant="dashboard" />;
  if (summary.error || !summary.data) return <ErrorState message={summary.error} retry={summary.refresh} />;

  const view = dashboardView(summary.data, role);
  const month = monthEndView(summary.data, role);
  const hour = Number(new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", hour12: false }).format(new Date()));
  const company = (user.tenantName || "").split("—")[0].trim();
  // Only the report for the selected dates: the previous period's figures are not shown while the new one loads.
  const report = pnl.data && pnl.data.fromDate === range.fromDate && pnl.data.toDate === range.toDate && pnl.data.granularity === range.granularity ? pnl.data : null;
  const reportHint = pnl.loading || (pnl.data && !report) ? "Loading…" : "The profit-and-loss report could not be loaded.";
  const home = (value: string | null | undefined) => (value ?? currency).toUpperCase() === currency.toUpperCase();
  const others = (values: Array<string | null | undefined>) => [...new Set(values.filter((value) => !home(value)).map((value) => value ?? "unspecified"))];
  const noJournals = (rows: Array<{ currency: string }> | undefined) => {
    const elsewhere = others((rows ?? []).map((row) => row.currency));
    return elsewhere.length ? `No posted ${currency} journals in this period; activity in ${elsewhere.join(", ")} is not shown here.` : NO_JOURNALS;
  };
  const aging = agingFigures(report?.aging, currency);
  const totals = postedTotals(report, currency);
  const periods = periodRows(report, currency);
  const year = periodRows(monthly.data, currency);
  // One bar per day (per month for long periods), net of money in and out, in the home currency only.
  const inPeriod = bankRows.filter((row) => row.postedDate >= range.fromDate && row.postedDate <= range.toDate && (bankAccount === "all" || row.bankAccountRef === bankAccount));
  const cashOther = others(inPeriod.map((row) => row.currency));
  const buckets = new Map<string, { moneyIn: number; moneyOut: number }>();
  for (const row of inPeriod.filter((item) => home(item.currency))) {
    const key = range.granularity === "month" ? row.postedDate.slice(0, 7) : row.postedDate;
    const bucket = buckets.get(key) ?? { moneyIn: 0, moneyOut: 0 };
    bucket[row.direction === "money_out" ? "moneyOut" : "moneyIn"] += Math.abs(Number(row.amount) || 0);
    buckets.set(key, bucket);
  }
  const cashflow = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, ...value, net: value.moneyIn - value.moneyOut }));
  const maxCash = Math.max(1, ...cashflow.map((row) => Math.abs(row.net)));
  const reviewDocs = (toReview.data ?? []).slice(0, 5);
  const docs = (recent.data ?? []).slice(0, 6);
  const periodLabel = (value: string) => (range.granularity === "month" ? value.slice(0, 7) : value);
  const outstanding = [
    { id: "invoicesOutstanding", title: "Outstanding invoices", receivable: true, href: `${base}/records?category=ACCOUNTS_RECEIVABLE` },
    { id: "billsOutstanding", title: "Outstanding bills", receivable: false, href: `${base}/records?category=ACCOUNTS_PAYABLE` },
  ];

  return (
    <div className="dashboard-page dash-home">
      <header className="workspace-dashboard-header dashboard-reference-header">
        <MalaysiaDayNight />
        <div>
          <span className="workspace-dashboard-kicker">{formatDate(summary.data.asOf)}{company ? ` · ${company}` : ""}</span>
          <h1>{greetingFor(hour % 24)}, {firstName(user.name)}</h1>
          <p className="dash-headline">{view.headline}</p>
        </div>
        <div className="workspace-dashboard-actions">
          <Link className="btn" href={`${base}/reports?view=business-summary`}><BarChart3 size={15} aria-hidden /> Business summary</Link>
          <Link className="btn" href={`${base}/documents`}><Search size={15} aria-hidden /> Search documents</Link>
          <Link className="btn primary" href={`${base}/upload`}><Plus size={15} aria-hidden /> Upload documents</Link>
        </div>
      </header>

      <section className="dashboard-daily-work" aria-label="Dashboard filters and today's work">
        <div className="dashboard-shared-filters">
          <label>Period<select value={period} onChange={(event) => setPeriod(event.target.value as DashPeriod)}>
            {DASH_PERIODS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
          <label>Bank account<select value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} disabled={!bankAccounts.length}
            title={bankAccounts.length ? undefined : "No bank statements imported yet."}>
            <option value="all">All bank accounts</option>
            {bankAccounts.map((account) => <option value={account} key={account}>{account}</option>)}
          </select></label>
          <label>Cost centre<select value="all" disabled title="Cost centres are not recorded on documents yet.">
            <option value="all">All cost centres</option>
          </select></label>
          <div className="dash-layout-actions">
            <small className="dash-layout-hint">Drag a panel by its handle to rearrange it. Saved in this browser.</small>
            <button type="button" className="btn dash-reset-layout" aria-disabled={layout.isDefault}
              title={layout.isDefault ? "The panels are already in the default order." : "Put the panels back in the default order."}
              onClick={() => { if (!layout.isDefault) layout.reset(); }}>
              <RotateCcw size={14} aria-hidden /> Reset layout
            </button>
          </div>
        </div>
      </section>

      <DashboardWidgets order={layout.order} onOrderChange={layout.update} widgets={{
        attention: (
        <section className="dash-card" aria-labelledby="dash-attention-title">
          <div className="dash-card-head"><div><h2 id="dash-attention-title">Attention needed</h2><p>Your work for today, in the order to do it.</p></div></div>
          {view.attention.length > 0 && <div className="dash-attention-list">{view.attention.map((tile) => <AttentionRow key={tile.id} tile={tile} />)}</div>}
          {view.allClear && <p className="dash-all-clear"><CheckCircle2 size={18} aria-hidden /> Nothing needs you right now.</p>}
        </section>
        ),
        monthEnd: (
        <section className="dash-card" aria-labelledby="dash-month-title">
          <div className="dash-card-head"><div><h2 id="dash-month-title">{month.title}</h2><p>Month-end progress for the whole company.</p></div></div>
          {month.available ? (
            <ol className="dash-month">
              {month.steps.map((step) => (
                <li key={step.key} className={step.complete ? "complete" : ""} title={step.details.join(" ")}>
                  <div className="dash-month-row">
                    {step.href ? <Link href={step.href}>{step.label}</Link> : <span>{step.label}</span>}
                    <strong>{step.complete ? <><CheckCircle2 size={14} aria-hidden /> Done</> : step.value}</strong>
                  </div>
                  <div className={`dash-progress${step.percent === null ? " dash-progress-none" : ""}`} role="progressbar" aria-label={step.label}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={step.percent ?? 0}><span style={{ width: `${step.percent ?? 0}%` }} /></div>
                </li>
              ))}
            </ol>
          ) : <p className="dash-muted" title={month.details.join(" ")}>— Month-end figures are not available yet.</p>}
        </section>
        ),
        monthlySummary: (
        <section className="dashboard-reference-panel monthly-summary-panel">
          <div className="dashboard-reference-panel-heading">
            <div><h2>Monthly summary</h2><p className="dashboard-panel-help">Posted income and expenses over the last 12 months.</p></div>
            <Link href={`${base}/ledger?section=monthly`}>Open ledger <ArrowRight size={13} /></Link>
          </div>
          <div className="monthly-summary-grid">
            <div><span>Income</span><strong>{rm(year.income, currency)}</strong></div>
            <div><span>Expenses</span><strong>{rm(year.expenses, currency)}</strong></div>
            <div><span>Net result</span><strong className={(year.net ?? "").startsWith("-") ? "negative-value" : "positive-value"}>{rm(year.net, currency)}</strong></div>
            <div><span>Months with activity</span><strong>{year.rows.length || "—"}</strong></div>
          </div>
          {!year.rows.length && <p className="widget-empty">{monthly.loading ? "Loading…" : monthly.data ? noJournals(monthly.data.periods) : "— The monthly report could not be loaded."}</p>}
        </section>
        ),
        monthlyLedger: (
        <section className="dashboard-reference-panel monthly-ledger-panel">
          <div className="dashboard-reference-panel-heading">
            <div><h2>Monthly ledger</h2><p className="dashboard-panel-help">Income, expenses and net result by month.</p></div>
            <Link href={`${base}/ledger?section=journals`}>View journals <ArrowRight size={13} /></Link>
          </div>
          <div className="monthly-ledger-table">
            <div className="monthly-ledger-head"><span>Month</span><span>Income</span><span>Expenses</span><span>Net</span></div>
            {[...year.rows].reverse().map((row) => <Link href={`${base}/ledger?section=journals`} className="monthly-ledger-row" key={row.period}>
              <span>{row.period.slice(0, 7)}</span><strong>{rm(row.income, currency)}</strong><strong>{rm(row.expenses, currency)}</strong>
              <strong className={row.netProfit.startsWith("-") ? "negative-value" : "positive-value"}>{rm(row.netProfit, currency)}</strong>
            </Link>)}
            {!year.rows.length && <div className="widget-empty">Months appear here once journals are posted.</div>}
          </div>
        </section>
        ),
        moneyKpis: (
        <div className="dashboard-reference-kpis" role="group" aria-label="Invoice and bill totals">
          <MoneyKpi kind="invoice" label="Outstanding" figure={aging.invoicesOutstanding} currency={currency} href={`${base}/records?category=ACCOUNTS_RECEIVABLE`} hint={reportHint} />
          <MoneyKpi kind="invoice" label="Overdue" figure={aging.invoicesOverdue} currency={currency} href={`${base}/records?category=ACCOUNTS_RECEIVABLE&due=overdue`} hint={reportHint} />
          <MoneyKpi kind="bill" label="Outstanding" figure={aging.billsOutstanding} currency={currency} href={`${base}/records?category=ACCOUNTS_PAYABLE`} hint={reportHint} />
          <MoneyKpi kind="bill" label="Overdue" figure={aging.billsOverdue} currency={currency} href={`${base}/records?category=ACCOUNTS_PAYABLE&due=overdue`} hint={reportHint} />
        </div>
        ),
        ...(Object.fromEntries(outstanding.map((panel) => {
            const rows = (report?.aging ?? [])
              .filter((item) => panel.receivable === (item.category === "accounts_receivable") && item.currency.toUpperCase() === currency.toUpperCase())
              .sort((a, b) => AGE_ORDER.indexOf(a.bucket) - AGE_ORDER.indexOf(b.bucket));
            const total = Math.max(1, rows.reduce((sum, item) => sum + Number(item.amount), 0));
            return [panel.id, <section key={panel.id} className="dashboard-reference-panel">
              <div className="dashboard-reference-panel-heading"><h2>{panel.title}</h2><Link href={panel.href} title="Lists every approved record on this side; the bar counts unpaid balances only.">View records <ArrowRight size={13} /></Link></div>
              {rows.length > 0 && <div className="dashboard-aging-bar">{rows.map((item, index) => <span key={item.bucket} className={`aging-segment aging-${index % 5}`}
                style={{ width: `${Math.max(1, (Number(item.amount) / total) * 100)}%` }} title={`${AGE_LABEL[item.bucket] ?? item.bucket}: ${rm(item.amount, item.currency)} (${item.itemCount})`} />)}</div>}
              <div className="dashboard-aging-legend">
                {rows.map((item, index) => <span key={item.bucket}><i className={`aging-dot aging-${index % 5}`} />{AGE_LABEL[item.bucket] ?? item.bucket} · {rm(item.amount, item.currency)}</span>)}
                {!rows.length && <span>{!report ? `— ${reportHint}` : (() => {
                  const elsewhere = others(report.aging.filter((item) => panel.receivable === (item.category === "accounts_receivable")).map((item) => item.currency));
                  return elsewhere.length ? `No unpaid ${currency} balance; balances in ${elsewhere.join(", ")} are not shown here.` : "Nothing approved is unpaid.";
                })()}</span>}
              </div>
            </section>] as const;
          })) as Record<"invoicesOutstanding" | "billsOutstanding", ReactNode>),
        income: (
          <section className="dashboard-reference-panel dashboard-chart-panel">
            <div className="dashboard-reference-panel-heading"><div><h2>Income</h2><strong>{rm(totals?.income, currency)}</strong></div>
              <Link href={`${base}/ledger?section=monthly`}>Details <ArrowRight size={13} /></Link></div>
            {periods.rows.length
              ? <Bars label="Income by period" values={periods.rows.map((row) => ({ key: row.period, value: Number(row.income), title: `${periodLabel(row.period)}: ${rm(row.income, currency)}` }))} />
              : <div className="widget-empty">{report ? noJournals(report.periods) : `— ${reportHint}`}</div>}
          </section>
        ),
        profitLoss: (
          <section className="dashboard-reference-panel dashboard-chart-panel">
            <div className="dashboard-reference-panel-heading"><div><h2>Profit &amp; Loss</h2><strong>{rm(totals?.netProfit, currency)}</strong></div>
              <Link href={`${base}/ledger?section=trial`}>Open ledger <ArrowRight size={13} /></Link></div>
            {periods.rows.length
              ? <Bars label="Net profit by period" tone={(value) => (value < 0 ? "negative" : "positive")}
                  values={periods.rows.map((row) => ({ key: row.period, value: Number(row.netProfit), title: `${periodLabel(row.period)}: ${rm(row.netProfit, currency)}` }))} />
              : <div className="widget-empty">{report ? noJournals(report.periods) : `— ${reportHint}`}</div>}
          </section>
        ),
        cashflow: (
          <section className="dashboard-reference-panel dashboard-chart-panel">
            <div className="dashboard-reference-panel-heading"><h2>Cashflow trend</h2><Link href={`${base}/money-in`}>Review bank <ArrowRight size={13} /></Link></div>
            <div className="dashboard-cashflow-chart">
              {cashflow.map((row) => <span key={row.key} className={row.net < 0 ? "out" : "in"}
                style={{ height: `${Math.max(5, (Math.abs(row.net) / maxCash) * 100)}%` }} title={`${row.key}: in ${rm(row.moneyIn.toFixed(2), currency)}, out ${rm(row.moneyOut.toFixed(2), currency)}`} />)}
              {!cashflow.length && <div className="widget-empty">{bank.data === null || bank.error ? "— Bank lines could not be loaded." : bank.loading ? "Loading…" : cashOther.length ? `No ${currency} bank lines in this period; lines in ${cashOther.join(", ")} are not shown.` : "No imported bank lines in this period."}</div>}
            </div>
            <small className="dashboard-chart-note">Imported bank lines in {currency}, net per {range.granularity === "month" ? "month" : "day"}{cashOther.length ? `; ${cashOther.join(", ")} lines not shown` : ""}.</small>
          </section>
        ),
        reviewDocuments: (
          <section className="dashboard-reference-panel dashboard-list-panel">
            <div className="dashboard-reference-panel-heading"><h2>Documents needing review</h2><Link href={`${base}/documents?lane=to-review`}>View all <ArrowRight size={13} /></Link></div>
            {reviewDocs.map((doc) => <Link className="dashboard-reference-list-row" href={`${base}/documents/${doc.id}`} key={doc.id}>
              <span>{formatDate(doc.createdAt)}</span><strong>{documentDisplayName(doc, doc.name)}</strong><StatusBadge status={doc.status} ready={doc.readyToSubmit} role={user.role} />
            </Link>)}
            {!reviewDocs.length && <div className="widget-empty">{toReview.loading ? "Loading…" : toReview.data === null || toReview.error ? "— The review list could not be loaded." : "No documents need review."}</div>}
          </section>
        ),
        recentDocuments: (
      <section className="dash-card workspace-documents-card" aria-labelledby="dash-recent-title">
        <div className="dash-card-head">
          <div><h2 id="dash-recent-title">Recent documents</h2><p>The latest documents you can work on.</p></div>
          <Link className="btn" href={`${base}/documents`}>View all <ArrowRight size={14} aria-hidden /></Link>
        </div>
        <div className="workspace-document-table">
          <div className="workspace-document-row workspace-document-head"><span>Document</span><span>Type</span><span>Uploaded</span><span>Status</span><span>Action</span></div>
          {docs.map((doc) => (
            <Link className="workspace-document-row" key={doc.id} href={`${base}/documents/${doc.id}`}>
              <strong><Files size={15} aria-hidden />{documentDisplayName(doc, doc.name)}</strong>
              <span>{documentKindLabel(doc.type)}</span>
              <span>{formatDate(doc.createdAt)}</span>
              <StatusBadge status={doc.status} ready={doc.readyToSubmit} role={user.role} />
              <span className="document-row-action">{documentAction(doc.status)} <ArrowRight size={13} aria-hidden /></span>
            </Link>
          ))}
          {!docs.length && <div className="workspace-document-empty">{recent.loading ? "Loading documents…" : "No documents yet. Upload an invoice, bill or receipt to begin."}</div>}
        </div>
      </section>
        ),
      }} />
    </div>
  );
}

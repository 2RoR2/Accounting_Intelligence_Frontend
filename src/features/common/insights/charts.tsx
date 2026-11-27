"use client";

import React from "react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HandCoins, Landmark, TrendingUp, WalletCards } from "lucide-react";
import { formatDate, money } from "@/components/common/ui";
import type { Horizon, InsightAnomaly, InsightsForecast, InsightsOverview, Money, SpendRow, SpendSection, TrendPoint } from "./insights-api";
import {
  barWidth, compactMoney, donutSlices, forecastColumns, forecastIsEmpty, horizonFor, largestAmount, linePath, niceScale, percent,
  periodLabel, shortMonth, spendIsEmpty, spendRows, trendColumns, trendIsEmpty, unplottedAnomalies,
} from "./insights-data";

/**
 * Dependency-free SVG charts. Every drawn value is an API figure; the only arithmetic is positioning. Line and
 * bar charts are sized from the container's real pixel width (not a scaled viewBox), so text stays readable at 390 px.
 */

function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(260, Math.round(element.clientWidth)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="ins-empty" role="status">{children}</p>;
}

function Legend({ items }: { items: Array<{ label: string; className: string; shape?: "bar" | "line" | "mark" }> }) {
  return <ul className="ins-legend" aria-label="Chart key">
    {items.map((item) => <li key={item.label}><i className={`ins-swatch ${item.shape ?? "bar"} ${item.className}`} aria-hidden="true" />{item.label}</li>)}
  </ul>;
}

function Readout({ items, label }: { items: Array<[string, string, string?]>; label: string }) {
  return <dl className="ins-readout" aria-label={label} aria-live="polite">
    {items.map(([term, value, tone]) => <div key={term}><dt>{term}</dt><dd className={tone}>{value}</dd></div>)}
  </dl>;
}

const signTone = (value: number) => (value < 0 ? "ins-neg" : undefined);
const plural = (count: number | null, one: string) => (count === null ? "" : ` (${count} ${one}${count === 1 ? "" : "s"})`);

/* ---------- Key figures ---------- */

function Kpi({ label, value, hint, icon, tone }: { label: string; value: Money | null; hint: string; icon: ReactNode; tone?: "good" | "bad" }) {
  return <div className="ins-kpi">
    <div className="ins-kpi-top"><span>{label}</span><i aria-hidden="true">{icon}</i></div>
    <strong className={tone ? `ins-${tone}` : undefined}>{value === null ? "Not available" : money(value)}</strong>
    <small>{hint}</small>
  </div>;
}

export function KpiRow({ overview }: { overview: InsightsOverview }) {
  const { forecast } = overview;
  const thirty = horizonFor(forecast, 30);
  const projected = thirty?.projectedBalance ?? null;
  return <section className="ins-kpis" aria-label="Key figures">
    <Kpi label="Cash now" value={forecast.openingBalance} icon={<Landmark size={18} />}
      hint={forecast.asOf ? `Bank and cash accounts, ${formatDate(forecast.asOf)}` : "Bank and cash accounts"} />
    <Kpi label="Projected cash, 30 days" value={projected} icon={<TrendingUp size={18} />}
      tone={projected !== null && Number(projected) < 0 ? "bad" : undefined} hint="From recorded due dates" />
    <Kpi label="Payables due, 30 days" value={thirty?.payablesDue ?? null} icon={<WalletCards size={18} />} hint="Open bills, including past due" />
    <Kpi label="Receivables due, 30 days" value={thirty?.receivablesDue ?? null} icon={<HandCoins size={18} />} hint="Open invoices, including past due" />
  </section>;
}

/* ---------- Cash forecast ---------- */

export function ForecastChart({ forecast, days }: { forecast: InsightsForecast; days: Horizon }) {
  const [ref, width] = useWidth();
  const [pick, setPick] = useState<number | null>(null);
  const columns = forecastColumns(forecast, days);
  // The measured wrapper stays mounted in the empty states, so the width is right when data arrives later.
  if (columns.length === 0) return <div ref={ref} className="ins-chart"><ChartEmpty>No cash forecast is available for this period.</ChartEmpty></div>;
  if (forecastIsEmpty(forecast, days)) {
    return <div ref={ref} className="ins-chart">
      <ChartEmpty>No open invoices or bills have a recorded due date in the next {days} days.</ChartEmpty>
    </div>;
  }

  const compact = width < 520;
  const height = compact ? 250 : 300;
  const margin = { left: compact ? 54 : 64, right: 10, top: 14, bottom: 30 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const num = (value: string | null) => (value === null ? 0 : Number(value));
  const scale = niceScale(columns.flatMap((column) => [num(column.balance), num(column.receivables), -num(column.payables)]));
  const y = (value: number) => margin.top + ((scale.max - value) / (scale.max - scale.min)) * innerHeight;
  const band = innerWidth / columns.length;
  const cx = (index: number) => margin.left + band * (index + 0.5);
  const barWidthPx = Math.max(6, Math.min(30, band * 0.26));
  const lastWithBalance = columns.reduce((found, column, index) => (column.balance !== null ? index : found), 0);
  const active = Math.min(pick ?? lastWithBalance, columns.length - 1);
  const current = columns[active];
  const points = columns.flatMap((column, index): Array<[number, number]> => (column.balance === null ? [] : [[cx(index), y(Number(column.balance))]]));
  const horizon = horizonFor(forecast, days);

  return <div ref={ref} className="ins-chart">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Projected cash over the next ${days} days from recorded due dates. Cash now ${money(forecast.openingBalance ?? 0)}${horizon?.projectedBalance ? `, projected ${money(horizon.projectedBalance)}` : ""}.`}>
      {scale.ticks.map((tick) => <g key={tick}>
        <line className={tick === 0 ? "ins-axis-zero" : "ins-grid"} x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
        <text className="ins-tick" x={margin.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{compactMoney(tick)}</text>
      </g>)}
      {columns.map((column, index) => <g key={column.key}>
        {index === active && <rect className="ins-active" x={margin.left + band * index} y={margin.top} width={band} height={innerHeight} rx={6} />}
        {num(column.receivables) > 0 && <rect className="ins-bar-in" x={cx(index) - barWidthPx - 1} width={barWidthPx} rx={2}
          y={y(num(column.receivables))} height={Math.max(1, y(0) - y(num(column.receivables)))} />}
        {num(column.payables) > 0 && <rect className="ins-bar-out" x={cx(index) + 1} width={barWidthPx} rx={2}
          y={y(0)} height={Math.max(1, y(-num(column.payables)) - y(0))} />}
        <text className="ins-tick" x={cx(index)} y={height - 9} textAnchor="middle">{column.label}</text>
      </g>)}
      {points.length > 1 && <path className="ins-line" d={linePath(points)} fill="none" />}
      {columns.map((column, index) => column.balance === null ? null : <circle key={column.key}
        className={`ins-dot${Number(column.balance) < 0 ? " neg" : ""}`} cx={cx(index)} cy={y(Number(column.balance))} r={index === active ? 5 : 3.5} />)}
      {columns.map((column, index) => <rect key={`hit-${column.key}`} className="ins-hit" tabIndex={0}
        x={margin.left + band * index} y={margin.top} width={band} height={innerHeight}
        aria-label={`${column.title}${column.balance !== null ? `: projected cash ${money(column.balance)}` : ""}${column.receivables !== null ? `, receivables due ${money(column.receivables)}, payables due ${money(column.payables ?? 0)}` : ""}`}
        onMouseEnter={() => setPick(index)} onFocus={() => setPick(index)} onClick={() => setPick(index)}>
        <title>{column.title}</title>
      </rect>)}
    </svg>
    <Legend items={[
      { label: "Receivables due", className: "ins-bar-in" },
      { label: "Payables due", className: "ins-bar-out" },
      { label: "Projected cash", className: "ins-line-key", shape: "line" },
    ]} />
    <Readout label="Selected period" items={[
      [current.title, ""],
      ...(current.receivables !== null ? [["Receivables due", `${money(current.receivables)}${plural(current.receivableCount, "invoice")}`] as [string, string]] : []),
      ...(current.payables !== null ? [["Payables due", `${money(current.payables)}${plural(current.payableCount, "bill")}`] as [string, string]] : []),
      current.balance !== null
        ? [current.key === "opening" ? "Cash now" : "Projected cash", money(current.balance), signTone(Number(current.balance)) ?? "ins-strong"]
        : ["Projected cash", "Counted in the 30-day figure"],
    ]} />
  </div>;
}

/** The due-date buckets as a table, for readers who want the numbers behind the bars. */
export function BucketTable({ forecast }: { forecast: InsightsForecast }) {
  if (forecast.buckets.length === 0) return null;
  return <div className="ins-table-wrap">
    <table className="ins-table">
      <caption>Open items by recorded due date</caption>
      <thead><tr><th scope="col">Due</th><th scope="col">Receivables</th><th scope="col">Payables</th></tr></thead>
      <tbody>
        {forecast.buckets.map((bucket) => <tr key={bucket.key}>
          <th scope="row">{bucket.label}</th>
          <td>{bucket.receivables === null ? "Not available" : money(bucket.receivables)}{plural(bucket.receivableCount, "item")}</td>
          <td>{bucket.payables === null ? "Not available" : money(bucket.payables)}{plural(bucket.payableCount, "item")}</td>
        </tr>)}
        <tr className="ins-table-extra">
          <th scope="row">No due date</th>
          <td>{forecast.noDueDate.receivables === null ? "Not available" : money(forecast.noDueDate.receivables)}{plural(forecast.noDueDate.receivableCount, "item")}</td>
          <td>{forecast.noDueDate.payables === null ? "Not available" : money(forecast.noDueDate.payables)}{plural(forecast.noDueDate.payableCount, "item")}</td>
        </tr>
      </tbody>
    </table>
  </div>;
}

/* ---------- Spend by supplier ---------- */

const SUPPLIER_ROWS = 6;

export function SupplierBars({ section, period }: { section: SpendSection; period: string }) {
  const [showAll, setShowAll] = useState(false);
  if (spendIsEmpty(section)) return <ChartEmpty>No supplier spend is recorded for {periodLabel(period)}.</ChartEmpty>;
  const all = spendRows(section);
  const largest = largestAmount(all);
  const rows = showAll ? all : all.slice(0, SUPPLIER_ROWS);
  return <div className="ins-chart">
    <ol className="ins-bars" aria-label={`Spend by supplier, ${periodLabel(period)}`}>
      {rows.map((row) => <li key={row.key} className={row.isOther ? "other" : undefined}>
        <div className="ins-bar-head"><span>{row.name}</span><strong>{money(row.amount)}</strong></div>
        <div className="ins-bar-track" role="img" aria-label={`${row.name}: ${money(row.amount)}${percent(row.share) ? `, ${percent(row.share)} of spend` : ""}`}>
          <i style={{ width: `${Math.max(2, barWidth(row.amount, largest) * 100)}%` }} />
        </div>
        <small>{[percent(row.share) ? `${percent(row.share)} of spend` : null, row.entries !== null ? `${row.entries} ${row.entries === 1 ? "entry" : "entries"}` : null].filter(Boolean).join(" · ")}</small>
      </li>)}
    </ol>
    {all.length > SUPPLIER_ROWS && <button type="button" className="ins-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
      {showAll ? "Show fewer suppliers" : `Show all ${all.length} suppliers`}
    </button>}
  </div>;
}

/* ---------- Spend by category ---------- */

export function CategoryDonut({ section, period }: { section: SpendSection; period: string }) {
  const [hover, setHover] = useState<string | null>(null);
  if (spendIsEmpty(section)) return <ChartEmpty>No expenses are recorded for {periodLabel(period)}.</ChartEmpty>;
  const rows: SpendRow[] = spendRows(section);
  const slices = donutSlices(rows, 100, 100, 92, 58);
  const focus = rows.find((row) => row.key === hover);
  return <div className="ins-chart ins-donut-wrap">
    <svg className="ins-donut" viewBox="0 0 200 200" role="img" aria-label={`Spend by category, ${periodLabel(period)}`}>
      {slices.map((slice, index) => <path key={slice.row.key} d={slice.path}
        className={`ins-slice ins-c${index % 7}${hover && hover !== slice.row.key ? " dim" : ""}`}
        onMouseEnter={() => setHover(slice.row.key)} onMouseLeave={() => setHover(null)}>
        <title>{`${slice.row.name}: ${money(slice.row.amount)}`}</title>
      </path>)}
      <text className="ins-donut-label" x="100" y={focus ? 92 : 96} textAnchor="middle">{focus ? focus.name.slice(0, 18) : "Expenses"}</text>
      {focus && <text className="ins-donut-value" x="100" y="114" textAnchor="middle">{money(focus.amount)}</text>}
    </svg>
    <ul className="ins-donut-legend">
      {rows.map((row, index) => <li key={row.key} onMouseEnter={() => setHover(row.key)} onMouseLeave={() => setHover(null)}>
        <i className={`ins-dotkey ins-c${index % 7}`} aria-hidden="true" />
        <span>{row.name}{percent(row.share) ? <small> {percent(row.share)}</small> : null}</span>
        <strong>{money(row.amount)}</strong>
      </li>)}
    </ul>
  </div>;
}

/* ---------- Six-month trend ---------- */

const metricLabel: Record<string, string> = { spend: "Supplier spend", revenue: "Sales", expenses: "Expenses", net: "Net result" };

export function AnomalyList({ anomalies }: { anomalies: InsightAnomaly[] }) {
  if (anomalies.length === 0) return <p className="ins-footnote">No flagged items in this window.</p>;
  return <ul className="ins-anomalies" aria-label="Flagged items">
    {anomalies.map((anomaly) => <li key={anomaly.id}>
      <span className="ins-flag" aria-hidden="true" />
      <div>
        <div className="ins-anomaly-head">
          <strong>{anomaly.subject}</strong>
          <small>{[
            anomaly.month ? periodLabel(anomaly.month) : null,
            anomaly.metric ? metricLabel[anomaly.metric] ?? anomaly.metric : null,
            anomaly.value !== null ? money(anomaly.value) : null,
          ].filter(Boolean).join(" · ")}</small>
        </div>
        <p>{anomaly.reason}</p>
      </div>
    </li>)}
  </ul>;
}

export function TrendChart({ trend, anomalies }: { trend: TrendPoint[]; anomalies: InsightAnomaly[] }) {
  const [ref, width] = useWidth();
  const [pick, setPick] = useState<number | null>(null);
  if (trend.length === 0 || trendIsEmpty(trend)) {
    return <div ref={ref} className="ins-chart"><ChartEmpty>No posted sales or expenses in the last six months.</ChartEmpty></div>;
  }
  const columns = trendColumns(trend, anomalies);
  const compact = width < 520;
  const height = compact ? 250 : 300;
  const margin = { left: compact ? 54 : 64, right: 10, top: 26, bottom: 30 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const scale = niceScale(columns.flatMap((column) => [column.revenue, column.expenses, column.net]));
  const y = (value: number) => margin.top + ((scale.max - value) / (scale.max - scale.min)) * innerHeight;
  const band = innerWidth / columns.length;
  const cx = (index: number) => margin.left + band * (index + 0.5);
  const barWidthPx = Math.max(6, Math.min(26, band * 0.28));
  const active = Math.min(pick ?? columns.length - 1, columns.length - 1);
  const current = columns[active];
  const net = linePath(columns.map((column, index) => [cx(index), y(column.net)]));
  const marked = anomalies.length - unplottedAnomalies(trend, anomalies).length;
  const anyPartial = trend.some((point) => point.partial);

  return <div ref={ref} className="ins-chart">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Sales, expenses and net result for the last ${columns.length} months, with ${marked} flagged ${marked === 1 ? "item" : "items"} marked.`}>
      {scale.ticks.map((tick) => <g key={tick}>
        <line className={tick === 0 ? "ins-axis-zero" : "ins-grid"} x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
        <text className="ins-tick" x={margin.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{compactMoney(tick)}</text>
      </g>)}
      {columns.map((column, index) => <g key={column.point.month}>
        {index === active && <rect className="ins-active" x={margin.left + band * index} y={margin.top - 18} width={band} height={innerHeight + 18} rx={6} />}
        <rect className="ins-bar-in" x={cx(index) - barWidthPx - 1} width={barWidthPx} rx={2}
          y={y(Math.max(column.revenue, 0))} height={Math.max(column.revenue === 0 ? 0 : 1, Math.abs(y(column.revenue) - y(0)))} />
        <rect className="ins-bar-out" x={cx(index) + 1} width={barWidthPx} rx={2}
          y={y(Math.max(column.expenses, 0))} height={Math.max(column.expenses === 0 ? 0 : 1, Math.abs(y(column.expenses) - y(0)))} />
        <text className="ins-tick" x={cx(index)} y={height - 9} textAnchor="middle">{shortMonth(column.point.month)}{column.point.partial ? "*" : ""}</text>
        {column.anomalies.length > 0 && <g className="ins-marker" transform={`translate(${cx(index)} ${margin.top - 14})`}>
          <path d="M0 -10 L10 0 L0 10 L-10 0 Z" />
          <text y="3.5" textAnchor="middle">{column.anomalies.length > 1 ? column.anomalies.length : "!"}</text>
          <title>{column.anomalies.map((anomaly) => anomaly.reason).join(" ")}</title>
        </g>}
      </g>)}
      <path className="ins-line net" d={net} fill="none" />
      {columns.map((column, index) => <circle key={`net-${column.point.month}`} className={`ins-dot net${column.net < 0 ? " neg" : ""}`}
        cx={cx(index)} cy={y(column.net)} r={index === active ? 5 : 3.5} />)}
      {columns.map((column, index) => <rect key={`hit-${column.point.month}`} className="ins-hit" tabIndex={0}
        x={margin.left + band * index} y={margin.top - 18} width={band} height={innerHeight + 18}
        aria-label={`${periodLabel(column.point.month)}${column.point.partial ? " (month to date)" : ""}: sales ${money(column.point.revenue)}, expenses ${money(column.point.expenses)}, net ${money(column.point.net)}${column.anomalies.length ? `. Flagged: ${column.anomalies.map((a) => a.reason).join(" ")}` : ""}`}
        onMouseEnter={() => setPick(index)} onFocus={() => setPick(index)} onClick={() => setPick(index)} />)}
    </svg>
    <Legend items={[
      { label: "Sales", className: "ins-bar-in" },
      { label: "Expenses", className: "ins-bar-out" },
      { label: "Net result", className: "ins-line-key net", shape: "line" },
      { label: "Flagged item", className: "ins-flag-key", shape: "mark" },
    ]} />
    {anyPartial && <p className="ins-footnote">* Month to date.</p>}
    <Readout label={`Figures for ${periodLabel(current.point.month)}`} items={[
      [`${periodLabel(current.point.month)}${current.point.partial ? " (to date)" : ""}`, ""],
      ["Sales", money(current.point.revenue)],
      ["Expenses", money(current.point.expenses)],
      ["Net result", money(current.point.net), signTone(current.net) ?? "ins-strong"],
    ]} />
    {current.anomalies.map((anomaly) => <p key={anomaly.id} className="ins-reason"><span className="ins-flag" aria-hidden="true" /><span><strong>{anomaly.subject}.</strong> {anomaly.reason}</span></p>)}
  </div>;
}

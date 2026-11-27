"use client";

import { useState } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorState, money, PageHeader, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { downloadMonthPack } from "@/lib/api/reports.service";
import { AnomalyList, BucketTable, CategoryDonut, ForecastChart, KpiRow, SupplierBars, TrendChart } from "./charts";
import { CommentarySection } from "./commentary-card";
import { getInsightsCommentary, getInsightsOverview, HORIZONS, type Horizon, type InsightsOverview } from "./insights-api";
import { currentPeriod, isPeriod, periodLabel, shiftPeriod } from "./insights-data";
import { openAssistant, useAssistantAvailable } from "@/features/common/assistant";
import "./insights.css";

function HorizonToggle({ days, onChange }: { days: Horizon; onChange: (days: Horizon) => void }) {
  return <div className="ins-toggle" role="group" aria-label="Forecast horizon">
    {HORIZONS.map((option) => <button key={option} type="button" aria-pressed={days === option}
      className={days === option ? "active" : ""} onClick={() => onChange(option)}>{option} days</button>)}
  </div>;
}

function NoDueDate({ overview }: { overview: InsightsOverview }) {
  const { receivables, payables } = overview.forecast.noDueDate;
  const parts = [
    receivables !== null && Number(receivables) !== 0 ? `receivables ${money(receivables)}` : null,
    payables !== null && Number(payables) !== 0 ? `payables ${money(payables)}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="ins-nodue"><strong>Not on the timeline:</strong> {parts.join(" and ")} have no recorded due date, so they are left out rather than guessed.</p>;
}

function Skeleton() {
  return <div aria-busy="true" role="status" aria-label="Loading insights">
    <div className="ins-kpis">{[0, 1, 2, 3].map((i) => <div className="ins-kpi" key={i}><div className="ins-skeleton" /><div className="ins-skeleton wide" /></div>)}</div>
    <div className="panel ins-panel"><div className="ins-skeleton tall" /></div>
  </div>;
}

const withTotal = (period: string, total: string | null) => (total === null ? periodLabel(period) : `${periodLabel(period)} · total ${money(total)}`);

function InsightsBody({ period, base }: { period: string; base: string }) {
  const [days, setDays] = useState<Horizon>(30);
  const overview = useResource(() => getInsightsOverview(period), `insights:${period}`);
  const commentary = useResource(() => getInsightsCommentary(period), `insights-commentary:${period}`);
  const data = overview.data;
  const canExplain = useAssistantAvailable();

  return <>
    {data ? <>
      <KpiRow overview={data} />
      <Panel className="ins-panel" title="Cash forecast" subtitle="Projection from recorded due dates" action={<HorizonToggle days={days} onChange={setDays} />}>
        <div className="ins-panel-body">
          <ForecastChart forecast={data.forecast} days={days} />
          <NoDueDate overview={data} />
          <details className="ins-how">
            <summary>How this is calculated</summary>
            {data.forecast.basis && <p>{data.forecast.basis}</p>}
            <BucketTable forecast={data.forecast} />
          </details>
        </div>
      </Panel>
      <div className="ins-two">
        <Panel className="ins-panel" title="Spend by supplier" subtitle={withTotal(period, data.spendBySupplier.total)}>
          <div className="ins-panel-body"><SupplierBars section={data.spendBySupplier} period={period} /></div>
        </Panel>
        <Panel className="ins-panel ins-panel-center" title="Spend by category" subtitle={withTotal(period, data.spendByCategory.total)}>
          <div className="ins-panel-body"><CategoryDonut section={data.spendByCategory} period={period} /></div>
        </Panel>
      </div>
      <Panel className="ins-panel" title="Six-month trend" subtitle="Sales, expenses and net result, with flagged items marked">
        <div className="ins-panel-body">
          <TrendChart trend={data.trend} anomalies={data.anomalies} />
          <AnomalyList anomalies={data.anomalies} />
          {data.anomalyMethod && <details className="ins-how"><summary>How items are flagged</summary><p>{data.anomalyMethod}</p></details>}
        </div>
      </Panel>
    </> : overview.loading ? <Skeleton /> : <ErrorState message={overview.error || "The insights could not be loaded."} retry={overview.refresh} />}
    <CommentarySection result={commentary.data} loading={commentary.loading} error={commentary.error} retry={commentary.refresh} base={base} canExplain={canExplain}
      onExplain={() => openAssistant({
        context: { page: "insights", period, label: `Insights, ${periodLabel(period)}` },
        question: "Explain this report",
      })} />
  </>;
}

/** `base` is the signed-in role's area, `/workspace` or `/company`, used to open the records the commentary cites. */
export function InsightsPage({ base }: { base: string }) {
  const latest = currentPeriod();
  const [period, setPeriod] = useState(latest);
  const [pack, setPack] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });

  const choose = (value: string) => { if (isPeriod(value) && value <= latest) setPeriod(value); };
  const downloadPack = async () => {
    setPack({ busy: true, error: "" });
    try {
      await downloadMonthPack(period);
      setPack({ busy: false, error: "" });
    } catch (error) {
      setPack({ busy: false, error: error instanceof Error ? error.message : "The pack could not be downloaded." });
    }
  };

  return <div className="dashboard-page insights">
    <PageHeader eyebrow="Reports" title="Insights"
      description="Cash outlook, spend and trends from your posted records."
      actions={<div className="ins-controls">
        <div className="ins-period" role="group" aria-label="Period">
          <button type="button" className="btn icon-btn" aria-label="Previous month" onClick={() => choose(shiftPeriod(period, -1))}><ChevronLeft size={16} /></button>
          <input type="month" aria-label="Period" value={period} max={latest} onChange={(event) => choose(event.target.value)} />
          <button type="button" className="btn icon-btn" aria-label="Next month" disabled={period >= latest} onClick={() => choose(shiftPeriod(period, 1))}><ChevronRight size={16} /></button>
        </div>
        <button type="button" className="btn primary" onClick={() => void downloadPack()} disabled={pack.busy}>
          <ArrowDownToLine size={16} aria-hidden="true" /> {pack.busy ? "Preparing…" : "Monthly Accounting Pack"}
        </button>
      </div>} />
    {pack.error && <p className="ins-pack-error" role="alert">{pack.error}</p>}
    <InsightsBody key={period} period={period} base={base} />
  </div>;
}

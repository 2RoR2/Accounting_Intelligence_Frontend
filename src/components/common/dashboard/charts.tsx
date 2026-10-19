"use client";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Panel } from "@/components/common/ui";
import type { KPI } from "@/types";
import { getTrends } from "@/lib/api/processing.service";
import { useResource } from "@/features/common/hooks/use-resource";
import { ErrorState, LoadingState } from "@/components/common/ui";
export function PerformanceCards({ metrics }: { metrics: KPI[] }) {
  return (
    <div className="kpi-grid">
      {metrics.map((m) => (
        <div className="kpi-card" key={m.label}>
          <div className="kpi-label">
            {m.label}
            <span className="kpi-check">
              <Check size={12} />
            </span>
          </div>
          <div className="kpi-value">
            {m.value}
            <span>{m.change}</span>
          </div>
          <div className="kpi-target">
            <span>Target {m.target}</span>
            <strong>
              <Check size={12} /> Target met
            </strong>
          </div>
          <div className="kpi-bar">
            <span
              style={{
                width:
                  m.label === "Exception rate"
                    ? "76%"
                    : m.label === "Avg. processing time"
                      ? "44%"
                      : m.value,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
export function TrendChart({
  kind = "processed",
}: {
  kind?: "processed" | "accuracy" | "exceptions";
}) {
  const [period, setPeriod] = useState("week");
  const { data, error, loading, refresh } = useResource(
    () => getTrends(period),
    period,
  );
  const title =
    kind === "processed"
      ? "Document processing"
      : kind === "accuracy"
        ? "Extraction accuracy"
        : "Exception trend";
  if (loading)
    return (
      <Panel title={title}>
        <LoadingState />
      </Panel>
    );
  if (error || !data)
    return (
      <Panel title={title}>
        <ErrorState message={error} retry={refresh} />
      </Panel>
    );
  const vals = data.map((point) => point[kind]);
  const maximum =
    kind === "processed"
      ? Math.max(50, Math.ceil(Math.max(...vals) / 50) * 50)
      : kind === "accuracy"
        ? 100
        : 20;
  const minimum = kind === "accuracy" ? 80 : 0;
  const plotLeft = 58;
  const plotRight = 548;
  const plotTop = 30;
  const plotBottom = 170;
  const xFor = (index: number) =>
    vals.length === 1
      ? (plotLeft + plotRight) / 2
      : plotLeft + index * ((plotRight - plotLeft) / (vals.length - 1));
  const yFor = (value: number) =>
    plotBottom -
    ((value - minimum) / (maximum - minimum)) * (plotBottom - plotTop);
  const points = vals.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
  return (
    <Panel
      title={title}
      subtitle="Processing trend"
      action={
        <div className="chart-period">
          <select
            aria-label={`${title} period`}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="day">Per day</option>
            <option value="week">Per week</option>
            <option value="month">Per month</option>
            <option value="year">Per year</option>
          </select>
          <ChevronDown size={12} />
        </div>
      }
    >
      <div className="chart-key">
        <span className="chart-dot" />{" "}
        {kind === "processed"
          ? "Documents processed"
          : kind === "accuracy"
            ? "Accuracy (%)"
            : "Exceptions (%)"}
        <span className="muted">
          {period === "day"
            ? "17 Sep 2026"
            : period === "week"
              ? "11–17 Sep 2026"
              : period === "month"
                ? "1–17 Sep 2026"
                : "Jan–Sep 2026"}
        </span>
      </div>
      <div className="trend-chart">
        <svg
          viewBox="0 0 590 215"
          role="img"
          aria-label={`${title} ${period} trend`}
        >
          <defs>
            <linearGradient id={`fill-${kind}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#022fa2" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#022fa2" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 76.67, 123.33, 170].map((y, i) => (
            <g key={y}>
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="#edf0f0"
                strokeDasharray="4 4"
              />
              <text x="5" y={y + 4} fill="#95a09e" fontSize="10">
                {Math.round(maximum - i * ((maximum - minimum) / 3))}
                {kind !== "processed" ? "%" : ""}
              </text>
            </g>
          ))}
          <polygon
            points={`${plotLeft},${plotBottom + 6} ${points} ${plotRight},${plotBottom + 6}`}
            fill={`url(#fill-${kind})`}
          />
          <polyline
            points={points}
            fill="none"
            stroke="#022fa2"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {vals.map((v, i) => (
            <circle
              key={i}
              cx={xFor(i)}
              cy={yFor(v)}
              r="3.5"
              fill="white"
              stroke="#022fa2"
              strokeWidth="2"
            >
              <title>{`${data[i].day}: ${v}${kind === "processed" ? " documents" : "%"}`}</title>
            </circle>
          ))}
          {data.map(({ day: label }, i) => (
            <text
              key={label}
              x={xFor(i)}
              y="204"
              textAnchor="middle"
              fill="#899591"
              fontSize="10"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
    </Panel>
  );
}

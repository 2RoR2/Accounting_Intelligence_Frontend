"use client";
import { useId, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { FinancialReportView, MonthPack } from "./financial-reports";
import { PageHeader } from "@/components/common/ui";

/**
 * Plan M8: Reports lists only what is built from posted books. Figures about reading accuracy and
 * speed live under Reports > Performance evaluation, not here.
 */
const reportTabs = [
  ["profit-and-loss", "Profit and loss"],
  ["balance-sheet", "Balance sheet"],
  ["general-ledger", "General ledger"],
  ["receivables-ageing", "Receivables ageing"],
  ["payables-ageing", "Payables ageing"],
  ["tax-summary", "Tax summary"],
] as const;

export function AccountingReportsPage() {
  const monthPack = useSearchParams().get("view") === "month-pack";
  const [active, setActive] = useState(0);
  const id = useId();
  const tabId = (index: number) => `${id}-tab-${index}`;
  const panelId = (index: number) => `${id}-panel-${index}`;

  function focusTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = reportTabs.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = index === 0 ? last : index - 1; break;
      case "ArrowRight": next = index === last ? 0 : index + 1; break;
      case "Home": next = 0; break;
      case "End": next = last; break;
      default: return;
    }
    event.preventDefault();
    document.getElementById(tabId(next))?.focus();
  }

  if (monthPack) {
    return <div className="dashboard-page reports-page">
      <PageHeader title="Month pack" description="Download posted figures for one accounting period." />
      <MonthPack />
    </div>;
  }

  return <div className="dashboard-page reports-page">
    <PageHeader
      title="Financial reports"
      description="Statements and summaries from posted books."
    />
    <div className="report-tabs" role="tablist" aria-label="Reports">
      {reportTabs.map(([key, label], index) => <button
        key={key}
        id={tabId(index)}
        type="button"
        role="tab"
        className={active === index ? "active" : ""}
        aria-selected={active === index}
        aria-controls={panelId(index)}
        tabIndex={active === index ? 0 : -1}
        onClick={() => setActive(index)}
        onKeyDown={(event) => focusTab(event, index)}
      >{label}</button>)}
    </div>
    {reportTabs.map(([key, title], index) => <div
      key={key}
      id={panelId(index)}
      role="tabpanel"
      aria-labelledby={tabId(index)}
      tabIndex={0}
      hidden={active !== index}
    >
      {active === index && <FinancialReportView report={key} title={title} />}
    </div>)}
  </div>;
}

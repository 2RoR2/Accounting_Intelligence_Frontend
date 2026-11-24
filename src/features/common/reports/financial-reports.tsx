"use client";

import { useState, type FormEvent } from "react";
import { EmptyState, Field, formatDate, LoadingState, Panel } from "@/components/common/ui";
import { isoDateIn } from "@/features/common/erp/currency-rates";
import { useResource } from "@/features/common/hooks/use-resource";
import { periodFromMonth } from "@/features/common/ledger/period-month";
import { financialReportPath, type FinancialReportQuery, type ReportFormat } from "@/lib/api/financial-report-query";
import { getAccountingPeriods } from "@/lib/api/ledger.service";
import { downloadFinancialReport, downloadMonthPack, getFinancialReport } from "@/lib/api/reports.service";
import { FinancialReportTable } from "./financial-report-tables";

const malaysiaTime = "Asia/Kuala_Lumpur";
const dateInput = { type: "date", required: true, min: "0001-01-01", max: "9999-12-31" };

function defaultQuery(report: FinancialReportQuery["report"]): FinancialReportQuery {
  const asOf = isoDateIn(malaysiaTime);
  if (report === "balance-sheet" || report === "receivables-ageing" || report === "payables-ageing") return { report, asOf };
  const month = periodFromMonth(asOf.slice(0, 7));
  return { report, fromDate: month?.startsOn ?? asOf, toDate: month?.endsOn ?? asOf };
}

function useReportDownload() {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function save(exportFile: () => Promise<void>) {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await exportFile();
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "Unable to download the file.");
    } finally {
      setDownloading(false);
    }
  }

  return { downloading, downloadError, save };
}

function ReportNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="panel-body">
    <div className="notice danger" role="alert">{message}</div>
    {retry && <button type="button" className="btn" onClick={retry}>Try again</button>}
  </div>;
}

function ReportResult({ query, datesEdited }: { query: FinancialReportQuery; datesEdited: boolean }) {
  const { data, error, refresh } = useResource(() => getFinancialReport(query), financialReportPath(query));
  const { downloading, downloadError, save } = useReportDownload();
  const download = (format: ReportFormat) => save(() => downloadFinancialReport(query, format));

  const dates = data?.data ?? query;
  const cannotDownload = downloading || datesEdited || !data;
  return <>
    <div className="report-toolbar report-result-toolbar">
      <p>{"asOf" in dates ? `As of ${formatDate(dates.asOf)}` : `${formatDate(dates.fromDate)} – ${formatDate(dates.toDate)}`}</p>
      <div className="actions" aria-busy={downloading}>
        <button type="button" className="btn" disabled={cannotDownload} onClick={() => void download("csv")}>Download CSV</button>
        <button type="button" className="btn" disabled={cannotDownload} onClick={() => void download("xlsx")}>Download Excel</button>
      </div>
    </div>
    {downloadError && <ReportNotice message={downloadError} />}
    {error && <ReportNotice message={error} retry={refresh} />}
    {!data && !error && <LoadingState variant="table" />}
    {data && <FinancialReportTable {...data} />}
  </>;
}

export function FinancialReportView({ report, title }: { report: FinancialReportQuery["report"]; title: string }) {
  const [query, setQuery] = useState(() => defaultQuery(report));
  const [draft, setDraft] = useState(query);
  const path = financialReportPath(query);
  const datesEdited = financialReportPath(draft) !== path;

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draft);
  }

  return <Panel title={title}>
    <form className="report-toolbar report-date-filters" onSubmit={applyDates}>
      {"asOf" in draft ? <Field label="As of *">
        <input {...dateInput} value={draft.asOf} onChange={(event) => setDraft({ ...draft, asOf: event.target.value })} />
      </Field> : <>
        <Field label="From date *">
          <input {...dateInput} max={draft.toDate || dateInput.max} value={draft.fromDate} onChange={(event) => setDraft({ ...draft, fromDate: event.target.value })} />
        </Field>
        <Field label="To date *">
          <input {...dateInput} min={draft.fromDate || dateInput.min} value={draft.toDate} onChange={(event) => setDraft({ ...draft, toDate: event.target.value })} />
        </Field>
      </>}
      <button type="submit" className="btn primary" disabled={!datesEdited}>Run report</button>
    </form>
    <ReportResult key={path} query={query} datesEdited={datesEdited} />
  </Panel>;
}

export function MonthPack() {
  const { data, error, refresh } = useResource(getAccountingPeriods, "month-pack-periods");
  const [period, setPeriod] = useState("");
  const { downloading, downloadError, save } = useReportDownload();
  const selected = data?.some(({ periodCode }) => periodCode === period) ? period : "";
  const periods = [...(data ?? [])].sort((a, b) => b.periodCode.localeCompare(a.periodCode));

  function exportPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected) void save(() => downloadMonthPack(selected));
  }

  return <Panel title="Monthly Accounting Pack">
    {!data && !error && <LoadingState variant="form" />}
    {error && <ReportNotice message={error} retry={refresh} />}
    {data && (periods.length > 0 ? <form className="report-toolbar report-date-filters" onSubmit={exportPack} aria-busy={downloading}>
      <Field label="Accounting period *">
        <select required value={selected} disabled={downloading} onChange={(event) => setPeriod(event.target.value)}>
          <option value="">Select a period</option>
          {periods.map(({ id, periodCode, startsOn, endsOn }) => <option key={id} value={periodCode}>
            {`${periodCode} (${startsOn} to ${endsOn})`}
          </option>)}
        </select>
      </Field>
      <button type="submit" className="btn" disabled={!selected || downloading}>Download Monthly Accounting Pack (Excel)</button>
    </form> : <EmptyState message="No accounting periods yet. Open a period under Accounting, then return here to download its Monthly Accounting Pack." />)}
    {downloadError && <ReportNotice message={downloadError} />}
  </Panel>;
}

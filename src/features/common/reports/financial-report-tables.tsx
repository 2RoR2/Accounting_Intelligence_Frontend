import type { ReactNode } from "react";
import { Badge, DataTable, EmptyState, formatDate, money } from "@/components/common/ui";
import type { Ageing, AgeingBucket, FinancialReport, FinancialSection, GeneralLedger, TaxSummary } from "@/lib/api/reports.service";
import { statementRows } from "./financial-report-rows";

function ReportTable({ label, columns, children }: { label: string; columns: string[]; children: ReactNode }) {
  return <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table>
      <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
      {children}
    </table>
  </div>;
}

function StatementTable({ label, sections, earnings, totals }: {
  label: string;
  sections: FinancialSection[];
  earnings?: string;
  totals: Array<{ label: string; amount: string }>;
}) {
  return <ReportTable label={label} columns={["Account", "Amount"]}>
    {sections.map((section) => {
      const { rows, subtotal } = statementRows(section, earnings);
      return <tbody key={section.key}>
        <tr><th scope="rowgroup" colSpan={2}>{section.label}</th></tr>
        {rows.map((row) => <tr key={row.key}><td>{row.label}</td><td>{money(row.amount)}</td></tr>)}
        <tr className="report-total"><th scope="row">{subtotal.label}</th><td>{money(subtotal.amount)}</td></tr>
      </tbody>;
    })}
    <tfoot className="report-total">
      {totals.map((total) => <tr key={total.label}><th scope="row">{total.label}</th><td>{money(total.amount)}</td></tr>)}
    </tfoot>
  </ReportTable>;
}

const sourceLabels: Record<string, string> = {
  adjustment: "Adjustment",
  document: "Scanned document",
  erp_document: "Accounting document",
  manual: "Manual",
  reversal: "Reversal",
  settlement: "Settlement",
};

function GeneralLedgerTables({ accounts }: GeneralLedger) {
  if (!accounts.length) return <EmptyState message="No ledger activity or opening balances for these dates." />;
  return <div className="financial-ledger">
    {accounts.map((account) => <section key={account.accountId}>
      <div className="panel-body">
        <h3>{account.code} · {account.name}</h3>
        <p>Opening balance <strong>{money(account.openingBalance)}</strong></p>
      </div>
      {account.lines.length > 0 ? <DataTable
        rows={account.lines.map((line, index) => ({ ...line, index }))}
        rowKey={(line) => `${line.journalId}-${line.index}`}
        columns={[
          { label: "Date", render: (line) => formatDate(line.date) },
          { label: "Journal reference", render: (line) => line.journalId },
          { label: "Description", render: (line) => line.description },
          { label: "Source", render: (line) => sourceLabels[line.sourceType] ?? line.sourceType.replaceAll("_", " ") },
          { label: "Debit", render: (line) => money(line.debit) },
          { label: "Credit", render: (line) => money(line.credit) },
          { label: "Balance", render: (line) => money(line.balance) },
        ]}
      /> : <p className="panel-body">No journal lines for these dates.</p>}
      <p className="panel-body">Closing balance <strong>{money(account.closingBalance)}</strong></p>
    </section>)}
  </div>;
}

const bucketLabels: Record<AgeingBucket, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

function AgeingTables({ buckets, rows, totals }: Ageing) {
  return <>
    <ReportTable label="Ageing totals" columns={["", ...buckets.map((bucket) => bucketLabels[bucket]), "Total outstanding"]}>
      <tfoot><tr className="report-total">
        <th scope="row">Totals</th>
        {buckets.map((bucket) => <td key={bucket}>{money(totals[bucket])}</td>)}
        <td>{money(totals.total)}</td>
      </tr></tfoot>
    </ReportTable>
    <DataTable
      rows={rows.map((row, index) => ({ ...row, index }))}
      rowKey={(row) => String(row.index)}
      columns={[
        { label: "Contact", render: (row) => row.contactName },
        { label: "Source", render: (row) => row.source === "typed" ? "Typed" : "Scanned" },
        { label: "Document number", render: (row) => row.documentNumber },
        { label: "Document date", render: (row) => formatDate(row.documentDate) },
        { label: "Due date", render: (row) => formatDate(row.dueDate) },
        { label: "Outstanding", render: (row) => money(row.outstanding) },
        { label: "Ageing bucket", render: (row) => bucketLabels[row.bucket] },
      ]}
    />
  </>;
}

function TaxTable({ note, months, totals }: TaxSummary) {
  return <>
    <div className="panel-body"><p className="notice warning"><strong>{note}</strong></p></div>
    <ReportTable label="Tax summary" columns={["Month", "Output tax", "Input tax", "Net tax"]}>
      <tbody>{months.map((month) => <tr key={month.month}>
        <th scope="row">{month.month}</th>
        <td>{money(month.outputTax)}</td>
        <td>{money(month.inputTax)}</td>
        <td>{money(month.net)}</td>
      </tr>)}</tbody>
      <tfoot><tr className="report-total">
        <th scope="row">Total</th>
        <td>{money(totals.outputTax)}</td>
        <td>{money(totals.inputTax)}</td>
        <td>{money(totals.net)}</td>
      </tr></tfoot>
    </ReportTable>
  </>;
}

export function FinancialReportTable(result: FinancialReport) {
  switch (result.report) {
    case "profit-and-loss": {
      const { sections, totalIncome, totalExpenses, netProfit } = result.data;
      return <StatementTable label="Profit and loss" sections={sections} totals={[
        { label: "Total income", amount: totalIncome },
        { label: "Total expenses", amount: totalExpenses },
        { label: "Net profit", amount: netProfit },
      ]} />;
    }
    case "balance-sheet": {
      const { sections, currentYearEarnings, totalAssets, totalLiabilitiesAndEquity, balanced } = result.data;
      return <>
        <div className="panel-body">
          {balanced ? <Badge>Balanced</Badge> : <p className="notice danger">Does not balance</p>}
        </div>
        <StatementTable label="Balance sheet" sections={sections} earnings={currentYearEarnings} totals={[
          { label: "Total assets", amount: totalAssets },
          { label: "Total liabilities and equity", amount: totalLiabilitiesAndEquity },
        ]} />
      </>;
    }
    case "general-ledger": return <GeneralLedgerTables {...result.data} />;
    case "receivables-ageing":
    case "payables-ageing": return <AgeingTables {...result.data} />;
    case "tax-summary": return <TaxTable {...result.data} />;
  }
}

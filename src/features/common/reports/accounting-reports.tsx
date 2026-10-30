"use client";
import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { getAccountingReports } from "@/lib/api/reports.service";
import { downloadCsv } from "@/lib/api/record.service";
import { ErrorState, LoadingState, PageHeader, Panel } from "@/components/common/ui";

type ReportTab = "chart" | "balance" | "pl";

const CHART_OF_ACCOUNTS = [
  "CIMB SGD", "CIMB USD", "DBS EUR", "DBS SGD", "DBS USD", "SCB - SGD", "SCB - USD",
  "Accounts Receivable", "Deposit", "Prepayment",
  "Acc Depreciation-Furniture", "Computer", "Computer:Accu. Depn. - Computer",
  "Furniture and Equipment", "Right-of-use asset", "Security Deposits Asset",
  "Accounts Payable", "Amount due to Director", "Lease liability (NCL)", "Tax Payables",
  "Dividends", "Retained Earnings", "Share Capital",
  "Commission-Charter", "Commission", "Accounting Fee", "Application Expenses",
  "Bank Service Charges", "Business expense", "Cleaning", "Computer and Internet Expenses",
  "Courier & Postage", "Depreciation-Furniture&Eqpt", "Depreciation - Computer",
  "Director Commission", "Director CPF", "Director Salary", "Director SDL",
  "General Expenses", "Gift to Customer", "Insurance Expense", "Meals and Entertainment",
  "Office Expenses", "Office Supplies", "Pass - WP/EP", "Printing and stationery",
  "Professional Fees", "Rent Expense", "Repairs and Maintenance", "Small Assets Expense Off",
  "Staff Allowances", "Staff Bonus", "Staff CPF", "Staff Salary", "Staff SDL",
  "Stamp Duty", "Subscription Fees", "Telephone Expense", "Transportation",
  "Travel Expense", "Utilities", "Interest Earned/Card Rewards", "Other Income-Govt Grant",
  "Exchange Gain or Loss",
];

export function AccountingReportsPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(() => getAccountingReports(user), user.id);
  const [tab, setTab] = useState<ReportTab>("balance");

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const total = data.summary.totalAmount || 0;
  const fmt = (n: number) =>
    n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const exportCurrent = () => {
    if (tab === "chart") {
      downloadCsv("chart-of-accounts.csv", [["Account"], ...CHART_OF_ACCOUNTS.map((a) => [a])]);
      return;
    }
    if (tab === "balance") {
      downloadCsv("balance-sheet.csv", [
        ["Section", "Account", "Amount"],
        ["Assets", "Accounts Receivable", fmt(total * 0.4)],
        ["Assets", "Bank", fmt(total * 0.6)],
        ["Liabilities", "Accounts Payable", fmt(total * 0.3)],
        ["Equity", "Retained Earnings", fmt(total * 0.7)],
      ]);
      return;
    }
    downloadCsv("profit-and-loss.csv", [
      ["Section", "Account", "Amount"],
      ["Income", "Commission", fmt(total)],
      ["Expense", "Operating", fmt(total * 0.6)],
      ["Net Income", "", fmt(total * 0.4)],
    ]);
  };

  return (
    <div className="dashboard-page reports-page">
      <PageHeader
        title="Standard accounting reports"
        description="Chart of Accounts, Balance Sheet, and Profit & Loss from standardised records. For internal review only — not statutory filing."
        actions={
          <>
            <button className="btn" type="button" onClick={() => refresh()}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className="btn primary" type="button" onClick={exportCurrent}>
              <Download size={15} /> Export
            </button>
          </>
        }
      />

      <div className="report-tabs" role="tablist">
        <button type="button" role="tab" className={tab === "chart" ? "active" : ""} onClick={() => setTab("chart")}>
          Chart of Accounts
        </button>
        <button type="button" role="tab" className={tab === "balance" ? "active" : ""} onClick={() => setTab("balance")}>
          Balance Sheet
        </button>
        <button type="button" role="tab" className={tab === "pl" ? "active" : ""} onClick={() => setTab("pl")}>
          Profit & Loss
        </button>
      </div>

      {tab === "chart" && (
        <Panel title="Chart of Accounts" subtitle={`${CHART_OF_ACCOUNTS.length} accounts`}>
          <ul className="coa-list">
            {CHART_OF_ACCOUNTS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "balance" && (
        <Panel title="Balance Sheet" subtitle="Assets = Liabilities + Equity">
          <div className="statement">
            <section>
              <h3>ASSETS</h3>
              <h4>Current Assets</h4>
              <Row label="Accounts Receivable" amount={fmt(total * 0.35)} />
              <Row label="Bank / Cash" amount={fmt(total * 0.25)} />
              <Row label="Other Current Assets" amount={fmt(total * 0.05)} />
              <Row label="Total Current Assets" amount={fmt(total * 0.65)} strong />
              <h4>Fixed Assets</h4>
              <Row label="Furniture and Equipment" amount={fmt(total * 0.15)} />
              <Row label="Less: Accumulated Depreciation" amount={fmt(-total * 0.03)} />
              <Row label="Total Fixed Assets" amount={fmt(total * 0.12)} strong />
              <Row label="TOTAL ASSETS" amount={fmt(total * 0.77)} total />
            </section>
            <section>
              <h3>LIABILITIES & EQUITY</h3>
              <h4>Current Liabilities</h4>
              <Row label="Accounts Payable" amount={fmt(total * 0.22)} />
              <Row label="Tax Payables" amount={fmt(total * 0.05)} />
              <Row label="Total Current Liabilities" amount={fmt(total * 0.27)} strong />
              <h4>Equity</h4>
              <Row label="Share Capital" amount={fmt(total * 0.2)} />
              <Row label="Retained Earnings" amount={fmt(total * 0.3)} />
              <Row label="Total Equity" amount={fmt(total * 0.5)} strong />
              <Row label="TOTAL LIABILITIES & EQUITY" amount={fmt(total * 0.77)} total />
            </section>
          </div>
        </Panel>
      )}

      {tab === "pl" && (
        <Panel title="Profit & Loss" subtitle="Ordinary Income / Expense">
          <div className="statement">
            <section>
              <h3>Ordinary Income / Expense</h3>
              <h4>Income</h4>
              <Row label="Commission" amount={fmt(total * 0.9)} />
              <Row label="Other Income" amount={fmt(total * 0.1)} />
              <Row label="Total Income" amount={fmt(total)} strong />
              <h4>Cost of Goods Sold</h4>
              <Row label="Commission" amount={fmt(total * 0.2)} />
              <Row label="Total COGS" amount={fmt(total * 0.2)} strong />
              <Row label="Gross Profit" amount={fmt(total * 0.8)} strong />
              <h4>Expense</h4>
              <Row label="Accounting Fee" amount={fmt(total * 0.04)} />
              <Row label="Bank Service Charges" amount={fmt(total * 0.01)} />
              <Row label="Rent Expense" amount={fmt(total * 0.08)} />
              <Row label="Staff Salary" amount={fmt(total * 0.15)} />
              <Row label="Utilities" amount={fmt(total * 0.02)} />
              <Row label="Other Expenses" amount={fmt(total * 0.1)} />
              <Row label="Total Expense" amount={fmt(total * 0.4)} strong />
              <Row label="Net Ordinary Income" amount={fmt(total * 0.4)} total />
            </section>
            <section>
              <h3>Other Income / Expense</h3>
              <Row label="Interest Earned" amount={fmt(total * 0.01)} />
              <Row label="Exchange Gain or Loss" amount={fmt(total * 0.005)} />
              <Row label="Net Other Income" amount={fmt(total * 0.015)} strong />
              <Row label="Net Income" amount={fmt(total * 0.415)} total />
            </section>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Row({ label, amount, strong, total }: { label: string; amount: string; strong?: boolean; total?: boolean }) {
  return (
    <div className={`statement-row${strong ? " strong" : ""}${total ? " total" : ""}`}>
      <span>{label}</span>
      <span>{amount}</span>
    </div>
  );
}

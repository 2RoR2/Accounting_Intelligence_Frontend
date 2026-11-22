import type { FinancialSection } from "@/lib/api/reports.service";

export type StatementReport = "profit-and-loss" | "balance-sheet";

export function statementRows(section: FinancialSection, report: StatementReport) {
  const rows = section.accounts.map(({ accountId, code, name, amount }) => ({
    key: `account-${accountId}`,
    label: code ? `${code} · ${name}` : name,
    amount,
  }));
  const lowerLabel = section.label.toLowerCase();
  let subtotalLabel = `Total ${lowerLabel}`;
  if (report === "profit-and-loss") {
    subtotalLabel = lowerLabel === "income" || lowerLabel === "expenses"
      ? "Subtotal"
      : `Total ${section.label}`;
  }
  return {
    rows,
    subtotal: { label: subtotalLabel, amount: section.total },
  };
}

import type { FinancialSection } from "@/lib/api/reports.service";

export function statementRows(section: FinancialSection, currentYearEarnings?: string) {
  const rows = section.accounts.map(({ accountId, code, name, amount }) => ({
    key: `account-${accountId}`,
    label: `${code} · ${name}`,
    amount,
  }));
  if (section.key === "equity" && currentYearEarnings !== undefined) {
    rows.push({ key: "earnings", label: "Current year earnings", amount: currentYearEarnings });
  }
  return {
    rows,
    subtotal: { label: `Total ${section.label.toLowerCase()}`, amount: section.total },
  };
}

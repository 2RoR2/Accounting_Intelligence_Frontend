import { amountInCents, decimalAmount } from "@/features/common/erp/document-logic";
import type { JournalPreview } from "@/lib/api/erp.service";

export function previewTotals(preview: Pick<JournalPreview, "totalDebit" | "totalCredit" | "balanced">) {
  const debit = amountInCents(preview.totalDebit);
  const credit = amountInCents(preview.totalCredit);
  return {
    debit: decimalAmount(debit),
    credit: decimalAmount(credit),
    balanced: preview.balanced && debit === credit,
  };
}

export function postingSelectionTotals(rows: readonly { amount?: string | null; currency?: string | null }[]) {
  const totals = new Map<string, bigint>();
  let missing = 0;
  for (const { amount, currency } of rows) {
    if (amount == null || !/^-?\d+(?:\.\d+)?$/.test(amount)) {
      missing++;
      continue;
    }
    const code = currency?.trim().toUpperCase() || "MYR";
    totals.set(code, (totals.get(code) ?? 0n) + amountInCents(amount));
  }
  return { missing, totals: [...totals].map(([currency, amount]) => ({ currency, amount: decimalAmount(amount) })) };
}

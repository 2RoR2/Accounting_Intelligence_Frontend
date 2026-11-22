import { amountInCents, decimalAmount } from "@/features/common/erp/document-logic";

export const MATCH_LIMIT = 50;

export function allocationCents(value: string) {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value.trim())) return null;
  return amountInCents(value);
}

export function allocationTotals(available: string, amounts: readonly string[]) {
  const allocated = amounts.reduce((sum, amount) => sum + (allocationCents(amount) ?? 0n), 0n);
  const remaining = amountInCents(available) - allocated;
  return {
    allocated: decimalAmount(allocated),
    remaining: decimalAmount(remaining),
    exceedsAvailable: remaining < 0n,
  };
}

export function defaultAllocation(outstanding: string, remaining: string) {
  const owed = amountInCents(outstanding);
  const available = amountInCents(remaining);
  const smaller = owed < available ? owed : available;
  return decimalAmount(smaller > 0n ? smaller : 0n);
}

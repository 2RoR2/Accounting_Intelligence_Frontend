// Bank statement column mapping for the reconciliation import (pure, so it can be tested without React).

export type ImportColumn = "posted_date" | "value_date" | "description" | "reference" | "debit" | "credit" | "currency";
export const IMPORT_COLUMNS: Array<{ key: ImportColumn; label: string; required: boolean }> = [
  { key: "posted_date", label: "Posted date", required: true },
  { key: "value_date", label: "Value date", required: false },
  { key: "description", label: "Description", required: true },
  { key: "reference", label: "Reference", required: false },
  { key: "debit", label: "Debit (Money Out)", required: true },
  { key: "credit", label: "Credit (Money In)", required: true },
  { key: "currency", label: "Currency", required: false },
];

function guessColumn(headers: string[], key: ImportColumn): string {
  const normalized = (header: string) => header.toLowerCase().replace(/[^a-z]/g, "");
  const matches: Record<ImportColumn, string[]> = {
    posted_date: ["date", "transactiondate", "posteddate", "bookingdate"],
    value_date: ["valuedate"],
    description: ["description", "details", "narrative", "transactiondetails", "payee", "merchant"],
    reference: ["reference", "ref", "transactionreference"],
    debit: ["debit", "withdrawal", "moneyout"],
    credit: ["credit", "deposit", "moneyin"],
    currency: ["currency", "ccy"],
  };
  return headers.find((header) => matches[key].includes(normalized(header))) ?? "";
}

export function headerMatchesField(header: string, key: ImportColumn): boolean {
  const value = header.toLowerCase().replace(/[^a-z]/g, "");
  const terms: Record<ImportColumn, string[]> = {
    posted_date: ["date", "transactiondate", "posteddate", "bookingdate"],
    value_date: ["valuedate"],
    description: ["description", "details", "narrative", "transactiondetails", "payee", "merchant"],
    reference: ["reference", "ref", "transactionreference"],
    debit: ["debit", "withdrawal", "moneyout", "payment", "amount"],
    credit: ["credit", "deposit", "moneyin", "receipt", "amount"],
    currency: ["currency", "ccy"],
  };
  return terms[key].some((term) => value === term || value.includes(term));
}

export function autoMapColumns(headers: string[]): Record<ImportColumn, string> {
  const result = {} as Record<ImportColumn, string>;
  const used = new Set<string>();
  for (const { key } of IMPORT_COLUMNS) {
    const candidates = headers.filter((header) => headerMatchesField(header, key));
    const match = guessColumn(headers, key) || (candidates.length === 1 ? candidates[0] : "");
    result[key] = match && !used.has(match) ? match : "";
    if (result[key]) used.add(result[key]);
  }
  return withSignedAmount(result, headers);
}

/**
 * A single signed Amount column is one source field for both sides; the backend uses its sign to populate
 * exactly one side per row. It never replaces a Debit/Credit pair the statement (or the user) maps to two
 * separate columns (Codex H2).
 */
function withSignedAmount(mapping: Record<ImportColumn, string>, headers: string[]): Record<ImportColumn, string> {
  const amountHeader = headers.find((header) => /^(amount|value|transactionamount)$/i.test(header.replace(/[^a-z]/gi, "")));
  const separateSides = mapping.debit && mapping.credit && mapping.debit !== mapping.credit;
  if (!amountHeader || separateSides) return mapping;
  return { ...mapping, debit: amountHeader, credit: amountHeader };
}

/** The mapping sent to the preview: the user's choices, unmapped fields filled when exactly one header fits. */
export function importMappingForPreview(mapping: Record<ImportColumn, string>, headers: string[]): Record<ImportColumn, string> {
  const effective = { ...mapping };
  for (const { key } of IMPORT_COLUMNS) {
    if (!effective[key]) {
      const candidates = headers.filter((header) => headerMatchesField(header, key));
      if (candidates.length === 1) effective[key] = candidates[0];
    }
  }
  return withSignedAmount(effective, headers);
}

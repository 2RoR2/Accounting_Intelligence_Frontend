/** P1: statement of account for one customer (receivable) or supplier (payable), from GET /api/contacts/{id}/statement. */
import { download, get } from "./client";

export type StatementBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export type StatementLine = {
  date: string;
  type: string;
  label: string;
  number: string;
  description: string;
  dueDate: string | null;
  amount: string;
  source: "typed" | "scanned" | "settlement" | "opening";
  debit: string;
  credit: string;
  balance: string;
};
export type ContactStatement = {
  contact: {
    id: string; kind: "customer" | "supplier"; name: string; code: string | null; registrationNumber: string | null;
    tin: string | null; address: string; phone: string | null; email: string | null;
  };
  kind: "customer" | "supplier";
  fromDate: string;
  toDate: string;
  currency: "MYR";
  openingBalance: string;
  lines: StatementLine[];
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  balanceLabel: string;
  ageing: {
    asOf: string;
    buckets: StatementBucket[];
    totals: Record<StatementBucket, string>;
    openItems: string;
    unallocatedCredits: string;
    balance: string;
    reconciles: boolean;
    difference: string;
    items: Array<{ number: string; date: string; dueDate: string | null; outstanding: string; bucket: StatementBucket }>;
  };
};
export type StatementRange = { fromDate: string; toDate: string };

export function contactStatementPath(contactId: string, { fromDate, toDate }: StatementRange, format?: "pdf") {
  const params = new URLSearchParams({ from: fromDate, to: toDate });
  if (format) params.set("format", format);
  return `/api/contacts/${encodeURIComponent(contactId)}/statement?${params}`;
}

export function statementFileName(statement: Pick<ContactStatement, "contact" | "fromDate" | "toDate">) {
  const code = (statement.contact.code || statement.contact.name).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "contact";
  return `statement-${code}-${statement.fromDate}-to-${statement.toDate}.pdf`;
}

export const getContactStatement = (contactId: string, range: StatementRange) =>
  get<ContactStatement>(contactStatementPath(contactId, range));

export const downloadContactStatement = (statement: ContactStatement) =>
  download(contactStatementPath(statement.contact.id, statement, "pdf"), statementFileName(statement));

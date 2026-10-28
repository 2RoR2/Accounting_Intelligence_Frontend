import { get } from "./client";
import type { User } from "@/types";

export type AccountingReport = { key: string; title: string; count: number };
export type AccountingReports = {
  cards: AccountingReport[];
  summary: { documentCount: number; totalAmount: number; lineAmount: number; openExceptions: number };
  documents: Array<{ reference: string; kind: string; status: string; date: string }>;
};

export function getAccountingReports(user: User) {
  void user;
  return get<AccountingReports>("/api/reports/accounting");
}

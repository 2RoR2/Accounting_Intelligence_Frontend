"use client";
import type { User } from "@/types";
import { EmptyState } from "@/components/common/ui";

/** Plan L4/L5 placeholder: replaced by the Sales/Purchases documents page. */
export function ErpDocumentsPage({ group }: { user: User; group: "sales" | "purchases" | "bank-entries"; documentId?: string }) {
  return <EmptyState message={`The ${group} documents page is being built.`} />;
}

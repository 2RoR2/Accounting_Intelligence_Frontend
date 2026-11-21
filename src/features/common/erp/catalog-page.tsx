"use client";
import type { User } from "@/types";
import { EmptyState } from "@/components/common/ui";

/** Plan L3 placeholder: replaced by the catalog, products and posting-accounts pages. */
export function CatalogPage(_props: { user: User }) {
  return <EmptyState message="The catalog page is being built." />;
}

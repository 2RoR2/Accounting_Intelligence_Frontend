/**
 * Actions the document form leaves out because the server would refuse them (409): taking a payment for a document with
 * nothing outstanding, and converting a quotation that already became an invoice. Pure, so it can be tested.
 */
import type { DocumentHistory, DocumentType } from "@/lib/api/erp.service";
import { amountInCents, type DocumentAction } from "./document-logic";

const PAYMENT_TARGETS = new Set<DocumentType>(["payment", "purchase-payment"]);

export function formActions(
  actions: readonly DocumentAction[],
  { outstanding, convertedTo }: { outstanding?: string | null; convertedTo?: readonly DocumentType[] },
): DocumentAction[] {
  const settled = outstanding != null && amountInCents(outstanding) <= 0n;
  return actions.filter((action) => action.kind !== "transfer"
    || !((settled && PAYMENT_TARGETS.has(action.target)) || convertedTo?.includes(action.target)));
}

/** Transfers out of this document (quotation -> invoice ...), as links in its history. */
export function transfersFrom(id: string, history: { links: readonly DocumentHistory["links"][number][] } | null | undefined) {
  return (history?.links ?? []).filter((link) => link.linkType === "transfer" && link.sourceId === id);
}

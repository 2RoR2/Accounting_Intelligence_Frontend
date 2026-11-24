"use client";
/**
 * A contact's balance and every invoice, bill, note and payment for it, typed or scanned (audit 24 Nov: the contact
 * page listed only uploaded Inbox files matched by name, so its invoices and payments could not be found from it).
 */
import Link from "next/link";
import { Badge, DataTable, ErrorState, LoadingState, Panel, StatusBadge, formatDate, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { documentGroup, documentHref, documentStatusLabel } from "@/features/common/erp/document-logic";
import { DOCUMENT_LABELS, getContactBalances, listDocuments, type Contact, type DocumentType, type ErpDocument } from "@/lib/api/erp.service";

const TYPES: Record<string, DocumentType[]> = {
  customer: ["invoice", "credit-note", "debit-note", "payment"],
  supplier: ["bill", "purchase-credit-note", "purchase-debit-note", "purchase-payment"],
};

function href(base: string, row: ErpDocument) {
  if (row.source === "scanned") return `${base}/documents/${encodeURIComponent(row.documentId)}`;
  const group = documentGroup(row.type);
  return group ? documentHref(base, group, row.type, row.id) : null;
}

export function ContactDocumentsPanel({ base, contact }: { base: string; contact: Pick<Contact, "id" | "kind"> }) {
  const types = TYPES[contact.kind] ?? [];
  const { data, loading, error, refresh } = useResource(async () => {
    const [pages, balances] = await Promise.all([
      Promise.all(types.map((type) => listDocuments(type, { contactId: contact.id, pageSize: 50 }).catch(() => null))),
      getContactBalances().catch(() => null),
    ]);
    const rows = pages.flatMap((page) => page?.items ?? [])
      .sort((a, b) => (b.documentDate ?? "").localeCompare(a.documentDate ?? ""));
    return { rows, failed: pages.some((page) => page === null), balance: balances?.contacts.find((row) => row.contactId === contact.id) ?? null };
  }, `contact-documents:${contact.id}`);
  if (!types.length) return null;
  return <Panel title="Balance and documents" subtitle="Invoices, bills, notes and payments for this contact, typed or scanned. Balances are from posted books.">
    {loading && <LoadingState variant="table" />}
    {error && !data && <ErrorState message={error} retry={refresh} />}
    {data && <>
      <div className="panel-body detail-list">
        <div><span>{contact.kind === "customer" ? "Owed by customer" : "Owed to supplier"}</span>
          <strong>{money(data.balance ? (contact.kind === "customer" ? data.balance.receivable : data.balance.payable) : "0")}</strong></div>
        <div><span>Overdue</span><strong>{money(data.balance?.overdue ?? "0")}</strong></div>
        <div><span>Open items</span><strong>{data.balance?.openItems ?? 0}</strong></div>
        <div><span>Oldest due</span><strong>{data.balance?.oldestDue ? formatDate(data.balance.oldestDue) : "—"}</strong></div>
      </div>
      {data.failed && <p className="notice warning" role="status">Some document lists could not be loaded. Refresh to try again.</p>}
      <DataTable rows={data.rows} rowKey={(row) => `${row.source}:${row.id}`} emptyMessage="No invoices, bills or payments for this contact yet." columns={[
        { label: "Document", render: (row) => { const link = href(base, row); const text = `${DOCUMENT_LABELS[row.type] ?? row.type} ${row.number}`;
          return link ? <Link className="text-link" href={link}>{text}</Link> : text; } },
        { label: "Date", render: (row) => formatDate(row.documentDate) },
        { label: "Due", render: (row) => row.dueDate ? formatDate(row.dueDate) : "—" },
        { label: "Amount", render: (row) => money(row.amount) },
        { label: "Outstanding", render: (row) => row.outstanding == null ? "—" : money(row.outstanding) },
        { label: "Status", render: (row) => <StatusBadge status={documentStatusLabel(row.status, row.type)} /> },
        { label: "Source", render: (row) => <Badge>{row.source === "typed" ? "Typed" : "Scanned"}</Badge> },
      ]} />
    </>}
  </Panel>;
}

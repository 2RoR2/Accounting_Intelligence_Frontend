"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Badge, EmptyState, Field, LoadingState, PageHeader, Panel, SearchInput, StatusBadge, formatDate, money,
  type Column,
} from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  DOCUMENT_LABELS, SALES_TYPES, SCANNED_LIST_TYPES, getSharingStatus, listDocuments, postScannedRecord,
  type DocumentType, type ErpDocument,
} from "@/lib/api/erp.service";
import {
  documentHref, documentStatusLabel, hasOutstanding, statusFilterOptions, type DocumentGroup,
} from "./document-logic";

type DocumentListProps = { base: string; group: DocumentGroup; type: DocumentType; canPost: boolean };
type Filters = NonNullable<Parameters<typeof listDocuments>[1]> & { page: number };

export function DocumentList({ base, group, type, canPost }: DocumentListProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({ page: 1, pageSize: 30 });
  const showsScanned = SCANNED_LIST_TYPES.has(type);
  const label = DOCUMENT_LABELS[type];
  const title = type === "goods-received" || type === "money-in" || type === "money-out" ? label : `${label}s`;

  useEffect(() => {
    const value = search.trim();
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search ?? "") === value ? current : { ...current, search: value, page: 1 });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filter = (changes: Partial<Filters>) => setFilters((current) => ({ ...current, ...changes, page: 1 }));

  return <>
    <PageHeader title={title} actions={<>
      {type === "invoice" && canPost && <MyInvoisLink base={base} />}
      <Link className="btn primary" href={documentHref(base, group, type, "new")}>New</Link>
    </>} />
    {showsScanned && <p className="notice info mb-4">Approved scanned documents appear here too; each posts once whichever way it is posted.</p>}
    <Panel>
      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder={`Search ${title.toLowerCase()}`} />
        <Field label="Status">
          <select value={filters.status ?? ""} onChange={(event) => filter({ status: (event.target.value || undefined) as Filters["status"] })}>
            <option value="">All</option>
            {statusFilterOptions(type, showsScanned)
              .map((status) => <option key={status} value={status}>{documentStatusLabel(status, type)}</option>)}
          </select>
        </Field>
        <Field label="Date from"><input type="date" value={filters.dateFrom ?? ""} onChange={(event) => filter({ dateFrom: event.target.value })} /></Field>
        <Field label="Date to"><input type="date" value={filters.dateTo ?? ""} onChange={(event) => filter({ dateTo: event.target.value })} /></Field>
        {showsScanned && <Field label="Source">
          <select value={filters.source ?? "all"} onChange={(event) => filter({ source: event.target.value as Filters["source"] })}>
            <option value="all">All</option><option value="typed">Typed</option><option value="scanned">Scanned</option>
          </select>
        </Field>}
      </div>
      <DocumentResults key={JSON.stringify(filters)} {...{ base, group, type, canPost, filters }}
        onPage={(page) => setFilters((current) => ({ ...current, page }))} />
    </Panel>
  </>;
}

function MyInvoisLink({ base }: { base: string }) {
  const { data } = useResource(getSharingStatus, "myinvois-link");
  return data?.myinvoisPrep ? <Link className="btn" href={`${base}/myinvois`}>MyInvois (prepared)</Link> : null;
}

function DocumentResults({ base, group, type, canPost, filters, onPage }: DocumentListProps & {
  filters: Filters;
  onPage: (page: number) => void;
}) {
  const { data, error, loading, refresh, setData } = useResource(() => listDocuments(type, filters), type);
  const [actionError, setActionError] = useState("");
  const [postingId, setPostingId] = useState<string>();

  async function post(id: string) {
    setPostingId(id);
    setActionError("");
    try {
      await postScannedRecord(id);
      setData((current) => {
        if (!current) return current;
        const items = current.items.map<ErpDocument>((row) => row.source === "scanned" && row.id === id
          ? { ...row, status: "ready", posted: true }
          : row).filter((row) => !filters.status || row.status === filters.status);
        return { ...current, items, total: current.total - (current.items.length - items.length) };
      });
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to post this document.");
    } finally {
      setPostingId(undefined);
    }
  }

  if (loading) return <LoadingState variant="table" />;
  if (!data) return <div className="notice danger error-state" role="alert">
    <p>{error || "Unable to load documents."}</p>
    <button className="btn small" type="button" onClick={() => void refresh()}>Try again</button>
  </div>;

  const columns: Column<ErpDocument>[] = [
    { label: "Number", render: (row) => <>
      <strong>{row.number}</strong>
      {row.source === "typed" && row.displayName && <div className="text-xs text-slate-500">{row.displayName}</div>}
    </> },
    { label: "Date", render: (row) => formatDate(row.documentDate) },
    { label: "Contact", render: (row) => row.contactName || "—" },
    { label: "Source", render: (row) => <Badge>{row.source === "typed" ? "Typed" : "Scanned"}</Badge> },
    { label: "Amount", render: (row) => money(row.amount) },
  ];
  if (hasOutstanding(type)) columns.push(
    { label: "Outstanding", render: (row) => row.outstanding == null ? "—" : money(row.outstanding) },
    { label: "Payment", render: (row) => row.source === "typed" && row.paymentStatus ? <StatusBadge status={row.paymentStatus} /> : "—" },
  );
  columns.push(
    { label: "Status", render: (row) => <StatusBadge status={documentStatusLabel(row.status, type)} /> },
    { label: "Ledger", render: (row) => !row.posts ? "Record only" : row.posted ? "Posted" : "Not posted" },
    { label: "Action", render: (row) => row.source === "typed"
      ? <Link className="btn small" href={documentHref(base, group, type, row.id)}>View</Link>
      : <div className="row-actions">
          <Link className="btn small" href={`${base}/documents/${encodeURIComponent(row.documentId)}`}>Open document</Link>
          {canPost && row.status === "approved" && <button type="button" className="btn small" disabled={!!postingId}
            onClick={() => void post(row.id)}>{postingId === row.id ? "Posting…" : "Post to ledger"}</button>}
        </div> },
  );

  // The API owns pagination here. DataTable also slices rows into pages of eight.
  return <>
    {actionError && <div className="notice danger error-state" role="alert">{actionError}</div>}
    {data.items.length ? <div className="table-scroll" role="region" aria-label="Documents" tabIndex={0}>
      <table>
        <thead><tr>{columns.map(({ label }) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{data.items.map((row) => <tr key={`${row.source}:${row.id}`}>
          {columns.map(({ label, render }) => <td key={label}>{render(row)}</td>)}
        </tr>)}</tbody>
      </table>
    </div> : <EmptyState message={hasFilters(filters) ? "No documents match these filters. Clear a filter to see the rest." : emptyHint(type)} />}
    <div className="filter-bar" aria-label="Document pages">
      <button className="btn small" type="button" disabled={data.page <= 1 || !!postingId} onClick={() => onPage(data.page - 1)}>Previous</button>
      <span>Page {data.page} · {data.total} {data.total === 1 ? "result" : "results"}</span>
      <button className="btn small" type="button" disabled={data.nextPage == null || !!postingId}
        onClick={() => { if (data.nextPage != null) onPage(data.nextPage); }}>Next</button>
    </div>
  </>;
}

const hasFilters = (filters: Filters) => Object.entries(filters).some(([key, value]) => key !== "page" && key !== "pageSize" && !!value && value !== "all");

/** B4 (from S2): an empty list says what to do next. */
function emptyHint(type: DocumentType) {
  const label = DOCUMENT_LABELS[type].toLowerCase();
  if (type === "payment" || type === "purchase-payment") return `No ${label}s yet. Record one against an invoice or bill with New.`;
  if ((SALES_TYPES as readonly string[]).includes(type)) return `No ${label}s yet. Create one with New: what you issue is typed here, not uploaded.`;
  if (type === "bank-transfer") return "No transfers yet. Record a move between your own bank accounts with New.";
  return `No ${label}s yet. Captured documents appear here after you approve them in the Inbox.`;
}

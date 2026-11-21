"use client";

import { useRef, useState, type FormEvent } from "react";
import { DataTable, EmptyState, Field, LoadingState, PageHeader, Panel, formatDate, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  DOCUMENT_LABELS, getSharingStatus, listConsolidations, listDocuments, prepareConsolidation, type ErpDocument,
} from "@/lib/api/erp.service";
import type { User } from "@/types";

const PREPARED_ONLY = "Prepared only — not submitted to LHDN";
const MAX_INVOICES = 500;
type DateRange = { dateFrom: string; dateTo: string };

function validDateRange({ dateFrom, dateTo }: DateRange) {
  return Boolean(dateFrom && dateTo && dateFrom <= dateTo);
}

export function readyInvoicesInRange<T extends Pick<ErpDocument, "type" | "source" | "status" | "documentDate">>(
  documents: T[], { dateFrom, dateTo }: DateRange,
) {
  if (!validDateRange({ dateFrom, dateTo })) return [];
  return documents.filter((document) => document.type === "invoice" && document.source === "typed" &&
    document.status === "ready" && document.documentDate &&
    document.documentDate >= dateFrom && document.documentDate <= dateTo);
}

export function MyInvoisPage({ user }: { user: User }) {
  if (user.role !== "LOCAL_ADMIN") return null;
  return <MyInvoisGate key={user.id} />;
}

function MyInvoisGate() {
  const { data, loading, error, refresh } = useResource(getSharingStatus, "myinvois-status");
  return <>
    <PageHeader title="MyInvois preparation" />
    {loading ? <LoadingState /> : !data
      ? <LoadError message={error || "Unable to load MyInvois settings."} retry={refresh} />
      : !data.myinvoisPrep
        ? <EmptyState message="MyInvois preparation is switched off for this company." />
        : <EnabledMyInvois note={data.myinvoisNote} />}
  </>;
}

function EnabledMyInvois({ note }: { note: string }) {
  const records = useResource(listConsolidations, "myinvois-consolidations");
  const [range, setRange] = useState<DateRange>({ dateFrom: "", dateTo: "" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const idempotencyKey = useRef<string | undefined>(undefined);
  const validRange = validDateRange(range);

  function clearAttempt() {
    idempotencyKey.current = undefined;
    setActionError("");
    setMessage("");
  }

  function changeDate(field: keyof DateRange, value: string) {
    setRange((current) => ({ ...current, [field]: value }));
    setPage(1);
    setSelected([]);
    clearAttempt();
  }

  function select(id: string, checked: boolean) {
    setSelected((ids) => checked ? [...ids, id] : ids.filter((selectedId) => selectedId !== id));
    clearAttempt();
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validRange || selected.length === 0) return;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      // Keep the key for retries with the same dates and selected invoices.
      idempotencyKey.current ??= crypto.randomUUID();
      const result = await prepareConsolidation({
        documentType: "invoice", ...range, documentIds: selected, idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = undefined;
      setSelected([]);
      setMessage(`Prepared a consolidated record for ${result.documentCount} ${result.documentCount === 1 ? "invoice" : "invoices"}.`);
      await records.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to prepare the consolidated record.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="notice warning review-blocking-notice mb-4">
      <div>
        <strong>{PREPARED_ONLY}</strong>
        {note && <p>{note}</p>}
      </div>
    </div>
    <Panel title="Prepare a consolidated record">
      <form aria-busy={busy} onSubmit={prepare}>
        <div className="grid gap-x-4 px-5 pt-5 sm:grid-cols-2">
          <Field label="Date from *">
            <input type="date" required disabled={busy} value={range.dateFrom} max={range.dateTo || undefined}
              onChange={(event) => changeDate("dateFrom", event.target.value)} />
          </Field>
          <Field label="Date to *">
            <input type="date" required disabled={busy} value={range.dateTo} min={range.dateFrom || undefined}
              onChange={(event) => changeDate("dateTo", event.target.value)} />
          </Field>
        </div>
        {validRange ? <InvoiceOptions key={`${range.dateFrom}:${range.dateTo}:${page}:${records.data?.length ?? 0}`}
          {...{ range, page, selected, busy }} prepared={preparedInvoiceIds(records.data ?? [])}
          onSelect={select} onPage={setPage} /> : <p className="px-5">
          {range.dateFrom && range.dateTo ? "Date to must be on or after Date from." : "Choose a date range to find ready invoices."}
        </p>}
        <div className="space-y-2 p-5">
          {actionError && <div className="notice danger error-state" role="alert">{actionError}</div>}
          {message && <p role="status">{message}</p>}
          {validRange && <p>{selected.length} selected{selected.length === MAX_INVOICES ? " (maximum)" : ""}</p>}
          <button type="submit" className="btn primary" disabled={busy || !validRange || !selected.length}>
            {busy ? "Preparing…" : "Prepare consolidated record"}
          </button>
        </div>
      </form>
    </Panel>
    <Panel title="Prepared records">
      {records.loading ? <LoadingState variant="table" /> : !records.data
        ? <LoadError message={records.error || "Unable to load prepared records."} retry={records.refresh} />
        : records.data.length ? <DataTable rows={records.data} rowKey={(row) => row.id} columns={[
          { label: "Date from", render: (row) => formatDate(row.dateFrom) },
          { label: "Date to", render: (row) => formatDate(row.dateTo) },
          { label: "Document type", render: (row) => DOCUMENT_LABELS[row.documentType] },
          { label: "Documents", render: (row) => row.documentCount },
          { label: "Total", render: (row) => money(row.totalAmount) },
          { label: "Status", render: () => PREPARED_ONLY },
          { label: "Prepared on", render: (row) => formatDate(row.createdAt.replace(" ", "T")) },
        ]} /> : <EmptyState message="No consolidated records have been prepared." />}
    </Panel>
  </>;
}

function InvoiceOptions({ range, page, selected, busy, prepared, onSelect, onPage }: {
  range: DateRange; page: number; selected: string[]; busy: boolean; prepared: ReadonlySet<string>;
  onSelect: (id: string, checked: boolean) => void; onPage: (page: number) => void;
}) {
  const { data, error, loading, refresh } = useResource(
    () => listDocuments("invoice", { ...range, page, source: "typed", status: "ready" }), "myinvois-invoices",
  );
  if (loading) return <LoadingState variant="table" />;
  if (!data) return <LoadError message={error || "Unable to load ready invoices."} retry={refresh} />;
  const invoices = readyInvoicesInRange(data.items, range).filter((invoice) => !prepared.has(invoice.id));

  return <>
    {invoices.length ? <div className="table-scroll" role="region" aria-label="Ready invoices" tabIndex={0}>
      <table>
        <thead><tr>
          <th scope="col">Select</th><th scope="col">Invoice</th><th scope="col">Date</th>
          <th scope="col">Contact</th><th scope="col">Amount</th>
        </tr></thead>
        <tbody>{invoices.map((invoice) => {
          const checked = selected.includes(invoice.id);
          return <tr key={invoice.id}>
            <td><input type="checkbox" aria-label={`Select invoice ${invoice.number}`} checked={checked}
              disabled={busy || (!checked && selected.length >= MAX_INVOICES)}
              onChange={(event) => onSelect(invoice.id, event.target.checked)} /></td>
            <th scope="row">{invoice.number}</th>
            <td>{formatDate(invoice.documentDate)}</td>
            <td>{invoice.contactName || "—"}</td>
            <td>{money(invoice.amount)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <EmptyState message="No ready invoices match these dates." />}
    {(data.page > 1 || data.nextPage != null) && <div className="filter-bar" aria-label="Invoice pages">
      <button type="button" className="btn small" disabled={busy || data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous</button>
      <span>Page {data.page}</span>
      <button type="button" className="btn small" disabled={busy || data.nextPage == null}
        onClick={() => { if (data.nextPage != null) onPage(data.nextPage); }}>Next</button>
    </div>}
  </>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="notice danger error-state" role="alert">
    <p>{message}</p>
    <button type="button" className="btn small" onClick={retry}>Try again</button>
  </div>;
}

/** Ids of invoices that are already in a prepared consolidated record (the backend refuses them again). */
export function preparedInvoiceIds(records: readonly { documentIds?: string[] }[]): ReadonlySet<string> {
  return new Set(records.flatMap((record) => record.documentIds ?? []));
}

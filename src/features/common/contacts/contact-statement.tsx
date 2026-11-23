"use client";

import React, { useState, type FormEvent } from "react";
import { EmptyState, ErrorState, Field, formatDate, LoadingState, money, Panel } from "@/components/common/ui";
import { isoDateIn } from "@/features/common/erp/currency-rates";
import { useResource } from "@/features/common/hooks/use-resource";
import { listContacts } from "@/lib/api/erp.service";
import {
  contactStatementPath, downloadContactStatement, getContactStatement,
  type ContactStatement, type StatementBucket, type StatementRange,
} from "@/lib/api/statement.service";

const dateInput = { type: "date", required: true, min: "0001-01-01", max: "9999-12-31" };
const bucketLabels: Record<StatementBucket, string> = {
  current: "Current", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days",
};

/** Default range: the start of the year to today (Malaysia time). */
export function defaultStatementRange(now: Date = new Date()): StatementRange {
  const today = isoDateIn("Asia/Kuala_Lumpur", now);
  return { fromDate: `${today.slice(0, 4)}-01-01`, toDate: today };
}

const blankZero = (value: string) => (Number(value) === 0 ? "" : money(value));

export function StatementTable({ statement }: { statement: ContactStatement }) {
  const { lines, ageing } = statement;
  return <>
    <div className="table-scroll" role="region" aria-label="Statement of account" tabIndex={0}>
      <table>
        <thead><tr>{["Date", "Transaction", "No.", "Description", "Debit", "Credit", "Balance"].map((column) =>
          <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>
          <tr className="report-total">
            <td>{formatDate(statement.fromDate)}</td><th scope="row" colSpan={5}>Opening balance</th>
            <td>{money(statement.openingBalance)}</td>
          </tr>
          {lines.map((line, index) => <tr key={`${line.type}:${line.number}:${index}`}>
            <td>{formatDate(line.date)}</td>
            <td>{line.label}</td>
            <td>{line.number}</td>
            <td>{line.description}</td>
            <td>{blankZero(line.debit)}</td>
            <td>{blankZero(line.credit)}</td>
            <td>{money(line.balance)}</td>
          </tr>)}
          {!lines.length && <tr><td colSpan={7}>No transactions in this period.</td></tr>}
        </tbody>
        <tfoot className="report-total"><tr>
          <td>{formatDate(statement.toDate)}</td><th scope="row" colSpan={3}>Closing balance</th>
          <td>{money(statement.totalDebit)}</td><td>{money(statement.totalCredit)}</td><td>{money(statement.closingBalance)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div className="panel-body">
      <p><strong>{statement.balanceLabel}: {money(statement.closingBalance)}</strong></p>
      <h3>Ageing at {formatDate(ageing.asOf)}</h3>
    </div>
    <div className="table-scroll" role="region" aria-label="Statement ageing" tabIndex={0}>
      <table>
        <thead><tr>
          {ageing.buckets.map((bucket) => <th key={bucket} scope="col">{bucketLabels[bucket]}</th>)}
          <th scope="col">Open items</th>
        </tr></thead>
        <tbody><tr>
          {ageing.buckets.map((bucket) => <td key={bucket}>{money(ageing.totals[bucket])}</td>)}
          <td><strong>{money(ageing.openItems)}</strong></td>
        </tr></tbody>
      </table>
    </div>
    {(Number(ageing.unallocatedCredits) !== 0 || !ageing.reconciles) && <div className="panel-body">
      {Number(ageing.unallocatedCredits) !== 0 && <p>
        Payments and credits not allocated to an item: {money(-Number(ageing.unallocatedCredits))} · Balance {money(ageing.balance)}
      </p>}
      {!ageing.reconciles && <p className="notice danger" role="alert">
        The ageing differs from the closing balance by {money(ageing.difference)}. Review this contact’s documents.
      </p>}
    </div>}
  </>;
}

function StatementResult({ contactId, range, edited }: { contactId: string; range: StatementRange; edited: boolean }) {
  const { data, error, refresh } = useResource(() => getContactStatement(contactId, range), contactStatementPath(contactId, range));
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function savePdf() {
    if (!data || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadContactStatement(data);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "Unable to download the statement.");
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <ErrorState message={error} retry={refresh} />;
  if (!data) return <LoadingState variant="table" />;
  return <>
    <div className="report-toolbar report-result-toolbar">
      <p>{`${data.contact.name} · ${formatDate(data.fromDate)} – ${formatDate(data.toDate)} · ${data.currency}`}</p>
      <div className="actions" aria-busy={downloading}>
        <button type="button" className="btn" disabled={downloading || edited} onClick={() => void savePdf()}>
          {downloading ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>
    </div>
    {downloadError && <div className="panel-body"><div className="notice danger" role="alert">{downloadError}</div></div>}
    <StatementTable statement={data} />
  </>;
}

/** The statement of account of one customer or supplier: choose dates, preview, download the PDF. Read-only. */
export function ContactStatementPanel({ contactId, title = "Statement of account" }: { contactId: string; title?: string }) {
  const [range, setRange] = useState(defaultStatementRange);
  const [draft, setDraft] = useState(range);
  const edited = draft.fromDate !== range.fromDate || draft.toDate !== range.toDate;

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRange(draft);
  }

  return <Panel title={title} subtitle="Opening balance, every transaction in date order, closing balance and ageing. Nothing is posted.">
    <form className="report-toolbar report-date-filters" onSubmit={apply}>
      <Field label="From date *">
        <input {...dateInput} max={draft.toDate || dateInput.max} value={draft.fromDate}
          onChange={(event) => setDraft({ ...draft, fromDate: event.target.value })} />
      </Field>
      <Field label="To date *">
        <input {...dateInput} min={draft.fromDate || dateInput.min} value={draft.toDate}
          onChange={(event) => setDraft({ ...draft, toDate: event.target.value })} />
      </Field>
      <button type="submit" className="btn primary" disabled={!edited}>Show statement</button>
    </form>
    <StatementResult key={contactStatementPath(contactId, range)} contactId={contactId} range={range} edited={edited} />
  </Panel>;
}

/** Reports > Statement of account: pick a customer or supplier, then the same panel as on the contact page. */
export function StatementOfAccountReport() {
  const { data, error, refresh } = useResource(() => listContacts({ includeInactive: true }), "statement-contacts");
  const [contactId, setContactId] = useState("");
  const contacts = (data ?? []).filter((contact) => contact.kind !== "employee");

  return <>
    <Panel title="Statement of account">
      {error && <ErrorState message={error} retry={refresh} />}
      {!data && !error && <LoadingState variant="form" />}
      {data && (contacts.length ? <div className="report-toolbar report-date-filters">
        <Field label="Customer or supplier *">
          <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Select a contact</option>
            {(["customer", "supplier"] as const).map((kind) => <optgroup key={kind} label={kind === "customer" ? "Customers" : "Suppliers"}>
              {contacts.filter((contact) => contact.kind === kind).map((contact) => <option key={contact.id} value={contact.id}>
                {contact.legalName}{contact.code ? ` (${contact.code})` : ""}{contact.isActive ? "" : " · inactive"}
              </option>)}
            </optgroup>)}
          </select>
        </Field>
      </div> : <EmptyState message="No customers or suppliers yet. Add one under Contacts." />)}
    </Panel>
    {contactId && <ContactStatementPanel key={contactId} contactId={contactId} title="Statement" />}
  </>;
}

"use client";

import { useEffect, useState } from "react";
import { DataTable, EmptyState, LoadingState, PageHeader, Panel, formatDate, money } from "@/components/common/ui";
import { getSharedDocument, publicShareErrorText, type SharedDocument } from "@/lib/api/erp.service";

export function SharedDocumentView({ token }: { token: string }) {
  const [result, setResult] = useState<{ document: SharedDocument } | { error: string }>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    // The API counts each read. Skip the request if the effect is immediately cleaned up.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void getSharedDocument(token, controller.signal)
        .then((document) => { if (active) setResult({ document }); })
        .catch((error: unknown) => {
          if (active) setResult({ error: error instanceof Error ? error.message : publicShareErrorText() });
        })
        .finally(() => window.clearTimeout(timeout));
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [token]);

  return <div className="home-wash">
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      {!result ? <LoadingState /> : "error" in result
        ? <div className="notice danger error-state" role="alert">{result.error}</div>
        : <DocumentContent document={result.document} />}
    </main>
  </div>;
}

function DocumentContent({ document }: { document: SharedDocument }) {
  const { lines, currency } = document;
  const amount = (value: string) => currency === "MYR" ? money(value) : new Intl.NumberFormat("en-MY", {
    style: "currency", currency, currencyDisplay: "code",
  }).format(Number(value));
  const rows = lines.map((line, index) => ({ ...line, index }));

  return <>
    <PageHeader eyebrow={document.companyName} title={`${document.documentLabel} ${document.number}`} />
    <Panel title="Details">
      <dl className="grid gap-4 p-5 sm:grid-cols-2">
        <div><dt>Document date</dt><dd>{formatDate(document.documentDate)}</dd></div>
        {document.dueDate && <div><dt>Due date</dt><dd>{formatDate(document.dueDate)}</dd></div>}
        {document.contactName && <div><dt>Contact</dt><dd>{document.contactName}</dd></div>}
        {document.referenceNo && <div><dt>Reference no.</dt><dd>{document.referenceNo}</dd></div>}
        {document.description && <div className="sm:col-span-2"><dt>Description</dt><dd className="whitespace-pre-wrap">{document.description}</dd></div>}
      </dl>
    </Panel>
    <Panel title="Lines">
      {rows.length ? <DataTable rows={rows} rowKey={(row) => String(row.index)} columns={[
        { label: "Description", render: (row) => row.description || "—" },
        { label: "Quantity", render: (row) => row.quantity },
        { label: "Unit price", render: (row) => amount(row.unitPrice) },
        { label: "Discount", render: (row) => amount(row.discount) },
        { label: "Tax", render: (row) => amount(row.tax) },
      ]} /> : <EmptyState message="This document has no line items." />}
    </Panel>
    <Panel title="Totals">
      <dl className="grid gap-4 p-5 sm:grid-cols-3">
        <div><dt>Subtotal</dt><dd>{amount(document.subtotal)}</dd></div>
        <div><dt>Tax</dt><dd>{amount(document.taxAmount)}</dd></div>
        <div><dt>Total</dt><dd><strong>{amount(document.total)}</strong></dd></div>
      </dl>
    </Panel>
    <p>Link expires {formatDate(document.expiresAt.replace(" ", "T"))}</p>
  </>;
}

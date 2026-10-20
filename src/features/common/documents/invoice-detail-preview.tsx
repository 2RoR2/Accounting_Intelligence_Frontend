"use client";

import { DataTable, Badge, formatDate, money } from "@/components/common/ui";
import type { Document, Extraction, LineItem } from "@/types";

export function InvoiceDetailPreview({ doc, extraction }: { doc: Document; extraction: Extraction }) {
  const field = (key: string, fallback = "") => extraction.fields[key]?.value || fallback;
  const total = (doc.totalAmount ?? Number(field("total", "0"))) || 0;
  const subtotal = Number(field("subtotal", String(total))) || total;
  const customer = doc.customer || field("customer", "Not assigned");
  const number = field("invoice", doc.id);

  const tabs = ["Billing & Shipping", "General Info", "Items", "Payment Terms", "Additional Info", "Custom Fields", "Attachments", "Controls", "MyInvois Info", "History"];

  return (
    <section className="invoice-review-page" aria-label="Invoice details">
      <div className="invoice-review-heading">
        <div><span className="invoice-status">{doc.status === "COMPLETED" ? "Completed" : "Coming Due"}</span><h2>View Invoice</h2><p>{number} · {customer}</p></div>
        <div className="invoice-review-actions"><button className="btn" type="button">Actions⌄</button><button className="btn primary" type="button">QuickShare…</button></div>
      </div>
      <nav className="invoice-tabs" aria-label="Invoice sections">
        {tabs.map((tab, index) => <a key={tab} className={index === 0 ? "active" : ""} href={`#invoice-${index}`}>{tab}</a>)}
      </nav>
      <div className="invoice-review-grid">
        <div className="invoice-detail-card"><h3>Billing &amp; Shipping</h3><p>Billing &amp; shipping parties for the transaction.</p><div className="invoice-detail-columns"><div><strong>Payment Mode</strong><span>Credit Sales</span></div><div><strong>Customer</strong><span>{customer}</span></div><div><strong>Billing Attention</strong><span>{customer}</span></div><div><strong>Billing Address</strong><span>Not provided</span></div></div></div>
        <div className="invoice-detail-card"><h3>General Info</h3><p>General information such as number, date and currency.</p><div className="invoice-detail-columns"><div><strong>No.</strong><span>{number}</span></div><div><strong>Date</strong><span>{field("date", formatDate(doc.createdAt))}</span></div><div><strong>Currency</strong><span>{field("currency", "MYR")}</span></div><div><strong>Reference No.</strong><span>{field("reference", "—")}</span></div></div></div>
        <div className="invoice-detail-card invoice-items-card"><h3>Items</h3><p>Tax-exclusive invoice items and calculated totals.</p><DataTable rows={extraction.lineItems} rowKey={(r) => r.description} columns={[{ label: "Item", render: (r: LineItem) => r.description }, { label: "Quantity", render: (r: LineItem) => r.quantity }, { label: "Unit Price", render: (r: LineItem) => money(r.unitPrice) }, { label: "Amount", render: (r: LineItem) => money(r.amount) }]} /><div className="invoice-totals"><span>Sub Total <b>{money(subtotal)}</b></span><span>Discount Given <b>{money(0)}</b></span><span>TOTAL <b>{money(total)}</b></span><span>BALANCE <b>{money(total)}</b></span></div></div>
        <div className="invoice-detail-card"><h3>Payment Terms</h3><p>Term and due date for this invoice.</p><div className="invoice-term-row"><strong>NET30</strong><span>{doc.dueDate ? formatDate(doc.dueDate) : "Not provided"}</span><b>{money(total)}</b></div></div>
        <div className="invoice-detail-card"><h3>Controls</h3><p>Controls and statuses for the transaction.</p><div className="invoice-control-row"><span>Status</span><Badge>{doc.status}</Badge><span>MyInvois Control</span><Badge>Normal</Badge></div></div>
        <div className="invoice-detail-card"><h3>History</h3><p>Action history performed on the transaction.</p><div className="invoice-history-row"><span>{formatDate(doc.createdAt)}</span><span>{doc.ownerId}</span><span>Created and uploaded</span></div></div>
      </div>
    </section>
  );
}

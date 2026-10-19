"use client";
import { Badge } from "@/components/common/ui";
import { decimalDisplay } from "@/lib/api/document-contract";
import type { Document, Extraction } from "@/types";
export function InvoiceDetailPreview({ doc, extraction }: { doc: Document; extraction: Extraction }) {
  const value = (key: string) => extraction.fields[key]?.value;
  return <section className="invoice-review-page" aria-label="Invoice details">
    <div className="invoice-review-heading"><div><span className="invoice-status">{doc.status}</span><h2>Invoice details</h2><p>Source classification: {extraction.classification?.value ?? "Not provided"} | {extraction.classification?.status ?? "Not provided"}</p></div><Badge>Human review required</Badge></div>
    <div className="invoice-review-grid">
      <div className="invoice-detail-card"><h3>Extracted accounting information</h3><div className="invoice-detail-columns">
        {["supplier","invoice","date","currency"].map(key => <div key={key}><strong>{extraction.fields[key]?.label ?? key}</strong><span>{value(key) ?? "Not provided"}</span></div>)}
      </div></div>
      <div className="invoice-detail-card"><h3>Source amounts</h3><div className="invoice-totals">
        {["subtotal","tax","discount","total"].map(key => <span key={key}>{extraction.fields[key]?.label ?? key}<b>{decimalDisplay(value(key),value("currency"))}</b></span>)}
      </div><p>Validation and approval do not indicate payment or settlement.</p></div>
    </div>
  </section>;
}

"use client";
import { useState } from "react";
import { Minus, Plus, Search, FileText } from "lucide-react";
import { money } from "@/components/common/ui";
import type { Extraction } from "@/types";

export function DocumentViewer({
  name,
  extraction,
}: {
  name: string;
  extraction: Extraction;
}) {
  const f = extraction.fields;
  const [zoom, setZoom] = useState(100);
  const value = (key: string, fallback = "—") =>
    f[key]?.original || f[key]?.value || fallback;
  const documentType = value("type", "Invoice").toUpperCase();

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-toolbar">
        <button type="button" aria-label="Search" className="viewer-btn">
          <Search size={14} />
        </button>
        <span className="viewer-page">1 of 1</span>
        <button
          type="button"
          aria-label="Zoom out"
          className="viewer-btn"
          onClick={() => setZoom((z) => Math.max(60, z - 10))}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          className="viewer-btn"
          onClick={() => setZoom((z) => Math.min(160, z + 10))}
        >
          <Plus size={14} />
        </button>
        <span className="viewer-zoom">{zoom}%</span>
        <span className="viewer-name">
          <FileText size={13} /> {name}
        </span>
      </div>
      <div className="doc-viewer-canvas">
        <div className="doc-paper" style={{ transform: `scale(${zoom / 100})` }}>
          <div className="doc-paper-head">
            <strong>{value("supplier", "Supplier Name")}</strong>
            <span>{documentType}</span>
          </div>
          <p className="doc-paper-address">{value("supplierAddress")}</p>
          <hr />
          <div className="doc-paper-meta">
            <div>
              <small>No.</small>
              <strong>{value("invoice")}</strong>
            </div>
            <div>
              <small>Date</small>
              <strong>{value("date")}</strong>
            </div>
            <div>
              <small>Due</small>
              <strong>{value("due")}</strong>
            </div>
          </div>
          <div className="doc-paper-party">
            <small>Customer</small>
            <strong>{value("customer")}</strong>
            <span>{value("buyerAddress")}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {extraction.lineItems.map((item) => (
                <tr key={item.description}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="doc-paper-total">
            <span>Total</span>
            <strong>{money(value("total", "0"))}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

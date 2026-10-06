import { FileText, ShieldCheck } from "lucide-react";
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
  const value = (key: string, fallback = "—") =>
    f[key]?.original || f[key]?.value || fallback;
  const dateTime = (key: string) => {
    const raw = value(key, "");
    if (!raw) return "—";
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime())
      ? raw
      : parsed.toLocaleString("en-MY", {
          dateStyle: "medium",
          timeStyle: "short",
        });
  };
  const documentType = value("type", "Invoice").toUpperCase();
  return (
    <div className="document-viewer">
      <div className="viewer-toolbar">
        <FileText size={16} />
        <span>{name}</span>
        <span className="subtle-tag">Sample preview</span>
      </div>
      <div className="paper">
        <div className="paper-brand">
          ATLAS<span>OFFICE SUPPLIES</span>
        </div>
        <div className="paper-heading">
          <h2>{documentType}</h2>
          <span>{value("invoice", "INV-2026-00821")}</span>
        </div>
        <p>
          <strong>{value("supplier", "Atlas Office Supplies Sdn Bhd")}</strong>
          <br />
          {value("supplierAddress")}
        </p>
        <hr />
        <div className="paper-meta">
          <div>
            <small>BUYER</small>
            <strong>{value("customer")}</strong>
            <span>{value("buyerAddress")}</span>
          </div>
          <div>
            <small>ISSUED</small>
            <strong>{dateTime("issuanceDateTime")}</strong>
            <small>DUE DATE</small>
            <strong>{value("due")}</strong>
          </div>
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
        <div className="paper-totals">
          <div>
            <span>Subtotal</span>
            <span>RM 800.00</span>
          </div>
          <div>
            <span>Tax (6%)</span>
            <span>RM 48.00</span>
          </div>
          <div className="paper-total">
            <strong>Total due</strong>
            <strong>{money(value("total", "0"))}</strong>
          </div>
        </div>
        <div className="paper-lifecycle">
          <div><small>SUBMITTED</small><strong>{dateTime("submissionDateTime")}</strong></div>
          <div><small>VALIDATED</small><strong>{dateTime("validationDateTime")}</strong></div>
        </div>
        <p className="paper-note">
          Thank you for your business.
          <br />
          <strong>Payment details:</strong> {value("paymentDetails")}
        </p>
      </div>
      <div className="viewer-note">
        <ShieldCheck size={14} />
        Illustrative source document · not the contents of your upload
      </div>
    </div>
  );
}

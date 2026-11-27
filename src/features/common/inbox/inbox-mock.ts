/**
 * A stand-in for BE-B's endpoints, used only when NEXT_PUBLIC_AI_INBOX_MOCK=1 (local checks without the backend
 * feature). It returns the contract's raw JSON shapes (docs/api/insights-fraud-inbox.md) and is never reached in a
 * normal build.
 */
const seed = () => [
  { id: "a3f9c2e1b07d4c5e8f10", kind: "FRAUD_SHIELD", severity: "high", title: "Bank account changed on BILL_102",
    why: "The bank account printed on this unapproved document differs from the one on the supplier's earlier approved documents.",
    evidence: [{ label: "BILL_102", value: "Seladah Utilities · 2026-11-18", href: "documents/doc-102" }],
    actions: [{ label: "Open document", method: "LINK", path: "documents/doc-102", body: null }], basis: null, draft: null },
  { id: "b4a0d3f2c18e5d6f9a21", kind: "SUPPLIER_QUERY_DRAFT", severity: "high", title: "Ask Seladah Utilities to confirm their new bank account",
    why: "The account on BILL_102 (…4417) is not the one used before (…2093). A short note is drafted for you.",
    evidence: [{ label: "Printed on BILL_102", value: "…4417", href: null }, { label: "On approved documents", value: "…2093 (5 documents)", href: "documents/doc-101" }],
    actions: [{ label: "Copy email", method: "COPY", path: null, body: null }, { label: "Open in mail app", method: "MAILTO", path: null, body: null },
      { label: "Open document", method: "LINK", path: "documents/doc-102", body: null }], basis: null,
    draft: { to: "ap@seladah.example", subject: "Please confirm your bank account for invoice BILL_102", wording: "template",
      body: "Dear Seladah Utilities accounts team,\n\nInvoice BILL_102 shows a bank account ending …4417, but our earlier payments went to an account ending …2093. Could you confirm the account in writing?\n\nThank you,\nKNT Accounts" } },
  { id: "c5b1e4a3d29f6e7a0b32", kind: "EXCEPTION_GROUP", severity: "medium", title: "12 documents: supplier “Seladah Utilities” is not on your list",
    why: "The supplier check (EX-008) could not find “Seladah Utilities” in your supplier list. Add it once and check the 12 documents again.",
    evidence: [{ label: "BILL_102", value: "Seladah Utilities · 2026-11-18", href: "documents/doc-102" }, { label: "Exceptions", value: "Open the Exceptions page", href: "exceptions" }],
    actions: [{ label: "Add supplier", method: "POST", path: "/api/erp/contacts", body: { kind: "supplier", legalName: "Seladah Utilities" },
      then: [{ method: "POST", path: "/api/documents/doc-102/revalidate", body: null }, { method: "POST", path: "/api/documents/doc-103/revalidate", body: null }],
      confirm: "Add “Seladah Utilities” to your suppliers and check 12 documents again?" }], basis: null, draft: null },
  { id: "d6c2f5b4e30a7f8b1c43", kind: "BANK_MATCH", severity: "medium", title: "Bank line 14 Nov, MYR 1,260.00 probably pays bill PB-0041",
    why: "Same amount and direction, the supplier name is in the bank description, and the bill is open.",
    evidence: [{ label: "Bank line", value: "2026-11-14 · KNT PAYMENT MERANTI · MYR 1,260.00", href: "reconciliation?status=unmatched" }, { label: "Bill", value: "PB-0041 · Meranti Sdn Bhd", href: "records/rec-41" }],
    actions: [{ label: "Match this bank line to PB-0041", method: "POST", path: "/api/bank/reconciliation/decisions",
      body: { candidateId: "cand-1", decision: "confirmed", expectedRevision: 3, postPayment: false }, then: [],
      confirm: "Match this bank line to PB-0041? This only matches; posting stays on the Reconcile page." },
      { label: "Review on Reconcile page", method: "LINK", path: "reconciliation?status=unmatched", body: null }], basis: ["Rule", "Match"], draft: null },
  { id: "e7d3a6c5f41b8a9c2d54", kind: "CLOSE_BLOCKER", severity: "low", title: "November cannot be closed: 3 documents are still waiting for approval",
    why: "A month closes only when nothing is waiting. Three bills dated in November are in the approval queue.",
    evidence: [{ label: "Waiting for approval", value: "3", href: "approvals" }],
    actions: [{ label: "Open approval queue", method: "LINK", path: "approvals", body: null }], basis: null, draft: null },
];

let items = seed();
export const mockInbox = {
  list: async () => ({ generatedAt: new Date().toISOString(), count: items.length, items: items.map((item) => ({ ...item })) }),
  dismiss: async (id: string) => { items = items.filter((item) => item.id !== id); },
  /** Running an accepted action removes the proposal that listed it, as the backend does once the cause is fixed. */
  run: async (path: string) => { const match = items.find((item) => item.actions.some((action) => action.path === path)); if (match) items = items.filter((item) => item !== match); return { ok: true }; },
  reset: () => { items = seed(); },
};

const flags = [
  { code: "FS-BANK-CHANGE", severity: "high", title: "Bank account changed",
    message: "The bank account printed on this document (…4417) differs from the one on Seladah Utilities' last 5 approved documents (…2093).",
    evidence: [{ label: "Printed on this document", value: "…4417", href: null }, { label: "On approved documents", value: "…2093 (5 documents, latest 2026-10-18)", href: "documents/doc-101" }, { label: "Read from", value: "Extracted field", href: null }],
    action: "Call the supplier on a phone number you already have (not one printed on this document) and confirm the new account before paying." },
  { code: "FS-ROUND", severity: "low", title: "Round amount",
    message: "The total is a whole multiple of RM 1,000 and none of this supplier's earlier approved totals were round.",
    evidence: [{ label: "Total", value: "MYR 4,000.00", href: null }], action: "Check the amount against the supplier's quotation or contract." },
];
/** Roughly half the document ids are flagged, so both the green and the warning chip show. */
export const mockFraud = (documentId: string) => ({ documentId, documentCode: documentId, checkedAt: new Date().toISOString(),
  flags: [...documentId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 1 ? flags : [], acknowledgedCodes: [], acknowledgements: [] });

/**
 * Tabs of the documents pages: the type tabs on "All documents" (?tab=) and the lane tabs on "To review" (?lane=).
 * Pure data and rules, so the page, the sidebar and the tests read the same mapping.
 */
import { readyLabel } from "@/lib/glossary";
import { DOCUMENT_LANES, isDocumentLane, type DocumentLane } from "@/lib/today";

type Side = "payable" | "receivable" | "unknown";
interface CapturedDoc { name: string; type: string; category?: string; direction?: string }

export const DOCUMENT_TAB_KEYS = [
  "all", "purchase-bills", "receipts", "supplier-credit-notes", "supplier-debit-notes",
  "sales-invoices", "sales-credit-notes", "sales-debit-notes", "other",
] as const;
export type DocumentTabKey = (typeof DOCUMENT_TAB_KEYS)[number];

const LABELS: Record<DocumentTabKey, string> = {
  all: "All",
  "purchase-bills": "Bills",
  receipts: "Expense receipts",
  "supplier-credit-notes": "Supplier credit notes",
  "supplier-debit-notes": "Supplier debit notes",
  "sales-invoices": "Sales invoices",
  "sales-credit-notes": "Sales credit notes",
  "sales-debit-notes": "Sales debit notes",
  other: "Other",
};

/** Which side of the books a captured document is on: the category chosen at upload, else the direction the backend read. */
function sideOf(doc: CapturedDoc): Side {
  const category = doc.category?.toUpperCase();
  if (category === "ACCOUNTS_PAYABLE") return "payable";
  if (category === "ACCOUNTS_RECEIVABLE") return "receivable";
  if (doc.direction === "purchase") return "payable";
  if (doc.direction === "sales") return "receivable";
  return "unknown";
}

/**
 * The one type tab a document belongs to, so the tab counts add up to "All". A supplier invoice is a bill;
 * a credit or debit note needs its side to be placed; anything else (type not detected yet) is "Other".
 */
export function documentTabOf(doc: CapturedDoc): Exclude<DocumentTabKey, "all"> {
  const type = doc.type.toUpperCase();
  const side = sideOf(doc);
  if (type === "BILL") return "purchase-bills";
  if (type === "RECEIPT") return "receipts";
  if (type === "INVOICE") return side === "payable" ? "purchase-bills" : "sales-invoices";
  if (type === "CREDIT_NOTE" && side !== "unknown") return side === "payable" ? "supplier-credit-notes" : "sales-credit-notes";
  if (type === "DEBIT_NOTE" && side !== "unknown") return side === "payable" ? "supplier-debit-notes" : "sales-debit-notes";
  return "other";
}

/** A tab key from the URL. Anything unknown falls back to All, so an old or mistyped link still shows the list. */
export function resolveDocumentTab(value: string | null | undefined): DocumentTabKey {
  return (DOCUMENT_TAB_KEYS as readonly string[]).includes(value ?? "") ? (value as DocumentTabKey) : "all";
}

/** Captured files only: the extraction side files (.json) are not documents a person works on. */
export const isCapturedDocument = <T extends { name: string }>(doc: T) => !/\.json$/i.test(doc.name);

export function filterDocumentsByTab<T extends CapturedDoc>(docs: T[], tab: DocumentTabKey): T[] {
  const captured = docs.filter(isCapturedDocument);
  return tab === "all" ? captured : captured.filter((doc) => documentTabOf(doc) === tab);
}

export function documentTabCounts(docs: CapturedDoc[]): Record<DocumentTabKey, number> {
  const counts = Object.fromEntries(DOCUMENT_TAB_KEYS.map((key) => [key, 0])) as Record<DocumentTabKey, number>;
  for (const doc of docs.filter(isCapturedDocument)) {
    counts.all += 1;
    counts[documentTabOf(doc)] += 1;
  }
  return counts;
}

export interface DocumentTab { key: DocumentTabKey; label: string; href: string; count: number }

/** The tabs in display order. "Other" only appears when something is in it (or it is the open tab). */
export function documentTabs(base: string, counts: Record<DocumentTabKey, number>, selected: DocumentTabKey): DocumentTab[] {
  return DOCUMENT_TAB_KEYS
    .filter((key) => key !== "other" || counts.other > 0 || selected === "other")
    .map((key) => ({ key, label: LABELS[key], href: documentTabHref(base, key), count: counts[key] }));
}

/** "All" is the bare list; every other tab has its own query string. */
export const documentTabHref = (base: string, key: DocumentTabKey) =>
  key === "all" ? `${base}/documents` : `${base}/documents?tab=${key}`;

/** Page title: the list is "All documents"; a type tab is titled by its own name. */
export const documentTabTitle = (key: DocumentTabKey) => (key === "all" ? "All documents" : LABELS[key]);

export const documentTabEmptyMessage = (key: DocumentTabKey) =>
  key === "all" ? "No documents yet. Add one in Upload & capture." : `No ${LABELS[key].toLowerCase()} yet. Add a received document in Upload & capture.`;

/* ---------- To review ---------- */

export interface ReviewTab { key: string; label: string; href: string; current: boolean }

/**
 * The tabs of the review area, one per lane of the same backend rule the Dashboard tiles count with.
 * "Sent for approval" is the accountant's list of documents already with the admin; an admin has no such list of
 * their own, their third tab opens the Approval queue page (where they decide).
 * "Needs fixing" is not a tab of its own (it is Exceptions in the menu); it only appears while it is the open lane.
 */
export function reviewTabs(base: string, role: string, current: { lane?: string | null; page?: "approvals" }): ReviewTab[] {
  const lane = isDocumentLane(current.lane) ? current.lane : null;
  const tab = (key: string, label: string, href: string, isCurrent: boolean): ReviewTab => ({ key, label, href, current: isCurrent });
  const tabs = [
    tab("to-review", "To review", `${base}/documents?lane=to-review`, lane === "to-review"),
    tab("ready", readyLabel(role), `${base}/documents?lane=ready`, lane === "ready"),
    role === "LOCAL_ADMIN"
      ? tab("approvals", "Approval queue", `${base}/approvals`, current.page === "approvals")
      : tab("waiting-approval", DOCUMENT_LANES["waiting-approval"], `${base}/documents?lane=waiting-approval`, lane === "waiting-approval"),
  ];
  if (lane === "needs-fixing") tabs.push(tab("needs-fixing", DOCUMENT_LANES["needs-fixing"], `${base}/documents?lane=needs-fixing`, true));
  return tabs;
}

/** The lane a documents URL asks for; "" when it asks for the plain list. */
export const laneFromParam = (value: string | null | undefined): DocumentLane | "" => (isDocumentLane(value) ? value : "");

/** Page title of a lane: To review keeps its short menu name, the others the shared lane name. */
export const laneTitle = (lane: DocumentLane, role?: string | null) =>
  lane === "to-review" ? "To review" : lane === "ready" ? readyLabel(role) : DOCUMENT_LANES[lane];

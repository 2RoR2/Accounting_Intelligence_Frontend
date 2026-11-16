/**
 * Accountant and local-admin menu, grouped by accounting job (plan v2, task B2).
 *
 * Every entry reuses an existing page; a query string only pre-filters that page. The super-admin
 * platform menu is separate and unchanged. The menu is defined here, not read from the backend:
 * `/api/workspace/navigation` (backend `workspace_modules` seed) is not used by this frontend.
 */
export type NavRole = "LOCAL_ADMIN" | "ACCOUNTANT";
export type NavIcon =
  | "today" | "upload" | "review" | "fix" | "approve" | "bill" | "receipt" | "invoice" | "records"
  | "money-in" | "money-out" | "reconcile" | "contacts" | "accounts" | "reports" | "settings"
  | "users" | "rules" | "audit" | "system" | "profile";
export interface NavItem {
  label: string;
  /** Second path segment, e.g. "documents" in /company/documents. */
  page: string;
  /** Optional query that pre-filters the page, e.g. "tab=purchase-bills". */
  query?: string;
  icon: NavIcon;
  /** Shows the open-problems or waiting-approvals count. */
  count?: "exceptions" | "approvals";
}
export interface NavSection { label: string; items: NavItem[] }

const ADMIN_ONLY = new Set(["approvals", "users", "validation-rules", "audit", "system"]);

const SECTIONS: NavSection[] = [
  { label: "Today", items: [{ label: "Today", page: "today", icon: "today" }] },
  { label: "Inbox", items: [
    { label: "Upload", page: "upload", icon: "upload" },
    { label: "To review", page: "documents", icon: "review" },
    { label: "Needs fixing", page: "exceptions", icon: "fix", count: "exceptions" },
    { label: "Ready to approve", page: "approvals", icon: "approve", count: "approvals" },
  ] },
  { label: "Purchases", items: [
    { label: "Supplier bills", page: "documents", query: "tab=purchase-bills", icon: "bill" },
    { label: "Receipts", page: "documents", query: "tab=receipts", icon: "receipt" },
    { label: "Approved purchases", page: "records", query: "category=ACCOUNTS_PAYABLE", icon: "records" },
  ] },
  { label: "Sales", items: [
    { label: "Customer invoices", page: "documents", query: "tab=sales-invoices", icon: "invoice" },
    { label: "Approved sales", page: "records", query: "category=ACCOUNTS_RECEIVABLE", icon: "records" },
  ] },
  { label: "Bank", items: [
    { label: "Money in", page: "money-in", icon: "money-in" },
    { label: "Money out", page: "money-out", icon: "money-out" },
    { label: "Reconcile", page: "reconciliation", icon: "reconcile" },
  ] },
  { label: "Contacts", items: [{ label: "Contacts", page: "contacts", icon: "contacts" }] },
  { label: "Accounts", items: [{ label: "Accounts", page: "ledger", icon: "accounts" }] },
  { label: "Reports", items: [{ label: "Reports", page: "reports", icon: "reports" }] },
  { label: "Settings", items: [
    { label: "Settings", page: "settings", icon: "settings" },
    { label: "Users", page: "users", icon: "users" },
    { label: "Check rules", page: "validation-rules", icon: "rules" },
    { label: "Audit trail", page: "audit", icon: "audit" },
    { label: "System", page: "system", icon: "system" },
    { label: "Profile", page: "profile", icon: "profile" },
  ] },
];

/** The menu for one role. Admin-only entries (approvals, users, rules, audit, System) are left out for accountants. */
export function jobNavigation(role: NavRole): NavSection[] {
  return SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((item) => role === "LOCAL_ADMIN" || !ADMIN_ONLY.has(item.page)) }))
    .filter((section) => section.items.length > 0);
}

export const navHref = (prefix: string, item: NavItem) => `/${prefix}/${item.page}${item.query ? `?${item.query}` : ""}`;

/**
 * The entry for the current page. An entry with a query wins when the URL carries that query;
 * otherwise the plain entry for the page ("To review" for /documents and /documents/<id>).
 */
export function activeNavItem(sections: NavSection[], page: string, search: URLSearchParams | string = ""): NavItem | undefined {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  // The old "dashboard" URL redirects to "today"; while it does, it highlights Today.
  const items = sections.flatMap((section) => section.items).filter((item) => item.page === page || (page === "dashboard" && item.page === "today"));
  const matches = (item: NavItem) => [...new URLSearchParams(item.query ?? "")].every(([key, value]) => params.get(key) === value);
  return items.find((item) => item.query && matches(item)) ?? items.find((item) => !item.query);
}

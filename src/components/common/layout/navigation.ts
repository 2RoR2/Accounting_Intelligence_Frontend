/**
 * Accountant and local-admin menu (plan v3, R0): the team's page names, grouped by when an
 * accountant uses them: the daily work, the bank, and month-end.
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
  { label: "Overview", items: [{ label: "Dashboard", page: "dashboard", icon: "today" }] },
  { label: "Daily work", items: [
    { label: "Upload", page: "upload", icon: "upload" },
    { label: "Documents", page: "documents", icon: "review" },
    { label: "Exceptions", page: "exceptions", icon: "fix", count: "exceptions" },
    { label: "Approvals", page: "approvals", icon: "approve", count: "approvals" },
  ] },
  { label: "Banking", items: [
    { label: "Money In", page: "money-in", icon: "money-in" },
    { label: "Money Out", page: "money-out", icon: "money-out" },
    { label: "Reconciliation", page: "reconciliation", icon: "reconcile" },
  ] },
  { label: "Month-end", items: [
    { label: "Standardised Records", page: "records", icon: "records" },
    { label: "Ledger", page: "ledger", icon: "accounts" },
    { label: "Summary", page: "reports", icon: "reports" },
  ] },
  { label: "Workspace", items: [
    { label: "Contacts", page: "contacts", icon: "contacts" },
    { label: "Settings", page: "settings", icon: "settings" },
    { label: "Users", page: "users", icon: "users" },
    { label: "Check rules", page: "validation-rules", icon: "rules" },
    { label: "Audit trail", page: "audit", icon: "audit" },
    { label: "System", page: "system", icon: "system" },
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
 * otherwise the plain entry for the page ("Documents" for /documents and /documents/<id>).
 */
export function activeNavItem(sections: NavSection[], page: string, search: URLSearchParams | string = ""): NavItem | undefined {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  // /today (B3's URL, still linked from older pages) redirects to the Dashboard; while it does, it highlights Dashboard.
  const items = sections.flatMap((section) => section.items).filter((item) => item.page === page || (page === "today" && item.page === "dashboard"));
  const matches = (item: NavItem) => [...new URLSearchParams(item.query ?? "")].every(([key, value]) => params.get(key) === value);
  return items.find((item) => item.query && matches(item)) ?? items.find((item) => !item.query);
}

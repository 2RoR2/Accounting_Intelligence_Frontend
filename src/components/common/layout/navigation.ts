/**
 * Accountant and local-admin menu: the team's `latest_update` layout (Sales, Purchases, Bank, Reports,
 * Accounting with sub-items), pointed at the pages that exist on `features`.
 *
 * Every entry reuses an existing page; a query string only pre-filters that page. Entries whose
 * `latest_update` page needs the ERP or MyInvois services (Bank Transfers, Control Panel currencies,
 * Cashflow forecast) are left out. The super-admin platform menu is separate and unchanged.
 */
export type NavRole = "LOCAL_ADMIN" | "ACCOUNTANT";
export type NavIcon =
  | "today" | "upload" | "review" | "fix" | "approve" | "bill" | "receipt" | "invoice" | "records"
  | "money-in" | "money-out" | "reconcile" | "contacts" | "accounts" | "reports" | "settings"
  | "users" | "rules" | "audit" | "system" | "profile" | "bank";
export interface NavItem {
  label: string;
  /** Second path segment, e.g. "documents" in /company/documents. */
  page: string;
  /** Optional query that pre-filters the page, e.g. "tab=purchase-bills". */
  query?: string;
  icon: NavIcon;
  /** Shows the open-problems or waiting-approvals count. */
  count?: "exceptions" | "approvals";
  /** Sub-items: the entry becomes an expandable group (it has no page of its own). */
  children?: NavItem[];
  /** Local admins only. */
  adminOnly?: boolean;
}
export interface NavSection { label: string; items: NavItem[] }

const leaf = (label: string, page: string, query?: string, extra: Partial<NavItem> = {}): NavItem =>
  ({ label, page, query, icon: "review", ...extra });

const SECTIONS: NavSection[] = [
  { label: "", items: [
    { label: "Dashboard", page: "dashboard", icon: "today" },
    { label: "Sales", page: "documents", icon: "invoice", children: [
      leaf("Invoices", "documents", "tab=sales-invoices"),
      leaf("Credit Notes", "documents", "tab=sales-credit-notes"),
      leaf("Debit Notes", "documents", "tab=sales-debit-notes"),
    ] },
    { label: "Purchases", page: "documents", icon: "bill", children: [
      leaf("Bills", "documents", "tab=purchase-bills"),
      leaf("Supplier Credit Notes", "documents", "tab=supplier-credit-notes"),
      leaf("Supplier Debit Notes", "documents", "tab=supplier-debit-notes"),
    ] },
    { label: "Receipts", page: "documents", query: "tab=receipts", icon: "receipt" },
    { label: "Documents", page: "documents", icon: "review", children: [
      leaf("All Documents", "documents"),
      leaf("Upload", "upload"),
    ] },
    { label: "Review & Exceptions", page: "exceptions", icon: "fix", children: [
      leaf("Exceptions", "exceptions", undefined, { count: "exceptions" }),
      leaf("Documents to check", "documents", "lane=to-review"),
      leaf("Ready to approve", "documents", "lane=ready"),
      leaf("Needs fixing", "documents", "lane=needs-fixing"),
      leaf("Approvals", "approvals", undefined, { count: "approvals", adminOnly: true }),
    ] },
    { label: "Standardised Records", page: "records", icon: "records" },
    { label: "Bank", page: "money-in", icon: "bank", children: [
      leaf("Money In", "money-in"),
      leaf("Money Out", "money-out"),
      leaf("Accounts", "bank-accounts"),
      leaf("Reconciliation", "reconciliation"),
    ] },
    { label: "Contacts", page: "contacts", icon: "contacts" },
    { label: "Reports", page: "reports", icon: "reports", children: [
      leaf("All Reports", "reports"),
      leaf("Performance Evaluation", "evaluation"),
    ] },
    { label: "Accounting", page: "ledger", icon: "accounts", children: [
      leaf("Monthly Ledger", "ledger", "section=monthly"),
      leaf("Journal Entries", "ledger", "section=journals"),
      leaf("Chart of Accounts", "ledger", "section=accounts"),
      leaf("Trial Balance", "ledger", "section=trial"),
    ] },
    { label: "Control Panel", page: "settings", icon: "settings", children: [
      leaf("Settings", "settings"),
      leaf("Users", "users", undefined, { adminOnly: true }),
      leaf("Check rules", "validation-rules", undefined, { adminOnly: true }),
      leaf("Audit trail", "audit", undefined, { adminOnly: true }),
      leaf("System", "system", undefined, { adminOnly: true }),
    ] },
  ] },
];

const forRole = (role: NavRole) => (item: NavItem) => role === "LOCAL_ADMIN" || !item.adminOnly;

/** The menu for one role. Admin-only entries (approvals, users, rules, audit, System) are left out for accountants. */
export function jobNavigation(role: NavRole): NavSection[] {
  const keep = forRole(role);
  return SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter(keep)
        .map((item) => (item.children ? { ...item, children: item.children.filter(keep) } : item))
        .filter((item) => !item.children || item.children.length > 0),
    }))
    .filter((section) => section.items.length > 0);
}

/** Every entry that opens a page: plain items and sub-items (groups themselves are not links). */
export const navLeaves = (sections: NavSection[]) =>
  sections.flatMap((section) => section.items.flatMap((item) => item.children ?? [item]));

export const navHref = (prefix: string, item: NavItem) => `/${prefix}/${item.page}${item.query ? `?${item.query}` : ""}`;

/**
 * The entry for the current page. An entry with a query wins when the URL carries that query;
 * otherwise the plain entry for the page ("All Documents" for /documents and /documents/<id>);
 * otherwise the first entry for the page (/ledger highlights Monthly Ledger).
 */
export function activeNavItem(sections: NavSection[], page: string, search: URLSearchParams | string = ""): NavItem | undefined {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  // /today (B3's URL, still linked from older pages) redirects to the Dashboard; while it does, it highlights Dashboard.
  const items = navLeaves(sections).filter((item) => item.page === page || (page === "today" && item.page === "dashboard"));
  const matches = (item: NavItem) => [...new URLSearchParams(item.query ?? "")].every(([key, value]) => params.get(key) === value);
  return items.find((item) => item.query && matches(item)) ?? items.find((item) => !item.query) ?? items[0];
}

/** The group that holds an entry (for opening it and for the breadcrumb). */
export const navParent = (sections: NavSection[], item: NavItem | undefined) =>
  item ? sections.flatMap((section) => section.items).find((parent) => parent.children?.includes(item)) : undefined;

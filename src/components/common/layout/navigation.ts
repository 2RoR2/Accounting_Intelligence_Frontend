/** Plan M menu shared by accountants and local admins. */
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
  count?: "exceptions";
  /** Sub-items: the entry becomes an expandable group (it has no page of its own). */
  children?: NavItem[];
}
export interface NavSection { label: string; items: NavItem[] }

const leaf = (label: string, page: string, query?: string, extra: Partial<NavItem> = {}): NavItem =>
  ({ label, page, query, icon: "review", ...extra });

const SECTIONS: NavSection[] = [
  { label: "", items: [
    { label: "Dashboard", page: "dashboard", icon: "today" },
    // Plan M3: what KNT receives is captured here; what it issues is typed under Sales.
    { label: "Inbox", page: "upload", icon: "upload", children: [
      leaf("Upload & capture", "upload"),
      leaf("All documents", "documents"),
      leaf("To review", "documents", "lane=to-review"),
      leaf("Exceptions", "exceptions", undefined, { count: "exceptions" }),
    ] },
    { label: "Sales", page: "sales", icon: "invoice", children: [
      leaf("Quotations", "sales", "type=quotation"),
      leaf("Invoices", "sales", "type=invoice"),
      leaf("Credit notes", "sales", "type=credit-note"),
      leaf("Debit notes", "sales", "type=debit-note"),
      leaf("Payments received", "sales", "type=payment"),
    ] },
    { label: "Purchases", page: "purchases", icon: "bill", children: [
      leaf("Bills", "purchases", "type=bill"),
      leaf("Expense receipts", "documents", "tab=receipts"),
      leaf("Supplier credit notes", "purchases", "type=purchase-credit-note"),
      leaf("Supplier debit notes", "purchases", "type=purchase-debit-note"),
      leaf("Payments made", "purchases", "type=purchase-payment"),
    ] },
    { label: "Bank", page: "bank-accounts", icon: "bank", children: [
      leaf("Bank accounts", "bank-accounts"),
      leaf("Money in", "money-in"),
      leaf("Money out", "money-out"),
      leaf("Transfers", "bank-entries", "type=bank-transfer"),
      leaf("Reconciliation", "reconciliation"),
    ] },
    { label: "Contacts", page: "contacts", icon: "contacts" },
    { label: "Accounting", page: "ledger", icon: "accounts", children: [
      leaf("Chart of accounts", "ledger", "section=accounts"),
      leaf("Journals", "ledger", "section=journals"),
      leaf("General ledger", "ledger", "section=general"),
      leaf("Periods & month-end", "ledger", "section=periods"),
    ] },
    { label: "Reports", page: "reports", icon: "reports", children: [
      leaf("Business summary", "reports", "view=business-summary"),
      leaf("Financial reports", "reports"),
      leaf("Month pack", "reports", "view=month-pack"),
      leaf("Performance evaluation", "evaluation"),
    ] },
    { label: "Settings", page: "settings", icon: "settings" },
  ] },
];

/** The local admin's own jobs, one click away (24 Nov demo bug b: approvals were reachable only through a tab). */
const ADMIN_SECTION: NavSection = { label: "Admin", items: [
  { label: "Approvals", page: "approvals", icon: "approve" },
  { label: "Approved records", page: "records", icon: "records" },
  { label: "Users & roles", page: "users", icon: "users" },
  { label: "Check rules", page: "validation-rules", icon: "rules" },
  { label: "Audit trail", page: "audit", icon: "audit" },
] };

export function jobNavigation(role?: string): NavSection[] {
  return role === "LOCAL_ADMIN" ? [...SECTIONS, ADMIN_SECTION] : SECTIONS;
}

/** Every entry that opens a page: plain items and sub-items (groups themselves are not links). */
export const navLeaves = (sections: NavSection[]) =>
  sections.flatMap((section) => section.items.flatMap((item) => item.children ?? [item]));

export const navHref = (prefix: string, item: NavItem) => `/${prefix}/${item.page}${item.query ? `?${item.query}` : ""}`;

/** Match the selected view, including older URLs for the review and ledger pages. */
export function activeNavItem(sections: NavSection[], page: string, search: URLSearchParams | string = ""): NavItem | undefined {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const leaves = navLeaves(sections);
  const items = leaves.filter((item) => item.page === page || (page === "today" && item.page === "dashboard"));
  const matches = (item: NavItem) => [...new URLSearchParams(item.query ?? "")].every(([key, value]) => params.get(key) === value);
  if (page === "documents") {
    // One page, several lists: the review lanes belong to To review (Needs fixing is Exceptions), every type tab to All documents.
    const lane = params.get("lane");
    if (lane === "needs-fixing") return leaves.find((item) => item.page === "exceptions");
    if (lane) return leaves.find((item) => item.query === "lane=to-review");
    return items.find((item) => item.query && matches(item)) ?? items.find((item) => !item.query);
  }
  const exact = items.find((item) => item.query && matches(item)) ?? items.find((item) => !item.query);
  if (exact) return exact;
  if (page === "ledger") return items.find((item) => item.query === "section=general");
  if (page === "sales") return items.find((item) => item.query === "type=invoice");
  if (page === "approvals") return leaves.find((item) => item.query === "lane=to-review");
  return items[0];
}

/** The group that holds an entry (for opening it and for the breadcrumb). */
export const navParent = (sections: NavSection[], item: NavItem | undefined) =>
  item ? sections.flatMap((section) => section.items).find((parent) => parent.children?.includes(item)) : undefined;

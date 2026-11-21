import test from "node:test";
import assert from "node:assert/strict";
import { activeNavItem, jobNavigation, navHref, navLeaves, navParent } from "../src/components/common/layout/navigation";
import { isAllowedWorkspaceRoute } from "../src/lib/constants/routes";
import { roleHome } from "../src/lib/permissions";

const labels = (role: "ACCOUNTANT" | "LOCAL_ADMIN") => jobNavigation(role).flatMap((section) => section.items.map((item) => item.label));
const children = (role: "ACCOUNTANT" | "LOCAL_ADMIN", group: string) =>
  jobNavigation(role).flatMap((section) => section.items).find((item) => item.label === group)?.children?.map((item) => item.label);

test("the menu follows the team's latest_update layout", () => {
  for (const role of ["ACCOUNTANT", "LOCAL_ADMIN"] as const) {
    assert.deepEqual(labels(role), ["Dashboard", "Sales", "Purchases", "Receipts", "Documents", "Review & Exceptions",
      "Standardised Records", "Bank", "Contacts", "Reports", "Accounting", "Control Panel"]);
    // Plan L4/L5: typed and approved scanned documents in one list per type; debit notes stay scanned-only.
    assert.deepEqual(children(role, "Sales"), ["Quotations", "Invoices", "Credit Notes", "Debit Notes", "Customer Payments", "Customer Refunds"]);
    assert.deepEqual(children(role, "Purchases"), ["Bills", "Supplier Credit Notes", "Supplier Debit Notes", "Supplier Payments", "Supplier Refunds"]);
    // Transfers between own bank accounts now post through the document module (Plan L6).
    assert.deepEqual(children(role, "Bank"), ["Money In", "Money Out", "Transfers", "Accounts", "Reconciliation"]);
    assert.deepEqual(children(role, "Reports"), ["All Reports", "Performance Evaluation"]);
    assert.deepEqual(children(role, "Accounting"), ["Monthly Ledger", "Journal Entries", "Chart of Accounts", "Trial Balance"]);
  }
  assert.deepEqual(children("ACCOUNTANT", "Control Panel"), ["Settings", "Catalog", "Products & Services"]);
  assert.ok(children("LOCAL_ADMIN", "Control Panel")?.includes("Posting accounts"));
});

test("every menu entry opens a page that role may open", () => {
  for (const [role, area] of [["ACCOUNTANT", "workspace"], ["LOCAL_ADMIN", "company"]] as const) {
    for (const item of navLeaves(jobNavigation(role))) {
      assert.ok(isAllowedWorkspaceRoute([area, item.page], role), `${role} cannot open ${item.page}`);
    }
  }
});

test("System and the other admin pages are for local admins only", () => {
  const pages = (role: "ACCOUNTANT" | "LOCAL_ADMIN") => navLeaves(jobNavigation(role)).map((item) => item.page);
  for (const page of ["system", "approvals", "users", "validation-rules", "audit"]) {
    assert.ok(pages("LOCAL_ADMIN").includes(page));
    assert.ok(!pages("ACCOUNTANT").includes(page), `accountant sees ${page}`);
  }
  assert.ok(!isAllowedWorkspaceRoute(["workspace", "system"], "ACCOUNTANT"));
});

test("the Dashboard is home again; B3's /today URL stays valid while it redirects there", () => {
  assert.equal(roleHome("ACCOUNTANT"), "/workspace/dashboard");
  assert.equal(roleHome("LOCAL_ADMIN"), "/company/dashboard");
  assert.ok(isAllowedWorkspaceRoute(["company", "today"], "LOCAL_ADMIN"));
  assert.ok(isAllowedWorkspaceRoute(["workspace", "today"], "ACCOUNTANT"));
  assert.ok(isAllowedWorkspaceRoute(["company", "performance"], "LOCAL_ADMIN"));
});

test("the highlighted entry follows the page", () => {
  const menu = jobNavigation("LOCAL_ADMIN");
  assert.equal(activeNavItem(menu, "documents")?.label, "All Documents");
  assert.equal(activeNavItem(menu, "documents", "lane=needs-fixing")?.label, "Needs fixing");
  assert.equal(activeNavItem(menu, "documents", "lane=waiting-approval")?.label, "All Documents");
  assert.equal(activeNavItem(menu, "purchases", "type=purchase-credit-note")?.label, "Supplier Credit Notes");
  assert.equal(activeNavItem(menu, "documents", "tab=supplier-debit-notes")?.label, "Supplier Debit Notes");
  assert.equal(navParent(menu, activeNavItem(menu, "sales", "type=invoice"))?.label, "Sales");
  assert.equal(activeNavItem(menu, "records", "category=ACCOUNTS_RECEIVABLE")?.label, "Standardised Records");
  assert.equal(activeNavItem(menu, "reports")?.label, "All Reports");
  assert.equal(activeNavItem(menu, "ledger")?.label, "Monthly Ledger");
  assert.equal(activeNavItem(menu, "ledger", "section=trial")?.label, "Trial Balance");
  assert.equal(activeNavItem(menu, "today")?.label, "Dashboard");
  assert.equal(activeNavItem(menu, "dashboard")?.label, "Dashboard");
  const receipts = navLeaves(menu).find((item) => item.label === "Receipts");
  assert.equal(receipts && navHref("company", receipts), "/company/documents?tab=receipts");
});

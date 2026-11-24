import test from "node:test";
import assert from "node:assert/strict";
import { activeNavItem, jobNavigation, navHref, navLeaves, navParent } from "../src/components/common/layout/navigation";
import { isAllowedWorkspaceRoute } from "../src/lib/constants/routes";
import { roleHome } from "../src/lib/permissions";

const menu = jobNavigation();
const topLevel = menu.flatMap((section) => section.items);
const children = (group: string) => topLevel.find((item) => item.label === group)?.children?.map((item) => item.label);

test("the menu follows Plan M3", () => {
  assert.deepEqual(topLevel.map(({ label }) => label), ["Dashboard", "Inbox", "Sales", "Purchases", "Bank", "Contacts", "Accounting", "Reports", "Settings"]);
  assert.deepEqual(children("Inbox"), ["Upload & capture", "All documents", "To review", "Exceptions", "Approved records"]);
  assert.deepEqual(children("Sales"), ["Quotations", "Sales orders", "Delivery orders", "Invoices", "Credit notes", "Debit notes",
    "Payments received"]);
  assert.deepEqual(children("Purchases"), ["Bills", "Expense receipts", "Supplier credit notes", "Supplier debit notes", "Payments made"]);
  assert.deepEqual(children("Bank"), ["Bank accounts", "Money in", "Money out", "Transfers", "Reconciliation"]);
  assert.deepEqual(children("Accounting"), ["Chart of accounts", "Journals", "General ledger", "Periods & month-end"]);
  assert.deepEqual(children("Reports"), ["Business summary", "Financial reports", "Monthly Accounting Pack", "Performance evaluation"]);
  assert.equal(children("Settings"), undefined);
  assert.equal(navLeaves(menu).filter((item) => item.page === "exceptions").length, 1);
});

test("every menu entry opens a page that role may open", () => {
  for (const [role, area] of [["ACCOUNTANT", "workspace"], ["LOCAL_ADMIN", "company"]] as const) {
    for (const item of navLeaves(menu)) {
      assert.ok(isAllowedWorkspaceRoute([area, item.page], role), `${role} cannot open ${item.page}`);
    }
  }
});

test("System and the other admin pages are for local admins only", () => {
  for (const page of ["system", "approvals", "users", "validation-rules", "audit"]) {
    assert.ok(isAllowedWorkspaceRoute(["company", page], "LOCAL_ADMIN"));
    assert.ok(!isAllowedWorkspaceRoute(["workspace", page], "ACCOUNTANT"));
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

test("no two menu entries open the same page and query", () => {
  const targets = navLeaves(menu).map((item) => navHref("company", item));
  assert.deepEqual(targets, [...new Set(targets)]);
  const labels = navLeaves(menu).map((item) => item.label);
  assert.deepEqual(labels, [...new Set(labels)]);
});

test("the documents page highlights the entry of the list it shows", () => {
  // The bug: the plain list used to light up To review.
  assert.equal(activeNavItem(menu, "documents", "")?.label, "All documents");
  assert.equal(activeNavItem(menu, "documents", "tab=purchase-bills")?.label, "All documents");
  assert.equal(activeNavItem(menu, "documents", "tab=supplier-credit-notes")?.label, "All documents");
  assert.equal(activeNavItem(menu, "documents", "tab=sales-debit-notes")?.label, "All documents");
  assert.equal(activeNavItem(menu, "documents", "tab=nonsense")?.label, "All documents");
  for (const lane of ["to-review", "ready", "waiting-approval"]) {
    assert.equal(activeNavItem(menu, "documents", `lane=${lane}`)?.label, "To review", lane);
  }
  assert.equal(activeNavItem(menu, "documents", "lane=needs-fixing")?.label, "Exceptions");
  assert.equal(activeNavItem(menu, "approvals")?.label, "To review");
  assert.equal(navParent(menu, activeNavItem(menu, "documents", ""))?.label, "Inbox");
  const all = navLeaves(menu).find((item) => item.label === "All documents");
  assert.equal(all && navHref("workspace", all), "/workspace/documents");
});

test("the highlighted entry follows the page", () => {
  assert.equal(activeNavItem(menu, "documents", "lane=to-review")?.label, "To review");
  assert.equal(activeNavItem(menu, "documents", "lane=ready")?.label, "To review");
  assert.equal(activeNavItem(menu, "sales", "type=debit-note")?.label, "Debit notes");
  assert.equal(activeNavItem(menu, "ledger", "section=general")?.label, "General ledger");
  assert.equal(activeNavItem(menu, "purchases", "type=purchase-credit-note")?.label, "Supplier credit notes");
  assert.equal(activeNavItem(menu, "purchases", "type=purchase-debit-note")?.label, "Supplier debit notes");
  assert.equal(activeNavItem(menu, "documents", "tab=receipts")?.label, "Expense receipts");
  assert.equal(activeNavItem(menu, "sales", "type=payment")?.label, "Payments received");
  assert.equal(navParent(menu, activeNavItem(menu, "sales", "type=invoice"))?.label, "Sales");
  assert.equal(activeNavItem(menu, "reports")?.label, "Financial reports");
  assert.equal(activeNavItem(menu, "reports", "view=month-pack")?.label, "Monthly Accounting Pack");
  assert.equal(activeNavItem(menu, "reports", "view=business-summary")?.label, "Business summary");
  assert.equal(activeNavItem(menu, "evaluation")?.label, "Performance evaluation");
  assert.equal(activeNavItem(menu, "ledger", "section=journals")?.label, "Journals");
  assert.equal(activeNavItem(menu, "ledger", "section=periods")?.label, "Periods & month-end");
  assert.equal(activeNavItem(menu, "today")?.label, "Dashboard");
  assert.equal(activeNavItem(menu, "dashboard")?.label, "Dashboard");
  const receipts = navLeaves(menu).find((item) => item.label === "Expense receipts");
  assert.equal(receipts && navHref("company", receipts), "/company/documents?tab=receipts");
});

test("the local admin's menu has an Admin group with the approval queue (24 Nov demo: approve could not be found)", () => {
  const admin = jobNavigation("LOCAL_ADMIN");
  const top = admin[0].items.map(({ label }) => label);
  assert.deepEqual(top, ["Dashboard", "Inbox", "Sales", "Purchases", "Bank", "Contacts", "Accounting", "Reports", "Admin", "Settings"]);
  const group = admin[0].items.find(({ label }) => label === "Admin");
  assert.deepEqual(group?.children?.map(({ label }) => label), ["Approval queue", "Users & roles", "Check rules", "Audit trail", "System"]);
  for (const item of group?.children ?? []) assert.ok(isAllowedWorkspaceRoute(["company", item.page], "LOCAL_ADMIN"), item.page);
  assert.equal(activeNavItem(admin, "approvals", "")?.label, "Approval queue");
  assert.equal(jobNavigation("ACCOUNTANT"), jobNavigation());
  assert.ok(!jobNavigation("ACCOUNTANT")[0].items.some(({ label }) => label === "Admin"));
});

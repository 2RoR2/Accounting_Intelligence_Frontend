import test from "node:test";
import assert from "node:assert/strict";
import { activeNavItem, jobNavigation, navHref } from "../src/components/common/layout/navigation";
import { isAllowedWorkspaceRoute } from "../src/lib/constants/routes";

const JOBS = ["Today", "Inbox", "Purchases", "Sales", "Bank", "Contacts", "Accounts", "Reports", "Settings"];

test("accountants and local admins share the menu by accounting job, in the plan's order", () => {
  assert.deepEqual(jobNavigation("ACCOUNTANT").map((section) => section.label), JOBS);
  assert.deepEqual(jobNavigation("LOCAL_ADMIN").map((section) => section.label), JOBS);
});

test("every menu entry opens a page that role may open", () => {
  for (const [role, area] of [["ACCOUNTANT", "workspace"], ["LOCAL_ADMIN", "company"]] as const) {
    for (const item of jobNavigation(role).flatMap((section) => section.items)) {
      assert.ok(isAllowedWorkspaceRoute([area, item.page], role), `${role} cannot open ${item.page}`);
    }
  }
});

test("System and the other admin pages are for local admins only", () => {
  const pages = (role: "ACCOUNTANT" | "LOCAL_ADMIN") => jobNavigation(role).flatMap((section) => section.items.map((item) => item.page));
  for (const page of ["system", "approvals", "users", "validation-rules", "audit"]) {
    assert.ok(pages("LOCAL_ADMIN").includes(page));
    assert.ok(!pages("ACCOUNTANT").includes(page), `accountant sees ${page}`);
  }
  assert.ok(!isAllowedWorkspaceRoute(["workspace", "system"], "ACCOUNTANT"));
});

test("old home URLs stay valid while they redirect to Today", () => {
  assert.ok(isAllowedWorkspaceRoute(["company", "dashboard"], "LOCAL_ADMIN"));
  assert.ok(isAllowedWorkspaceRoute(["workspace", "dashboard"], "ACCOUNTANT"));
  assert.ok(isAllowedWorkspaceRoute(["company", "performance"], "LOCAL_ADMIN"));
});

test("the highlighted entry follows the page and its filter", () => {
  const menu = jobNavigation("LOCAL_ADMIN");
  assert.equal(activeNavItem(menu, "documents")?.label, "To review");
  assert.equal(activeNavItem(menu, "documents", "tab=purchase-bills")?.label, "Supplier bills");
  assert.equal(activeNavItem(menu, "documents", "tab=credit-notes")?.label, "To review");
  assert.equal(activeNavItem(menu, "records", "category=ACCOUNTS_RECEIVABLE")?.label, "Approved sales");
  assert.equal(activeNavItem(menu, "dashboard")?.label, "Today");
  assert.equal(navHref("company", menu[2].items[0]), "/company/documents?tab=purchase-bills");
});

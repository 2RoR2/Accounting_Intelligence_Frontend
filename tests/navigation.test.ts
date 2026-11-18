import test from "node:test";
import assert from "node:assert/strict";
import { activeNavItem, jobNavigation, navHref } from "../src/components/common/layout/navigation";
import { isAllowedWorkspaceRoute } from "../src/lib/constants/routes";
import { roleHome } from "../src/lib/permissions";

const GROUPS = ["Overview", "Daily work", "Banking", "Month-end", "Workspace"];
const labels = (role: "ACCOUNTANT" | "LOCAL_ADMIN") => jobNavigation(role).flatMap((section) => section.items.map((item) => item.label));

test("the menu uses the team's page names, grouped by daily work, banking and month-end", () => {
  assert.deepEqual(jobNavigation("ACCOUNTANT").map((section) => section.label), GROUPS);
  assert.deepEqual(jobNavigation("LOCAL_ADMIN").map((section) => section.label), GROUPS);
  assert.deepEqual(labels("ACCOUNTANT"), ["Dashboard", "Upload", "Documents", "Exceptions", "Money In", "Money Out",
    "Reconciliation", "Standardised Records", "Ledger", "Summary", "Contacts", "Settings"]);
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

test("the Dashboard is home again; B3's /today URL stays valid while it redirects there", () => {
  assert.equal(roleHome("ACCOUNTANT"), "/workspace/dashboard");
  assert.equal(roleHome("LOCAL_ADMIN"), "/company/dashboard");
  assert.ok(isAllowedWorkspaceRoute(["company", "today"], "LOCAL_ADMIN"));
  assert.ok(isAllowedWorkspaceRoute(["workspace", "today"], "ACCOUNTANT"));
  assert.ok(isAllowedWorkspaceRoute(["company", "performance"], "LOCAL_ADMIN"));
});

test("the highlighted entry follows the page", () => {
  const menu = jobNavigation("LOCAL_ADMIN");
  assert.equal(activeNavItem(menu, "documents")?.label, "Documents");
  assert.equal(activeNavItem(menu, "documents", "lane=needs-fixing")?.label, "Documents");
  assert.equal(activeNavItem(menu, "records", "category=ACCOUNTS_RECEIVABLE")?.label, "Standardised Records");
  assert.equal(activeNavItem(menu, "reports")?.label, "Summary");
  assert.equal(activeNavItem(menu, "today")?.label, "Dashboard");
  assert.equal(activeNavItem(menu, "dashboard")?.label, "Dashboard");
  assert.equal(navHref("company", menu[1].items[1]), "/company/documents");
});

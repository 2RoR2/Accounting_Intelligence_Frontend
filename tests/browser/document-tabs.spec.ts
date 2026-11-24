/**
 * All documents and To review tab bars, end to end on a LOCAL stack (never a hosted one).
 *
 *   DT_BASE_URL=http://127.0.0.1:3081 DT_ACCOUNTANT=<cookie json> DT_ADMIN=<cookie json> \
 *     npx playwright test -c tests/browser/document-tabs.config.ts
 *
 * Cookie files come from `manage.py browser-session --email accountant@knt.demo.test --out <file>` (and admin@).
 * Skipped when the cookie files are not given.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const BASE_URL = process.env.DT_BASE_URL ?? "http://127.0.0.1:3081";
const ACCOUNTANT = process.env.DT_ACCOUNTANT;
const ADMIN = process.env.DT_ADMIN;
const IGNORABLE = [/Download the React DevTools/i, /favicon\.ico/i, /\[Fast Refresh\]/i, /\[HMR\]/i];

test.skip(!ACCOUNTANT || !ADMIN, "Set DT_ACCOUNTANT and DT_ADMIN to cookie files from manage.py browser-session.");

async function signedIn(browser: Browser, file: string, colorScheme: "light" | "dark" = "light") {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: BASE_URL, colorScheme });
  const host = new URL(BASE_URL).hostname;
  const cookies = (JSON.parse(readFileSync(file, "utf8")) as { name: string; value: string; path?: string }[])
    .map(({ name, value, path }) => ({ name, value, domain: host, path: path ?? "/" }));
  await context.addCookies(cookies);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
  });
  page.on("console", (message) => {
    const text = `${message.text()} @ ${message.location().url}`;
    if (message.type() === "error" && !IGNORABLE.some((pattern) => pattern.test(text))) problems.push(`console: ${text}`);
  });
  return { context, page, problems };
}

const sidebarActive = (page: Page) => page.locator("#workspace-navigation a[aria-current='page']");
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const resultsText = (page: Page) => page.locator(".pagination > span").first();

const TYPE_TABS: Array<[label: string, key: string]> = [
  ["All", "all"], ["Bills", "purchase-bills"], ["Expense receipts", "receipts"],
  ["Supplier credit notes", "supplier-credit-notes"], ["Supplier debit notes", "supplier-debit-notes"],
  ["Sales invoices", "sales-invoices"], ["Sales credit notes", "sales-credit-notes"], ["Sales debit notes", "sales-debit-notes"],
];

for (const [role, area, file] of [["accountant", "workspace", ACCOUNTANT], ["admin", "company", ADMIN]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${role} (${scheme}): every All documents tab filters the list, has its own URL and works with Back`, async ({ browser }, testInfo) => {
      const { context, page, problems } = await signedIn(browser, file!, scheme);
      await page.goto(`/${area}/exceptions`);
      // Sidebar entry: Inbox > All documents lands on the plain list with the All tab open.
      await page.locator("#workspace-navigation").getByRole("link", { name: "All documents", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${area}/documents$`));
      await expect(heading(page)).toHaveText("All documents");
      await expect(sidebarActive(page)).toHaveText("All documents");
      const bar = page.getByRole("navigation", { name: "Document types" });
      await expect(bar).toBeVisible();
      const total = Number((await bar.getByRole("link", { name: /^All/ }).innerText()).replace(/\D/g, ""));
      await expect(resultsText(page)).toContainText(`of ${total} results`);

      const visited: string[] = [];
      let sum = 0;
      for (const [label, key] of TYPE_TABS) {
        const tab = bar.getByRole("link", { name: new RegExp(`^${label}\\s*\\d+$`) });
        await expect(tab).toHaveCount(1);
        const count = Number((await tab.innerText()).replace(/\D/g, ""));
        if (key !== "all") sum += count;
        await tab.click();
        await expect(page).toHaveURL(key === "all" ? new RegExp(`/${area}/documents$`) : new RegExp(`/${area}/documents\\?tab=${key}$`));
        await expect(tab).toHaveAttribute("aria-current", "page");
        await expect(bar.locator("a[aria-current='page']")).toHaveCount(1);
        await expect(resultsText(page)).toContainText(`of ${count} results`);
        await expect(heading(page)).toHaveText(key === "all" ? "All documents" : label);
        // One active sidebar entry: Expense receipts is its own menu link to this same URL, every other tab stays under All documents.
        await expect(sidebarActive(page)).toHaveCount(1);
        await expect(sidebarActive(page)).toHaveText(key === "receipts" ? "Expense receipts" : "All documents");
        visited.push(key);
      }
      // Counts of the typed tabs add up to All unless an "Other" tab holds the rest.
      const other = bar.getByRole("link", { name: /^Other\s*\d+$/ });
      const otherCount = (await other.count()) ? Number((await other.innerText()).replace(/\D/g, "")) : 0;
      expect(sum + otherCount).toBe(total);
      await page.screenshot({ path: testInfo.outputPath(`all-documents-${role}-${scheme}.png`) });

      // Back walks the tabs in reverse; a tab opens straight from its link.
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`tab=${visited.at(-2)}$`));
      await expect(bar.locator("a[aria-current='page']")).toContainText("Sales credit notes");
      await page.goBack();
      await expect(bar.locator("a[aria-current='page']")).toContainText("Sales invoices");
      await page.goto(`/${area}/documents?tab=supplier-debit-notes`);
      await expect(bar.locator("a[aria-current='page']")).toContainText("Supplier debit notes");
      await page.goto(`/${area}/documents?tab=nonsense`);
      await expect(bar.locator("a[aria-current='page']")).toContainText("All");
      await context.close();
      expect(problems).toEqual([]);
    });

    test(`${role} (${scheme}): To review tabs and the sidebar land on the right lane`, async ({ browser }, testInfo) => {
      const { context, page, problems } = await signedIn(browser, file!, scheme);
      await page.goto(`/${area}/exceptions`);
      const nav = page.locator("#workspace-navigation");
      await nav.getByRole("link", { name: "To review", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${area}/documents\\?lane=to-review$`));
      await expect(heading(page)).toHaveText("To review");
      await expect(sidebarActive(page)).toHaveText("To review");
      const bar = page.getByRole("navigation", { name: "Review lanes" });
      const third = role === "admin" ? "Approval queue" : "Sent for approval";
      // An accountant submits what is ready; an admin approves it.
      const ready = role === "admin" ? "Ready to approve" : "Ready to submit";
      await expect(bar.getByRole("link")).toHaveText(["To review", ready, third]);
      await expect(bar.locator("a[aria-current='page']")).toHaveText("To review");
      await page.screenshot({ path: testInfo.outputPath(`to-review-${role}-${scheme}.png`) });

      await bar.getByRole("link", { name: ready }).click();
      await expect(page).toHaveURL(new RegExp(`/${area}/documents\\?lane=ready$`));
      await expect(heading(page)).toHaveText(ready);
      await expect(bar.locator("a[aria-current='page']")).toHaveText(ready);
      await expect(sidebarActive(page)).toHaveText("To review");

      await bar.getByRole("link", { name: third }).click();
      if (role === "admin") {
        await expect(page).toHaveURL(new RegExp(`/${area}/approvals$`));
        await expect(heading(page)).toHaveText("Approval queue");
        await expect(page.getByRole("navigation", { name: "Review lanes" }).locator("a[aria-current='page']")).toHaveText("Approval queue");
      } else {
        await expect(page).toHaveURL(new RegExp(`/${area}/documents\\?lane=waiting-approval$`));
        await expect(heading(page)).toHaveText("Sent for approval");
        await expect(bar.locator("a[aria-current='page']")).toHaveText("Sent for approval");
      }
      await expect(sidebarActive(page)).toHaveText("To review");
      await page.screenshot({ path: testInfo.outputPath(`third-lane-${role}-${scheme}.png`) });

      // Back returns to the previous lane; Exceptions has its own sidebar entry and does not light up To review.
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`lane=ready$`));
      await expect(bar.locator("a[aria-current='page']")).toHaveText(ready);
      await nav.getByRole("link", { name: "Exceptions" }).click();
      await expect(page).toHaveURL(new RegExp(`/${area}/exceptions$`));
      await expect(sidebarActive(page)).toHaveText(/^Exceptions/);
      await page.goto(`/${area}/documents?lane=needs-fixing`);
      await expect(page.getByRole("navigation", { name: "Review lanes" }).locator("a[aria-current='page']")).toHaveText("Needs fixing");
      await expect(sidebarActive(page)).toHaveText(/^Exceptions/);
      await context.close();
      expect(problems).toEqual([]);
    });
  }
}

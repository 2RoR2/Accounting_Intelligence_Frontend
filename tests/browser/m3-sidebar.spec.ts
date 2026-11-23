import { test, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { latestBenchmarkPath } from "../../src/lib/api/benchmark.service";

// Plan M3/B3/B4: click every sidebar item as accountant and local admin (cookie files from
// `manage.py browser-session`, set in M3_ACCOUNTANT_COOKIES / M3_ADMIN_COOKIES). No dead links,
// no console errors, no blank page, and the menu keeps its scroll position.
const LINKS = "aside#workspace-navigation a.nav-item, aside#workspace-navigation a.nav-subitem";
const IGNORABLE = [/Download the React DevTools/i, /favicon\.ico/i];
const EXPECTED_MENU = ["Dashboard", "Inbox", "Sales", "Purchases", "Bank", "Contacts", "Accounting", "Reports", "Settings"];
const missingBenchmark = (url: string, status: number) => status === 404 && url.endsWith(latestBenchmarkPath);

type Cookie = { name: string; value: string; path?: string };
const cookies = (file: string, base: string) => {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const list: Cookie[] = Array.isArray(raw) ? raw : raw.cookies;
  return list.map((c) => ({ name: c.name, value: c.value, domain: new URL(base).hostname, path: c.path ?? "/" }));
};

function watch(page: Page) {
  const problems: string[] = [];
  let where = "(start)";
  page.on("pageerror", (e) => problems.push(`[${where}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    const text = `${m.text()} ${m.location().url}`;
    if (m.text().includes("404") && missingBenchmark(m.location().url, 404)) return;
    if (m.type() === "error" && !IGNORABLE.some((re) => re.test(text))) problems.push(`[${where}] console.error: ${text}`);
  });
  page.on("response", (r) => { if (r.status() >= 400 && !missingBenchmark(r.url(), r.status())) problems.push(`[${where}] HTTP ${r.status()} ${r.url()}`); });
  return { problems, at: (label: string) => { where = label; } };
}

const navTop = (page: Page) => page.locator("aside#workspace-navigation nav").evaluate((el) => el.scrollTop);
const navSize = (page: Page) => page.locator("aside#workspace-navigation nav").evaluate((el) => `${el.scrollHeight}/${el.clientHeight}`);

async function open(browser: Browser, baseURL: string, file: string, area: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ baseURL, viewport });
  await context.addCookies(cookies(file, baseURL));
  const page = await context.newPage();
  const w = watch(page);
  await page.goto(`/${area}/dashboard`);
  return { context, page, w };
}

test.describe("Plan M3 sidebar", () => {
  for (const [role, area, env] of [["accountant", "workspace", "M3_ACCOUNTANT_COOKIES"], ["local admin", "company", "M3_ADMIN_COOKIES"]] as const) {
    test(`${role}: every item opens, no errors, scroll kept`, async ({ browser, baseURL }) => {
      const file = process.env[env];
      test.skip(!file, `${env} not set`);
      // A short window so the menu has to scroll.
      const { context, page, w } = await open(browser, baseURL!, file!, area, { width: 1440, height: 640 });
      await expect(page.locator("aside#workspace-navigation")).toBeVisible({ timeout: 60000 });
      const menu = await page.locator("aside#workspace-navigation .nav-item-row a.nav-item, aside#workspace-navigation nav > .nav-group > a.nav-item").allInnerTexts();
      expect(menu.map((t) => t.trim())).toEqual(EXPECTED_MENU);
      await expect(page.locator("#nav-sub-inbox a.nav-subitem")).toHaveCount(3);
      await page.locator("#workspace-navigation").getByRole("button", { name: "Help", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Help & support" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
      const hrefs = [...new Set((await page.locator(LINKS).evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))).filter((h) => h.startsWith(`/${area}/`)))];
      expect(hrefs.length).toBeGreaterThan(20);
      const blank: string[] = [];
      for (const href of hrefs) {
        w.at(href);
        const link = page.locator(`aside#workspace-navigation a[href="${href}"]`).first();
        // Scroll the menu to the entry the way a person would, then click it.
        await link.evaluate((el) => el.scrollIntoView({ block: "nearest" }));
        await page.waitForTimeout(150);
        const before = await navTop(page);
        const sizeBefore = await navSize(page);
        await link.click({ timeout: 60000 });
        await page.waitForURL((u) => `${u.pathname}${u.search}` === href, { timeout: 30000 });
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
        const main = page.locator("main").first();
        await expect(main).toBeVisible();
        await expect(page.getByText("This page could not be found")).toHaveCount(0);
        await expect(page.getByText("We couldn’t complete that request")).toHaveCount(0);
        await expect(main.locator(".error-state")).toHaveCount(0);
        if ((await main.innerText()).trim().length < 25) blank.push(href);
        // B3: the menu did not jump (a small move is the open entry being revealed), and the open entry is inside the visible menu.
        const after = await navTop(page);
        expect(Math.abs(after - before), `${href}: menu scroll moved ${before} -> ${after} (menu ${sizeBefore} -> ${await navSize(page)})`).toBeLessThanOrEqual(120);
        const inView = await page.locator("aside#workspace-navigation a[aria-current='page']").first().evaluate((el) => {
          const nav = el.closest("nav")!.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return box.top >= nav.top - 1 && box.bottom <= nav.bottom + 1;
        });
        expect(inView, `${href}: open entry is not visible in the menu`).toBe(true);
      }
      expect(blank, "pages with no content or empty state").toEqual([]);
      await context.close();
      expect(w.problems).toEqual([]);
    });
  }

  test("menu scrolls independently of the page", async ({ browser, baseURL }) => {
    const file = process.env.M3_ADMIN_COOKIES;
    test.skip(!file, "M3_ADMIN_COOKIES not set");
    const { context, page } = await open(browser, baseURL!, file!, "company", { width: 1440, height: 640 });
    await expect(page.locator("aside#workspace-navigation")).toBeVisible({ timeout: 60000 });
    await page.goto("/company/ledger");
    await page.locator("aside#workspace-navigation nav").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const pageBefore = await page.evaluate(() => window.scrollY);
    await page.locator("aside#workspace-navigation nav").hover();
    await page.mouse.wheel(0, 300);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageBefore);
    await context.close();
  });

  test("desktop and phone navigation", async ({ browser, baseURL }, testInfo) => {
    const file = process.env.M3_ADMIN_COOKIES;
    test.skip(!file, "M3_ADMIN_COOKIES not set");
    for (const [name, viewport, menuButton] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]] as const) {
      const { context, page, w } = await open(browser, baseURL!, file!, "company", viewport);
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
      if (menuButton) {
        const toggle = page.getByRole("button", { name: "Open navigation" });
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await page.locator("#workspace-navigation a.nav-subitem[href='/company/reports?view=month-pack']").click();
        await expect(page.getByRole("heading", { name: "Month pack", level: 1 })).toBeVisible();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
        await expect(page.locator("#workspace-navigation a[aria-current='page']")).toHaveText("Month pack");
      }
      await page.screenshot({ path: testInfo.outputPath(`sidebar-${name}.png`) });
      for (const [slug, href] of [["reports", "/company/reports"], ["performance", "/company/evaluation"], ["exceptions", "/company/exceptions"], ["to-review", "/company/documents?lane=to-review"]] as const) {
        w.at(href);
        await page.goto(href);
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
        await page.screenshot({ path: testInfo.outputPath(`${slug}-${name}.png`), fullPage: true });
      }
      await context.close();
      expect(w.problems).toEqual([]);
    }
  });
});

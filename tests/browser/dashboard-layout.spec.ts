/**
 * Dashboard: no count cards under the filters, and panels the user can reorder (drag, keyboard, Reset layout),
 * with the order kept per user across reloads. Run against a LOCAL stack (never a hosted one):
 *
 *   DASH_BASE_URL=http://127.0.0.1:3091 [DASH_COOKIES=<cookie json>] [DASH_SHOTS=<folder for screenshots>] \
 *     npx playwright test -c tests/browser/dashboard-layout.config.ts
 *
 * The cookie file comes from `manage.py browser-session --email accountant@knt.demo.test --out <file>`; leave it
 * out when the API needs no sign-in (a stand-in API). The dashboard is at /workspace/dashboard.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DEFAULT_ORDER } from "../../src/lib/dashboard-layout";

const BASE_URL = process.env.DASH_BASE_URL ?? "http://127.0.0.1:3091";
const COOKIES = process.env.DASH_COOKIES;
const SHOTS = process.env.DASH_SHOTS;
const IGNORABLE = [/Download the React DevTools/i, /favicon\.ico/i, /\[Fast Refresh\]/i, /\[HMR\]/i];

async function open(browser: Browser, options: { width?: number; height?: number; dark?: boolean; blockStorage?: boolean } = {}) {
  const context = await browser.newContext({ viewport: { width: options.width ?? 1440, height: options.height ?? 1000 }, baseURL: BASE_URL });
  if (COOKIES) {
    const host = new URL(BASE_URL).hostname;
    await context.addCookies((JSON.parse(readFileSync(COOKIES, "utf8")) as { name: string; value: string; path?: string }[])
      .map(({ name, value, path }) => ({ name, value, domain: host, path: path ?? "/" })));
  }
  if (options.dark) await context.addInitScript(() => { try { window.localStorage.setItem("accordai-theme", "dark"); } catch { /* optional */ } });
  if (options.blockStorage) {
    // Storage that refuses the layout key (the rest of the app keeps its own settings), as a full or locked-down browser would.
    await context.addInitScript(() => {
      for (const method of ["getItem", "setItem", "removeItem"] as const) {
        const original = Storage.prototype[method] as (this: Storage, ...args: string[]) => unknown;
        Storage.prototype[method] = function (this: Storage, key: string, ...rest: string[]) {
          if (String(key).startsWith("accordai-dashboard-layout")) throw new DOMException("blocked", "SecurityError");
          return original.call(this, key, ...rest);
        } as never;
      }
    });
  }
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => { if (response.status() >= 400) problems.push(`http ${response.status()} ${new URL(response.url()).pathname}`); });
  page.on("console", (message) => {
    const text = `${message.text()} @ ${message.location().url}`;
    if (message.type() === "error" && !IGNORABLE.some((pattern) => pattern.test(text))) problems.push(`console: ${text}`);
  });
  await page.goto("/workspace/dashboard");
  await expect(page.locator("[data-widget]").first()).toBeVisible({ timeout: 90000 });
  return { context, page, problems };
}

const order = (page: Page) => page.locator("[data-widget]").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.widget));
const grip = (page: Page, id: string) => page.locator(`[data-widget="${id}"] [data-control="grip"]`);
const userKey = async (page: Page) => (await page.evaluate(() => Object.keys(window.localStorage).find((key) => key.startsWith("accordai-dashboard-layout-v1:")) ?? null));
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  try { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, timeout: 60000 }); } catch { /* screenshots are for people, not a check */ }
};

test("the four count cards are gone and the counts stay in Attention needed", async ({ browser }) => {
  const { context, page, problems } = await open(browser);
  expect(await order(page)).toEqual(DEFAULT_ORDER);
  await expect(page.locator(".dashboard-daily-work-grid")).toHaveCount(0);
  const attention = page.locator('[data-widget="attention"]');
  await expect(attention.getByRole("heading", { name: "Attention needed" })).toBeVisible();
  await expect(attention.locator(".dash-attention-row").first().locator("b")).toHaveText(/^\d+$/);
  await expect(attention).toContainText(/documents to check/i);
  await shot(page, "light-default");
  expect(problems).toEqual([]);
  await context.close();
});

test("dragging a panel reorders it, the order survives a reload, and Reset layout restores the default", async ({ browser }) => {
  // A tall window so the handle and the drop target are both on screen: the test drives one straight drag.
  const { context, page, problems } = await open(browser, { height: 2700 });
  const income = page.locator('[data-widget="income"]');
  const box = (await income.boundingBox())!;
  await grip(page, "attention").dragTo(income, { targetPosition: { x: box.width - 12, y: 40 } }); // right half = after
  const moved = (await order(page)) as string[];
  expect(moved.indexOf("attention")).toBe(moved.indexOf("income") + 1);
  await shot(page, "light-dragged");
  const saved = await page.evaluate((key) => window.localStorage.getItem(key), (await userKey(page))!);
  expect(JSON.parse(saved!)).toEqual(moved);
  await page.reload();
  await expect(page.locator("[data-widget]").first()).toBeVisible({ timeout: 90000 });
  expect(await order(page)).toEqual(moved);

  await page.getByRole("button", { name: "Reset layout" }).click();
  expect(await order(page)).toEqual(DEFAULT_ORDER);
  expect(await userKey(page)).toBeNull();
  await page.reload();
  await expect(page.locator("[data-widget]").first()).toBeVisible({ timeout: 90000 });
  expect(await order(page)).toEqual(DEFAULT_ORDER);
  await expect(page.getByRole("button", { name: "Reset layout" })).toHaveAttribute("aria-disabled", "true");
  expect(problems).toEqual([]);
  await context.close();
});

test("arrow keys on the handle and the move buttons reorder, keep focus, announce, and persist", async ({ browser }) => {
  const { context, page, problems } = await open(browser);
  await grip(page, "monthEnd").focus();
  await page.keyboard.press("ArrowUp");
  expect((await order(page))!.slice(0, 2)).toEqual(["monthEnd", "attention"]);
  await expect(grip(page, "monthEnd")).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Month-end moved to position 1 of 12");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("status")).toContainText("Month-end is already first");

  await page.getByRole("button", { name: "Move Attention needed later" }).click();
  expect((await order(page))!.slice(0, 3)).toEqual(["monthEnd", "monthlySummary", "attention"]);
  await expect(page.getByRole("button", { name: "Move Attention needed later" })).toBeFocused();
  await page.getByRole("button", { name: "Move Attention needed earlier" }).click();
  const after = await order(page);
  await page.reload();
  await expect(page.locator("[data-widget]").first()).toBeVisible({ timeout: 90000 });
  expect(await order(page)).toEqual(after);
  expect(problems).toEqual([]);
  await context.close();
});

test("each user keeps their own order", async ({ browser }) => {
  const { context, page } = await open(browser);
  await grip(page, "monthEnd").focus();
  await page.keyboard.press("ArrowUp");
  const key = (await userKey(page))!;
  await page.evaluate((current) => {
    const value = window.localStorage.getItem(current)!;
    window.localStorage.removeItem(current);
    window.localStorage.setItem("accordai-dashboard-layout-v1:someone-else", value);
  }, key);
  await page.reload();
  await expect(page.locator("[data-widget]").first()).toBeVisible({ timeout: 90000 });
  expect(await order(page)).toEqual(DEFAULT_ORDER);
  await context.close();
});

test("with browser storage blocked the page renders and reordering still works for the visit", async ({ browser }) => {
  const { context, page, problems } = await open(browser, { blockStorage: true });
  expect(await order(page)).toEqual(DEFAULT_ORDER);
  await grip(page, "monthEnd").focus();
  await page.keyboard.press("ArrowUp");
  expect((await order(page))!.slice(0, 2)).toEqual(["monthEnd", "attention"]);
  await page.getByRole("button", { name: "Reset layout" }).click();
  expect(await order(page)).toEqual(DEFAULT_ORDER);
  expect(problems.filter((item) => !/blocked/i.test(item))).toEqual([]);
  await context.close();
});

test("on a phone the panels stack in the saved order and every handle is reachable", async ({ browser }) => {
  const { context, page, problems } = await open(browser, { width: 375, height: 812 });
  await grip(page, "recentDocuments").focus();
  for (let step = 0; step < 11; step += 1) await page.keyboard.press("ArrowUp");
  const saved = (await order(page)) as string[];
  expect(saved[0]).toBe("recentDocuments");
  const tops = await page.locator("[data-widget]").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.left), width: Math.round(rect.width), y: rect.top + window.scrollY };
  }));
  expect(new Set(tops.map((item) => item.x)).size).toBe(1);
  expect(tops.every((item, index) => index === 0 || item.y > tops[index - 1].y)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, "phone-reordered");
  await page.reload();
  await expect(page.locator("[data-widget]").first()).toBeVisible({ timeout: 90000 });
  expect(await order(page)).toEqual(saved);
  expect(problems).toEqual([]);
  await context.close();
});

test("dark mode renders the handles and drop marker with readable contrast", async ({ browser }) => {
  const { context, page, problems } = await open(browser, { dark: true });
  await page.locator('[data-widget="attention"]').hover();
  await shot(page, "dark-default");
  const tools = page.locator('[data-widget="attention"] .dash-widget-tools');
  await expect(tools).toBeVisible();
  const colours = await tools.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colours.background).not.toBe(colours.color);
  expect(problems).toEqual([]);
  await context.close();
});

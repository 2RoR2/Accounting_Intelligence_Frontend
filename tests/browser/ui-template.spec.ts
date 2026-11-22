import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

let BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const SHOT_DIR = "docs/screenshots/latest-template";
const FORBIDDEN_FOR_ACCOUNTANT = ["approvals", "users", "validation-rules", "audit", "system"];
const SIDEBAR_LINKS =
  "aside#workspace-navigation a.nav-item, aside#workspace-navigation a.nav-subitem";
// Console errors that are dev tooling noise rather than application failures.
const IGNORABLE_CONSOLE = [/Download the React DevTools/i, /favicon\.ico/i];

type Cookie = { name: string; value: string; path?: string };

function loadCookies(file: string) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const list: Cookie[] = Array.isArray(raw) ? raw : raw.cookies;
  const host = new URL(BASE_URL).hostname;
  return list.map((c) => ({ name: c.name, value: c.value, domain: host, path: c.path ?? "/" }));
}

type Monitor = {
  problems: string[];
  ignored: string[];
  requests: string[];
  setPage: (label: string) => void;
};

function monitor(page: Page): Monitor {
  let current = "(initial)";
  const m: Monitor = {
    problems: [],
    ignored: [],
    requests: [],
    setPage: (label) => {
      current = label;
    },
  };
  page.on("pageerror", (err) => m.problems.push(`[${current}] pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const where = msg.location().url;
    const text = where ? `${msg.text()} (${where})` : msg.text();
    if (IGNORABLE_CONSOLE.some((re) => re.test(text))) {
      m.ignored.push(`[${current}] ${text}`);
    } else {
      m.problems.push(`[${current}] console.error: ${text}`);
    }
  });
  page.on("request", (req) => m.requests.push(`[${current}] ${req.url()}`));
  page.on("response", (res) => {
    if (res.status() >= 400) m.problems.push(`[${current}] HTTP ${res.status()} ${res.url()}`);
  });
  return m;
}

async function openContext(browser: Browser, cookieFile: string, viewport = { width: 1440, height: 1000 }) {
  const context: BrowserContext = await browser.newContext({ baseURL: BASE_URL, viewport });
  await context.addCookies(loadCookies(cookieFile));
  return context;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
}

async function checkRole(browser: Browser, cookieFile: string, area: "workspace" | "company", role: string) {
  const context = await openContext(browser, cookieFile);
  const page = await context.newPage();
  const m = monitor(page);
  m.setPage(`/${area}/dashboard`);
  await page.goto(`/${area}/dashboard`);
  await settle(page);
  const sidebar = page.locator("aside#workspace-navigation");
  await expect(sidebar, "sidebar missing: dev server may be serving another checkout").toBeVisible();
  await expect(sidebar).toContainText("Sales");
  await expect(sidebar).toContainText("Accounting");

  const hrefs = [
    ...new Set(
      (await page.locator(SIDEBAR_LINKS).evaluateAll((els) =>
        els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""),
      )).filter(Boolean),
    ),
  ];
  expect(hrefs.length).toBeGreaterThan(0);
  // Links outside the role area (e.g. sign-out to /login) are reported, not visited.
  const outside = hrefs.filter((h) => !h.startsWith(`/${area}/`));
  if (outside.length) console.log(`[${role}] sidebar links outside /${area}/ (not visited): ${outside.join(", ")}`);
  const visit = hrefs.filter((h) => h.startsWith(`/${area}/`));

  if (role === "accountant") {
    const leaked = hrefs.filter((href) =>
      FORBIDDEN_FOR_ACCOUNTANT.some((seg) => href.split(/[/?#]/).includes(seg)),
    );
    expect(leaked, "accountant sees restricted links").toEqual([]);
  }

  const failures: string[] = [];
  for (const href of visit) {
    m.setPage(href);
    let attempt = 0;
    for (;;) {
      try {
        await page.goto(href);
        await settle(page);
        const path = new URL(page.url()).pathname;
        expect(path.startsWith(`/${area}/`), `left /${area}/: ${path}`).toBe(true);
        await expect(page.getByText("This page could not be found")).toHaveCount(0);
        await expect(page.getByText(/^404$/)).toHaveCount(0);
        await expect(page.getByText("We couldn’t complete that request")).toHaveCount(0);
        const main = page.locator("main").first();
        await expect(main).toBeVisible();
        expect((await main.innerText()).trim().length, "empty main").toBeGreaterThan(0);
        break;
      } catch (err) {
        if (attempt++ >= 1) {
          failures.push(`${href}: ${(err as Error).message.split("\n")[0]}`);
          break;
        }
      }
    }
  }

  const erp = m.requests.filter((r) => /erp|myinvois/i.test(r.replace(/^\[[^\]]*\] /, "")));
  console.log(`[${role}] visited ${visit.length} links: ${visit.join(", ")}`);
  if (m.ignored.length) console.log(`[${role}] ignored console errors:\n  ${m.ignored.join("\n  ")}`);
  await context.close();
  expect(failures, `[${role}] page failures`).toEqual([]);
  expect(erp, `[${role}] ERP/MyInvois requests`).toEqual([]);
  expect(m.problems, `[${role}] page/console errors`).toEqual([]);
}

test.describe("latest_update template navigation", () => {
  test.beforeEach(({ baseURL }) => {
    if (baseURL) BASE_URL = baseURL;
  });
  const accountant = process.env.UI_ACCOUNTANT_COOKIES;
  const admin = process.env.UI_ADMIN_COOKIES;

  test("accountant sidebar links render", async ({ browser }) => {
    test.skip(!accountant, "UI_ACCOUNTANT_COOKIES not set");
    await checkRole(browser, accountant!, "workspace", "accountant");
  });

  test("local admin sidebar links render", async ({ browser }) => {
    test.skip(!admin, "UI_ADMIN_COOKIES not set");
    await checkRole(browser, admin!, "company", "admin");
  });

  test("local admin dashboard screenshots", async ({ browser }) => {
    test.skip(!admin, "UI_ADMIN_COOKIES not set");
    mkdirSync(SHOT_DIR, { recursive: true });
    const shoot = async (viewport: { width: number; height: number }, file: string, openMenu = false) => {
      const context = await openContext(browser, admin!, viewport);
      const page = await context.newPage();
      const m = monitor(page);
      m.setPage(`/company/dashboard ${viewport.width}px`);
      await page.goto("/company/dashboard");
      await expect(page.getByText("Monthly summary").first()).toBeVisible();
      await settle(page);
      if (openMenu) {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await expect(page.locator("aside#workspace-navigation")).toBeVisible();
        await page.waitForTimeout(400);
      }
      await page.screenshot({ path: `${SHOT_DIR}/${file}`, fullPage: true });
      await context.close();
      expect(m.problems).toEqual([]);
      expect(m.requests.filter((r) => /erp|myinvois/i.test(r.replace(/^\[[^\]]*\] /, "")))).toEqual([]);
    };
    await shoot({ width: 1440, height: 1000 }, "dashboard-desktop.png");
    await shoot({ width: 390, height: 844 }, "dashboard-phone.png");
    await shoot({ width: 390, height: 844 }, "dashboard-phone-menu.png", true);
  });
});

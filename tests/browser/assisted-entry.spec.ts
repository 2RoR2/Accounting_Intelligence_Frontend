/**
 * Assisted entry on typed Sales and Purchases documents, end to end on a LOCAL stack (never a hosted one).
 *
 *   AE_BASE_URL=http://127.0.0.1:3077 AE_ACCOUNTANT=<cookie json> AE_ADMIN=<cookie json> \
 *     npx playwright test -c tests/browser/assisted-entry.config.ts assisted-entry.spec.ts
 *
 * Cookie files come from `manage.py browser-session --email accountant@knt.demo.test --out <file>` (and admin@).
 * The stack needs KNT demo data plus at least one tax code, payment term, product, customer and supplier.
 * Skipped when the cookie files are not given.
 */
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PURCHASE_TYPES, SALES_TYPES, AMOUNT_ONLY_TYPES, DOCUMENT_LABELS, type DocumentType } from "../../src/lib/api/erp.service";

const BASE_URL = process.env.AE_BASE_URL ?? "http://127.0.0.1:3077";
const ACCOUNTANT = process.env.AE_ACCOUNTANT;
const ADMIN = process.env.AE_ADMIN;
const IGNORABLE = [/Download the React DevTools/i, /favicon\.ico/i, /\[Fast Refresh\]/i, /\[HMR\]/i];

test.skip(!ACCOUNTANT || !ADMIN, "Set AE_ACCOUNTANT and AE_ADMIN to cookie files from manage.py browser-session.");

async function signedIn(browser: Browser, file: string, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, baseURL: BASE_URL });
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

const root = (role: "accountant" | "admin") => (role === "admin" ? "/company" : "/workspace");
const newDocument = (role: "accountant" | "admin", type: DocumentType) =>
  `${root(role)}/${(SALES_TYPES as readonly string[]).includes(type) ? "sales" : "purchases"}/new?type=${type}`;

async function ready(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60000 });
  await expect(page.locator("form fieldset")).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("Loading form choices…")).toHaveCount(0, { timeout: 30000 });
}

/** Types into a combobox and takes the highlighted match with Enter. */
async function pick(box: Locator, text: string, expected?: RegExp | string) {
  await box.click();
  await box.fill("");
  await box.pressSequentially(text);
  await expect(box.page().getByRole("listbox").getByRole("option").first()).toBeVisible();
  await box.press("Enter");
  if (expected) await expect(box).toHaveValue(expected);
}

const line = (page: Page, n: number) => page.locator(`section[aria-label="Line ${n}"]`);
const totals = (page: Page) => page.locator("dl.totals-grid");

async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/(sales|purchases)\/(?!new)[^?]+\?type=/, { timeout: 30000 });
}

test("every sales and purchase type opens a form whose lines (or amount) can be typed and chosen", async ({ browser }) => {
  const { context, page, problems } = await signedIn(browser, ACCOUNTANT!);
  for (const type of [...SALES_TYPES, ...PURCHASE_TYPES]) {
    await page.goto(newDocument("accountant", type));
    await expect(page.getByRole("heading", { name: `New ${DOCUMENT_LABELS[type].toLowerCase()}` })).toBeVisible();
    await ready(page);
    if (AMOUNT_ONLY_TYPES.has(type)) {
      const amount = page.getByLabel(/^Amount \(/);
      await expect(amount, type).toBeEditable();
      await amount.fill("12.30");
      await expect(totals(page), type).toContainText("12.30");
      continue;
    }
    const first = line(page, 1);
    await expect(first, `${type} starts with a line`).toBeVisible();
    for (const name of ["Product", "Description", "Tax code", "Account"]) await expect(first.getByRole("combobox", { name }), `${type} ${name}`).toBeEditable();
    for (const name of [/^Quantity/, /^Unit price/, /^Discount/, /^Tax amount/]) await expect(first.getByLabel(name), `${type}`).toBeEditable();
    await pick(first.getByRole("combobox", { name: "Product" }), "tile");
    await expect(first.getByRole("combobox", { name: "Description" }), type).not.toHaveValue("");
    await expect(first.getByLabel(/^Unit price/), type).not.toHaveValue("0");
  }
  expect(problems).toEqual([]);
  await context.close();
});

test("quotation -> invoice: customer fills terms and bill-to, lines by typeahead, Enter adds lines, totals are sums", async ({ browser }) => {
  const { context, page, problems } = await signedIn(browser, ACCOUNTANT!);
  await page.goto(newDocument("accountant", "quotation"));
  await ready(page);
  const customer = page.getByRole("combobox", { name: "Customer" });
  await expect(customer).toBeFocused();
  await pick(customer, "sen", /Senduduk/);
  await expect(page.getByRole("group", { name: "Bill to" })).toContainText("TIN");

  await pick(line(page, 1).getByRole("combobox", { name: "Product" }), "TILE-6060", "Ceramic floor tile 60x60");
  const l1 = line(page, 1);
  await expect(l1.getByLabel(/^Unit price/)).toHaveValue("85.00");
  await expect(l1.getByRole("combobox", { name: "Tax code" })).toHaveValue("SST-10");
  await l1.getByLabel(/^Quantity/).fill("10");
  await l1.getByLabel(/^Discount/).fill("50");
  await l1.getByLabel(/^Tax amount/).fill("80.00");
  await expect(l1.locator("output")).toContainText("800.00");
  // Enter through to the last field of the last line adds a line and focuses its product.
  await l1.getByRole("combobox", { name: "Account" }).focus();
  await page.keyboard.press("Enter");
  await expect(line(page, 2).getByRole("combobox", { name: "Product" })).toBeFocused();
  const description = line(page, 2).getByRole("combobox", { name: "Description" });
  await description.click();
  await description.pressSequentially("adhes");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(description).toHaveValue("Tile adhesive 25kg");
  await expect(line(page, 2).getByLabel(/^Unit price/)).toHaveValue("38.50");
  await line(page, 2).getByLabel(/^Quantity/).fill("4");
  // A free-text line: typed description, typed price; tax stays as typed (none).
  await page.getByRole("button", { name: "+ Add line" }).click();
  await line(page, 3).getByRole("combobox", { name: "Description" }).fill("Hacking and disposal of old tiles");
  await page.keyboard.press("Escape");
  await line(page, 3).getByLabel(/^Unit price/).fill("650");
  await expect(totals(page)).toContainText("1,654.00"); // 850 + 154 + 650 gross
  await expect(totals(page)).toContainText("1,604.00"); // after the 50 discount
  await expect(totals(page)).toContainText("1,684.00"); // + typed tax 80
  await save(page);
  await expect(page.getByRole("heading", { name: /Quotation/ })).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Convert to invoice" }).click();
  await expect(page).toHaveURL(/type=invoice/, { timeout: 30000 });
  await expect(page.getByRole("heading", { name: /^Invoice/ })).toBeVisible();
  await ready(page);
  await expect(line(page, 3).getByRole("combobox", { name: "Description" })).toHaveValue("Hacking and disposal of old tiles");
  await expect(totals(page)).toContainText("1,684.00");
  expect(problems).toEqual([]);
  await context.close();
});

test("bill: supplier from TIN, inline new product, description suggests the supplier's earlier lines; admin posts it", async ({ browser }) => {
  const { context, page, problems } = await signedIn(browser, ACCOUNTANT!);
  await page.goto(newDocument("accountant", "bill"));
  await ready(page);
  await pick(page.getByRole("combobox", { name: "Supplier" }), "C77BTS", /Borneo Tiles/);
  await expect(page.getByLabel("Payment terms")).toHaveValue("Net 30");
  await expect(page.getByLabel("Due date")).not.toHaveValue("");
  const product = line(page, 1).getByRole("combobox", { name: "Product" });
  const name = `Marble threshold ${Date.now() % 100000}`;
  await product.click();
  await product.pressSequentially(name);
  await page.getByRole("option", { name: new RegExp(`Add new product`) }).click();
  const dialog = page.getByRole("dialog", { name: "New product" });
  await expect(dialog.getByLabel("Name")).toHaveValue(name);
  await dialog.getByLabel("Purchase price").fill("44.00");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(product).toHaveValue(name);
  await expect(line(page, 1).getByLabel(/^Unit price/)).toHaveValue(/^44/);
  await line(page, 1).getByLabel(/^Quantity/).fill("3");
  await page.getByLabel("Supplier invoice no.").fill(`BTS-${Date.now() % 100000}`);
  await save(page);
  const billUrl = page.url();
  // A second bill for the same supplier suggests the line used before.
  await page.goto(newDocument("accountant", "bill"));
  await ready(page);
  await pick(page.getByRole("combobox", { name: "Supplier" }), "borneo", /Borneo Tiles/);
  const description = line(page, 1).getByRole("combobox", { name: "Description" });
  await description.click();
  await description.pressSequentially(name.slice(0, 6));
  await expect(page.getByRole("option", { name: new RegExp(`${name}.*Used on`) })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(problems).toEqual([]);
  await context.close();

  const adminSession = await signedIn(browser, ADMIN!);
  await adminSession.page.goto(billUrl.replace("/workspace/", "/company/"));
  await ready(adminSession.page);
  await adminSession.page.getByRole("button", { name: "Post to ledger" }).click();
  await expect(adminSession.page.getByText("Posted to the ledger")).toBeVisible({ timeout: 30000 });
  expect(adminSession.problems).toEqual([]);
  await adminSession.context.close();
});

test("credit note: admin picks the invoice it corrects from a combobox and issues it; inline new customer", async ({ browser }) => {
  const { context, page, problems } = await signedIn(browser, ADMIN!);
  // An issued invoice to correct.
  await page.goto(newDocument("admin", "invoice"));
  await ready(page);
  await pick(page.getByRole("combobox", { name: "Customer" }), "kuini", /Kuini/);
  await pick(line(page, 1).getByRole("combobox", { name: "Product" }), "clean", "Site cleaning");
  await save(page);
  const number = (await page.getByRole("heading", { name: /^Invoice / }).textContent())!.replace("Invoice ", "").trim();
  await page.getByRole("button", { name: "Issue", exact: true }).click();
  await expect(page.getByText("Issued").first()).toBeVisible({ timeout: 30000 });

  await page.goto(newDocument("admin", "credit-note"));
  await ready(page);
  await pick(page.getByRole("combobox", { name: "Customer" }), "kuini", /Kuini/);
  await pick(page.getByRole("combobox", { name: "Corrects" }), number, number);
  const noteLine = line(page, 1).getByRole("combobox", { name: "Description" });
  await noteLine.click();
  await noteLine.pressSequentially("site");
  await noteLine.press("ArrowDown"); // free text: nothing is taken until a suggestion is highlighted
  await noteLine.press("Enter");
  await expect(noteLine).toHaveValue("Site cleaning");
  await line(page, 1).getByLabel(/^Unit price/).fill("50");
  await save(page);
  await page.getByRole("button", { name: "Issue", exact: true }).click();
  await expect(page.getByText("Issued").first()).toBeVisible({ timeout: 30000 });

  // Inline new customer from the combobox: it is created and chosen.
  await page.goto(newDocument("admin", "quotation"));
  await ready(page);
  const customer = page.getByRole("combobox", { name: "Customer" });
  const newName = `Rajang Builders ${Date.now() % 100000}`;
  await customer.pressSequentially(newName);
  await page.getByRole("option", { name: /Add new customer/ }).click();
  const dialog = page.getByRole("dialog", { name: "New customer" });
  await expect(dialog.getByLabel("Legal name")).toHaveValue(newName);
  await dialog.getByLabel("TIN").fill("C9900112233");
  await dialog.getByLabel("Payment terms (days)").fill("14");
  await dialog.getByRole("button", { name: "Add customer" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(customer).toHaveValue(newName);
  await expect(page.getByRole("group", { name: "Bill to" })).toContainText("C9900112233");
  expect(problems).toEqual([]);
  await context.close();
});

test("phone width: the form fits, the combobox list opens on screen and lines can be filled", async ({ browser }) => {
  const { context, page, problems } = await signedIn(browser, ACCOUNTANT!, { width: 375, height: 812 });
  await page.goto(newDocument("accountant", "invoice"));
  await ready(page);
  await pick(page.getByRole("combobox", { name: "Customer" }), "sen", /Senduduk/);
  const product = line(page, 1).getByRole("combobox", { name: "Product" });
  await product.click();
  await product.pressSequentially("ti");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await product.press("Enter");
  await expect(line(page, 1).getByLabel(/^Unit price/)).not.toHaveValue("0");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
  await context.close();
});

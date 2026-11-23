/**
 * Manual-typing evidence: the same 3-line invoice entered on the old form (`features`) and on the assisted form, counting
 * every keystroke and click the script makes, and which fields were typed, picked from a list or filled automatically.
 * Both runs use the same LOCAL backend and must end with the same saved totals.
 *
 *   AE_FEATURES_URL=http://127.0.0.1:3078 AE_BRANCH_URL=http://127.0.0.1:3077 AE_ACCOUNTANT=<cookie json> \
 *     npx playwright test -c tests/browser/assisted-entry.config.ts typing-count.spec.ts
 *
 * The invoice: customer Senduduk; 10 x Ceramic floor tile 60x60 (tax 85.00 typed); 4 x Tile adhesive 25kg (tax 15.40);
 * 1 x "Hacking and disposal of old tiles" at 650.00, tax code SV-8, tax 52.00 - a line this customer had before, not a
 * catalog item. Every field is focused with a click (as a mouse user would); replacing a default value costs Ctrl+A.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const FEATURES = process.env.AE_FEATURES_URL;
const BRANCH = process.env.AE_BRANCH_URL;
const ACCOUNTANT = process.env.AE_ACCOUNTANT;
test.skip(!FEATURES || !BRANCH || !ACCOUNTANT, "Set AE_FEATURES_URL, AE_BRANCH_URL and AE_ACCOUNTANT.");
test.describe.configure({ mode: "serial" });

type Tally = { keystrokes: number; clicks: number; typed: string[]; picked: string[]; autoFilled: string[] };
const results: Record<string, Tally & { total?: string; tax?: string; number?: string }> = {};
const PRIOR_LINE = "Hacking and disposal of old tiles";

function counter() {
  const tally: Tally = { keystrokes: 0, clicks: 0, typed: [], picked: [], autoFilled: [] };
  return {
    tally,
    async click(target: Locator) { await target.click(); tally.clicks++; },
    /** Click a field, clear a default if there is one (Ctrl+A), then type. */
    async type(target: Locator, text: string, field: string, replace = false) {
      await target.click(); tally.clicks++;
      if (replace) { await target.press("Control+A"); tally.keystrokes++; }
      await target.pressSequentially(text); tally.keystrokes += text.length;
      tally.typed.push(field);
    },
    async keys(target: Locator, ...keys: string[]) { for (const key of keys) { await target.press(key); tally.keystrokes++; } },
    /** A native select chosen with the mouse: open it, click the option. */
    async select(target: Locator, label: string, field: string) {
      await target.selectOption({ label }); tally.clicks += 2; tally.picked.push(field);
    },
    picked(field: string) { tally.picked.push(field); },
    auto(...fields: string[]) { tally.autoFilled.push(...fields); },
  };
}

async function open(page: Page, base: string) {
  const host = new URL(base).hostname;
  const cookies = (JSON.parse(readFileSync(ACCOUNTANT!, "utf8")) as { name: string; value: string; path?: string }[])
    .map(({ name, value, path }) => ({ name, value, domain: host, path: path ?? "/" }));
  await page.context().addCookies(cookies);
  await page.goto(`${base}/workspace/sales/new?type=invoice`);
  await expect(page.getByRole("heading", { name: "New invoice" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator("form fieldset")).toBeVisible();
  await expect(page.getByText("Loading form choices…")).toHaveCount(0, { timeout: 30000 });
}

const line = (page: Page, n: number) => page.locator(`section[aria-label="Line ${n}"]`);

async function saveAndRead(page: Page, side: string, tally: Tally) {
  await page.getByRole("button", { name: "Save", exact: true }).click(); tally.clicks++;
  await expect(page).toHaveURL(/\/sales\/(?!new)[^?]+\?type=invoice/, { timeout: 30000 });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const saved = await (await page.request.get(`${new URL(page.url()).origin}/api/erp/documents/invoice/${id}`,
    { headers: { "X-Requested-With": "AccountingIntelligence" } })).json();
  results[side] = { ...tally, total: saved.amount, tax: saved.taxAmount, number: saved.number };
}

test.beforeAll(async ({ browser }) => {
  // The customer's earlier invoice with the free-text line, so the assisted form can suggest it.
  const page = await browser.newPage();
  await open(page, BRANCH!);
  const origin = new URL(BRANCH!).origin;
  const headers = { "X-Requested-With": "AccountingIntelligence", "Content-Type": "application/json" };
  const contacts = await (await page.request.get(`${origin}/api/erp/contacts?kind=customer`, { headers })).json();
  const customer = contacts.find((c: { legalName: string }) => c.legalName.startsWith("Senduduk"));
  const earlier = await (await page.request.get(`${origin}/api/erp/documents/invoice?contactId=${customer.id}&source=typed&pageSize=50`, { headers })).json();
  if (!earlier.items.some((d: { lines?: { description: string }[] }) => d.lines?.some((l) => l.description === PRIOR_LINE))) {
    const created = await page.request.post(`${origin}/api/erp/documents/invoice`, { headers, data: {
      contactId: customer.id, documentDate: "2026-11-10", currency: "MYR",
      lines: [{ description: PRIOR_LINE, quantity: "1", unitPrice: "650.00", taxCode: "SV-8", tax: "52.00", discount: "0" }],
    } });
    expect(created.ok()).toBeTruthy();
  }
  await page.close();
});

test("features: the old form", async ({ page }) => {
  const { tally, click, type, select } = counter();
  await open(page, FEATURES!);
  await select(page.getByLabel("Customer"), "Senduduk Fit-Out Sdn. Bhd.", "customer");
  for (let n = 0; n < 3; n++) await click(page.getByRole("button", { name: "Add line", exact: true }));
  await select(line(page, 1).getByLabel("Product"), "TILE-6060 · Ceramic floor tile 60x60", "line 1 product");
  await type(line(page, 1).getByLabel(/^Quantity/), "10", "line 1 quantity", true);
  await type(line(page, 1).getByLabel("Tax amount"), "85.00", "line 1 tax amount");
  await select(line(page, 2).getByLabel("Product"), "ADH-25 · Tile adhesive 25kg", "line 2 product");
  await type(line(page, 2).getByLabel(/^Quantity/), "4", "line 2 quantity", true);
  await type(line(page, 2).getByLabel("Tax amount"), "15.40", "line 2 tax amount");
  await type(line(page, 3).getByLabel("Description"), PRIOR_LINE, "line 3 description");
  await type(line(page, 3).getByLabel(/^Unit price/), "650", "line 3 unit price", true);
  await select(line(page, 3).getByLabel("Tax code"), "SV-8 · Service tax 8%", "line 3 tax code");
  await type(line(page, 3).getByLabel("Tax amount"), "52.00", "line 3 tax amount");
  tally.autoFilled.push("payment terms", "due date", "line 1-2 description", "line 1-2 unit price", "line 1-2 tax code");
  await saveAndRead(page, "features", tally);
});

test("branch: the assisted form", async ({ page }) => {
  const { tally, click, type, keys, picked } = counter();
  await open(page, BRANCH!);
  const customer = page.getByRole("combobox", { name: "Customer" });
  await expect(customer).toBeFocused(); // a new document starts in the customer field
  await customer.pressSequentially("sen"); tally.keystrokes += 3;
  await expect(page.getByRole("option").first()).toBeVisible();
  await keys(customer, "Enter"); picked("customer");
  await expect(customer).toHaveValue(/Senduduk/);

  const product1 = line(page, 1).getByRole("combobox", { name: "Product" }); // a new document starts with one line
  await click(product1);
  await product1.pressSequentially("cer"); tally.keystrokes += 3;
  await keys(product1, "Enter"); picked("line 1 product");
  await expect(product1).toHaveValue("Ceramic floor tile 60x60");
  await type(line(page, 1).getByLabel(/^Quantity/), "10", "line 1 quantity", true);
  await type(line(page, 1).getByLabel("Tax amount"), "85.00", "line 1 tax amount");

  await click(page.getByRole("button", { name: "+ Add line" }));
  const product2 = line(page, 2).getByRole("combobox", { name: "Product" });
  await expect(product2).toBeFocused(); // the new line's first field takes the focus
  await product2.pressSequentially("adh"); tally.keystrokes += 3;
  await keys(product2, "Enter"); picked("line 2 product");
  await expect(product2).toHaveValue("Tile adhesive 25kg");
  await type(line(page, 2).getByLabel(/^Quantity/), "4", "line 2 quantity", true);
  await type(line(page, 2).getByLabel("Tax amount"), "15.40", "line 2 tax amount");

  await click(page.getByRole("button", { name: "+ Add line" }));
  const description3 = line(page, 3).getByRole("combobox", { name: "Description" });
  await click(description3);
  await description3.pressSequentially("hack"); tally.keystrokes += 4;
  await expect(page.getByRole("option", { name: new RegExp(`${PRIOR_LINE}.*Used on`) })).toBeVisible();
  await keys(description3, "ArrowDown", "Enter"); picked("line 3 description (this customer's earlier line)");
  await expect(description3).toHaveValue(PRIOR_LINE);
  await expect(line(page, 3).getByLabel(/^Unit price/)).toHaveValue("650.00");
  await expect(line(page, 3).getByRole("combobox", { name: "Tax code" })).toHaveValue("SV-8");
  await type(line(page, 3).getByLabel("Tax amount"), "52.00", "line 3 tax amount");
  tally.autoFilled.push("payment terms", "due date", "bill-to (shown)", "line 1-2 description", "line 1-2 unit price",
    "line 1-2 tax code", "line 3 unit price", "line 3 tax code");
  await saveAndRead(page, "branch", tally);
});

test.afterAll(() => {
  const f = results.features;
  const b = results.branch;
  if (!f || !b) return;
  const row = (name: string, a: number, c: number) => `| ${name} | ${a} | ${c} | ${a ? Math.round(((a - c) / a) * 100) : 0}% |`;
  const report = [
    "| Same 3-line invoice | features | this branch | fewer |", "|---|---:|---:|---:|",
    row("Keystrokes", f.keystrokes, b.keystrokes), row("Clicks", f.clicks, b.clicks),
    row("Keystrokes + clicks", f.keystrokes + f.clicks, b.keystrokes + b.clicks),
    row("Fields typed", f.typed.length, b.typed.length),
    `| Fields picked from a list | ${f.picked.length} | ${b.picked.length} | |`,
    `| Fields filled automatically | ${f.autoFilled.length} | ${b.autoFilled.length} | |`,
    `| Saved total / tax | ${f.total} / ${f.tax} (${f.number}) | ${b.total} / ${b.tax} (${b.number}) | |`,
  ].join("\n");
  console.log(`\n${report}\n`);
  console.log(JSON.stringify(results, null, 2));
  if (process.env.AE_OUT) writeFileSync(process.env.AE_OUT, `${report}\n\n${JSON.stringify(results, null, 2)}\n`);
  expect(b.total).toBe(f.total);
  expect(b.tax).toBe(f.tax);
});

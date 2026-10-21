import { test, expect, type Page, type Route } from "@playwright/test";
const syntheticUser = { id: "synthetic-ui-user", name: "Synthetic Reviewer", email: "synthetic@example.test", role: "LOCAL_ADMIN", tenantId: "synthetic-tenant", tenantName: "Synthetic UI Test", status: "ACTIVE", mustChangePassword: false };
const reply = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
// All API requests are fulfilled here; no real backend, cookies or credentials.
async function mockApis(page: Page) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return reply(route, syntheticUser);
    if (path === "/api/reports/accounting") return reply(route, { cards: [{ key: "transactions", title: "Document register", count: 0 }], summary: { documentCount: 0, totalAmount: 0, lineAmount: 0, openExceptions: 0 }, documents: [] });
    if (route.request().method() === "GET") return reply(route, []);
    return reply(route, { detail: "Unexpected mocked API request" }, 503);
  });
}
test.beforeEach(async ({ page }) => { await mockApis(page); });

test("login 401 stays invalid credentials; authenticator recovery offers guidance without an action", async ({ page }) => {
  let attempts = 0; let recoveryCalls = 0;
  await page.route("**/api/auth/login", route => ++attempts === 1 ? reply(route, { detail: "Invalid email or password, or account is not active." }, 401) : reply(route, { mfaRequired: true, enrollmentRequired: false }));
  await page.route("**/api/auth/mfa-recovery-requests/**", route => { recoveryCalls++; return reply(route, {}, 403); });
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("synthetic@example.test");
  await page.locator('input[autocomplete="current-password"]').fill("synthetic-test-only");
  await page.locator("form button.btn.primary.full").click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Invalid email or password");
  await expect(page.getByText(/session expired/i)).toHaveCount(0);
  await page.locator("form button.btn.primary.full").click();
  await expect(page.getByText(/Self-service reset is unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: /generate.*key|reset.*authenticator|Lost access/i })).toHaveCount(0);
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveCount(0);
  expect(recoveryCalls).toBe(0);
});

test("protected account service failure is retryable and distinct from signed out", async ({ page }, info) => {
  let calls = 0;
  await page.route("**/api/auth/me", route => ++calls === 1 ? reply(route, { detail: "Account service is unavailable." }, 503) : reply(route, { detail: "Sign in with an active company account." }, 401));
  await page.goto("/company/upload");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Account service is unavailable");
  await expect(page.getByRole("link", { name: "Continue to login" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("service-error.png"), fullPage: true });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("link", { name: "Continue to login" })).toBeVisible();
  expect(calls).toBe(2);
});

test("welcome distinguishes loading, service error, and unauthenticated empty state", async ({ page }, info) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let available = false;
  await page.route("**/api/auth/me", async route => { await gate; return reply(route, { detail: available ? "Sign in" : "Synthetic account service unavailable" }, available ? 401 : 503); });
  await page.goto("/welcome");
  await expect(page.getByText("Preparing your workspace")).toBeVisible();
  release();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Synthetic account service unavailable");
  await expect(page.getByRole("heading", { name: /signed in/i })).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("welcome-signed-out.png"), fullPage: true });
});

test("upload is PDF-only without environment flags and keeps AP/AR and auto-detect", async ({ page }, info) => {
  let uploads = 0;
  await page.route("**/api/documents?*", route => { uploads++; return reply(route, {}, 503); });
  await page.goto("/company/upload?source=camera");
  await expect(page.getByRole("button", { name: "Camera unavailable" })).toBeDisabled();
  const picker = page.locator('input[type="file"]');
  await expect(picker).toHaveAttribute("accept", ".pdf");
  await expect(page.locator('select:has(option[value="AUTO"])')).toHaveValue("AUTO");
  await page.locator('select:has(option[value="ACCOUNTS_RECEIVABLE"])').selectOption("ACCOUNTS_RECEIVABLE");
  await picker.setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from("synthetic") });
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(".png files are not supported");
  expect(uploads).toBe(0);
  await picker.setInputFiles({ name: "synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF- synthetic test only") });
  await expect(page.getByText("synthetic.pdf", { exact: true })).toBeVisible();
  await expect(page.locator('select:has(option[value="ACCOUNTS_RECEIVABLE"])')).toHaveValue("ACCOUNTS_RECEIVABLE");
  await page.screenshot({ path: info.outputPath("pdf-only-upload.png"), fullPage: true });
});

test("bank input rejects numeric money and labels server results only as candidates", async ({ page }, info) => {
  let posts = 0;
  await page.route("**/api/bank-reconciliation", route => { posts++; return reply(route, { results: [{ accounting_record_id: "synthetic-record", status: "MATCHED", matched_bank_transaction_id: "synthetic-bank", candidates: ["synthetic-bank"], reason: null }], used_bank_transaction_ids: ["synthetic-bank"] }); });
  await page.route("**/api/auth/me", route => reply(route, { ...syntheticUser, role: "ACCOUNTANT" }));
  await page.goto("/workspace/reports");
  await expect(page.getByRole("heading", { name: "Nothing here yet", exact: true })).toBeVisible();
  await page.getByLabel("Accounting records JSON").fill(JSON.stringify([{ record_id: "synthetic-record", total_amount: 100, currency: "USD" }]));
  await page.getByLabel("Bank transactions JSON").fill("[]");
  await page.getByRole("button", { name: "Find candidates" }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("decimal string");
  expect(posts).toBe(0);
  await page.getByLabel("Accounting records JSON").fill(JSON.stringify([{ record_id: "synthetic-record", total_amount: "100.00", currency: "USD", reference_number: null }]));
  await page.getByRole("button", { name: "Find candidates" }).click();
  await expect(page.getByText("Candidate found", { exact: true })).toBeVisible();
  expect(posts).toBe(1);
  await expect(page.getByText(/do not confirm settlement or post ledger entries/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("bank-candidates.png"), fullPage: true });
});

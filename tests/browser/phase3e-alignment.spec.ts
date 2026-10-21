import { test, expect, type Page, type Route } from "@playwright/test";
const tenant = "11111111-1111-4111-8111-111111111111";
const actor = "33333333-3333-4333-8333-333333333333";
const other = "55555555-5555-4555-8555-555555555555";
const documentId = "44444444-4444-4444-8444-444444444444";
const lineId = "66666666-6666-4666-8666-666666666666";
const reply = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
function state() {
  return { user: { id: actor, name: "Synthetic Reviewer", email: "synthetic@example.test", role: "ACCOUNTANT", tenantId: tenant, tenantCode: "TENANT_901", tenantName: "Synthetic Contract Test", status: "ACTIVE", mustChangePassword: false },
    ownerId: actor, assignedTo: null as string | null, revision: 1, status: "EXTRACTED", amount: "50.00", record: false,
    submittedBy: other, approved: false, patches: [] as Array<{ value: string; expectedContentRevision: number }>, retryCalls: 0,
  };
}
async function mockReview(page: Page, data: ReturnType<typeof state>, line?: (route: Route) => Promise<void>, retry?: (route: Route) => Promise<void>) {
  // Every API request is intercepted. No preserved backend, credentials or DB.
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()); const path = url.pathname; const method = route.request().method();
    if (path === "/api/auth/me") return reply(route, data.user);
    if (path === "/api/tenants") return reply(route, [{ id: tenant, name: "Synthetic Contract Test", status: "ACTIVE" }]);
    if (path === "/api/documents/" + documentId) return reply(route, { id: documentId, code: "SYNTHETIC_001", name: "synthetic-contract.pdf", tenantId: tenant, ownerId: data.ownerId, assignedTo: data.assignedTo, kind: "INVOICE", category: "ACCOUNTS_PAYABLE", status: data.status, contentRevision: data.revision, createdAt: "2026-10-20T00:00:00Z" });
    if (path.endsWith("/extraction")) return reply(route, { documentId, contentRevision: data.revision, classification: { value: "invoice", status: "classified", method: "explicit_heading_rules" }, fields: [{ key: "supplier", value: "Synthetic Supplier", normalizedValue: "Synthetic Supplier", confidence: null }, { key: "total", value: data.amount, normalizedValue: "50.00", confidence: null }, { key: "currency", value: "USD", normalizedValue: "USD", confidence: null }], lineItems: [{ id: lineId, description: "Synthetic item", quantity: "2.000", unit_price: "25.0000", amount: data.amount, evidence: {} }] });
    if (path.endsWith("/validation")) return reply(route, { documentId, contentRevision: data.revision, status: data.status, validationStatus: "PASS", reviewRequired: true, accountingApprovalPerformed: false, coverageComplete: true, passed: 1, warnings: 0, failed: 0, blocking: false, results: [] });
    if (path.endsWith("/reviews")) return reply(route, { submissions: data.status === "IN_REVIEW" || data.approved ? [{ id: "s", submittedBy: data.submittedBy, decision: "SUBMITTED", note: "Synthetic submission", createdAt: "2026-10-20T00:00:00Z" }] : [], decisions: data.approved ? [{ id: "decision", reviewedBy: other, decision: "APPROVED", note: "Synthetic", approvedRevision: data.revision, createdAt: "2026-10-20T00:00:00Z" }] : [] });
    if (path.endsWith("/kind-workflow")) return reply(route, { kind: "invoice", fields: {}, overdue: false, duplicates: [], relatedNotes: [] });
    if (path.endsWith("/file")) return reply(route, { detail: "Synthetic source not provided in this mocked UI test" }, 404);
    if (path === "/api/records") return reply(route, data.record ? [{ id: "synthetic-approved-record", documentId, tenantId: tenant, category: "ACCOUNTS_PAYABLE", validation: "PASSED", status: "COMPLETED", createdAt: "2026-10-20T00:00:00Z", snapshot: { contentRevision: data.revision, fieldPredictions: [], lineItems: [] } }] : []);
    if (method === "PATCH" && path.includes("/line-items/")) {
      data.patches.push(route.request().postDataJSON());
      if (line) return line(route);
      return reply(route, { detail: "Line correction rejected by mocked server" }, 403);
    }
    if (path.endsWith("/retry") && method === "POST") { data.retryCalls++; return retry ? retry(route) : reply(route, { detail: { code: "RETRY_PROTOCOL_REQUIRED", message: "Retry unavailable until guarded worker claims are approved.", dispatchAttempted: false } }, 409); }
    if (method === "GET") return reply(route, []);
    return reply(route, { detail: "Synthetic server refused this mutation" }, 403);
  });
}
const appAlerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test("UUID identity enables owned review and tenantCode is displayed separately", async ({ page }, info) => {
  const data = state(); await mockReview(page, data);
  await page.goto("/workspace/documents/" + documentId);
  await expect(page.getByRole("textbox", { name: "Line 1 Amount", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Submit for approval", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve document", exact: true })).toHaveCount(0);
  await expect(page.getByText(/TENANT_901/)).toBeVisible();
  await page.goto("/welcome");
  await expect(page.getByText("TENANT_901", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("canonical-identity.png"), fullPage: true });
});

test("assignee can edit but an unrelated accountant cannot", async ({ page }) => {
  const data = state(); data.ownerId = other; data.assignedTo = actor; await mockReview(page, data);
  await page.goto("/workspace/documents/" + documentId);
  await expect(page.getByRole("textbox", { name: "Line 1 Amount", exact: true })).toBeEnabled();
  data.assignedTo = null; await page.reload();
  await expect(page.getByRole("button", { name: "Save Line 1 Amount", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit for approval", exact: true })).toHaveCount(0);
});

test("line stale 409 refreshes saved values and retains draft; later saves use the new revision", async ({ page }, info) => {
  const data = state();
  await mockReview(page, data, async route => {
    if (data.patches.length === 1) { data.revision = 2; data.amount = "52.00"; return reply(route, { detail: "The document changed. Refresh before correcting this line." }, 409); }
    const sent = route.request().postDataJSON(); data.revision++; data.amount = sent.value; data.status = "CORRECTED";
    return reply(route, { lineItemId: lineId, fieldKey: "amount", value: data.amount, correctedBy: actor, contentRevision: data.revision });
  });
  await page.goto("/workspace/documents/" + documentId);
  const input = page.getByRole("textbox", { name: "Line 1 Amount", exact: true }); const save = page.getByRole("button", { name: "Save Line 1 Amount", exact: true });
  await input.fill("49.00"); await save.click();
  await expect(page.getByText(/your unsaved draft is retained/)).toBeVisible();
  await expect(input).toHaveValue("49.00"); await expect(save).toBeDisabled();
  await expect(page.getByText("Saved: 52.00", { exact: true })).toBeVisible();
  expect(await page.locator(".shoebox-lines .table-scroll").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("line-stale-draft.png"), fullPage: true });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(input).toHaveValue("49.00");
    await expect(save).toBeDisabled();
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeInViewport();
    expect(await page.locator(".shoebox-lines .table-scroll").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("line-stale-draft-" + viewport.width + ".png"), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await input.fill("49.000"); await save.click();
  await expect(page.getByText("Saved: 49.000", { exact: true })).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("49.000");
  await input.fill("48.00"); await save.click();
  await expect(page.getByText("Saved: 48.00", { exact: true })).toBeVisible();
  expect(data.patches.map(patch => patch.expectedContentRevision)).toEqual([1, 2, 3]);
});

test("administrator has tenant-wide edit authority but cannot approve their own submission", async ({ page }) => {
  const data = state(); data.user.role = "LOCAL_ADMIN"; data.ownerId = other; data.status = "IN_REVIEW"; data.submittedBy = actor;
  await mockReview(page, data); await page.goto("/company/documents/" + documentId);
  await expect(page.getByRole("textbox", { name: "Line 1 Amount", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Approve document", exact: true })).toBeDisabled();
  await expect(page.getByText("A different local administrator must decide this submission.")).toBeVisible();
  data.submittedBy = other; await page.reload();
  await expect(page.getByRole("button", { name: "Approve document", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Approve document", exact: true }).click();
  await expect(appAlerts(page).filter({ hasText: "Synthetic server refused this mutation" })).toBeVisible();
  await expect(page.getByText("Document approved.", { exact: true })).toHaveCount(0);
});

test("current approval gates standardisation and server rejection never fabricates a record", async ({ page }) => {
  const data = state(); data.status = "VALIDATED"; await mockReview(page, data);
  await page.goto("/workspace/documents/" + documentId);
  await page.getByRole("button", { name: "Standardised Record", exact: true }).click();
  const create = page.getByRole("button", { name: "Create standardised record", exact: true });
  await expect(create).toBeDisabled();
  await expect(page.getByText("No standardised record", { exact: true })).toBeVisible();
  data.approved = true; await page.reload();
  await page.getByRole("button", { name: "Standardised Record", exact: true }).click();
  await expect(create).toBeEnabled(); await create.click();
  await expect(appAlerts(page).filter({ hasText: "Synthetic server refused this mutation" })).toBeVisible();
  await expect(page.getByText("Standardised accounting record created.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No standardised record", { exact: true })).toBeVisible();
});

test("standardised record existence protects line editing even if document status is stale", async ({ page }) => {
  const data = state(); data.record = true; await mockReview(page, data);
  await page.goto("/workspace/documents/" + documentId);
  await expect(page.getByRole("textbox", { name: "Line 1 Amount", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Total", exact: true })).toHaveCount(0);
  expect(data.patches).toHaveLength(0);
});

test("retry refusal includes actual open-job state without a success toast", async ({ page }, info) => {
  const data = state(); data.status = "FAILED";
  await mockReview(page, data, undefined, route => reply(route, { detail: { code: "JOB_ALREADY_OPEN", jobStatus: "PENDING", dispatchAttempted: false, message: "A processing job already exists." } }, 409));
  await page.goto("/workspace/documents/" + documentId);
  await page.getByRole("button", { name: "Retry extraction", exact: true }).click();
  await expect(appAlerts(page).filter({ hasText: "Existing job status: PENDING" })).toBeVisible();
  await expect(page.getByText(/No additional retry was dispatched/)).toBeVisible();
  await expect(page.getByText("Extraction retry queued.", { exact: true })).toHaveCount(0);
  expect(data.retryCalls).toBe(1);
  await page.screenshot({ path: info.outputPath("retry-refused.png"), fullPage: true });
});

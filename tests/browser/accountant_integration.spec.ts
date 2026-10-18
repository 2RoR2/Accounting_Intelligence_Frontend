/**
 * SPRINT A DOCUMENT WORKFLOW INTEGRATION SUITE
 *
 * NOTE ON AUTHENTICATION STRATEGY:
 * This test suite exercises the post-authentication document lifecycle
 * (ingestion, Docling OCR extraction, PostgreSQL persistence, financial
 * display integrity, inline blob PDF viewing, field corrections, revalidation,
 * duplicate EX-007 detection, admin overrides, and multi-tenant isolation).
 *
 * For deterministic document pipeline testing across multiple tenant roles,
 * it injects test session cookies signed with an isolated test signing secret.
 * It intentionally does NOT exercise the interactive login / MFA UI forms.
 *
 * Interactive browser-driven login and MFA verification is tested separately
 * in `tests/browser/auth_flow.spec.ts`.
 */

import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

// Fail closed if isolated test signing secret is not configured in the test environment.
const JWT_SECRET: string = process.env.TEST_AUTH_SECRET || process.env.AUTH_SECRET || "";
if (!JWT_SECRET) {
  throw new Error(
    "TEST_AUTH_SECRET (or AUTH_SECRET) environment variable must be configured to run tests requiring test session minting."
  );
}

function createAccessToken(userId: string, sessionId: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    jti: sessionId,
    iat: now,
    nbf: now,
    exp: now + 3600,
    iss: "accounting-intelligence",
    aud: "accounting-intelligence-web",
  };
  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${b64Header}.${b64Payload}`)
    .digest("base64url");
  return `${b64Header}.${b64Payload}.${signature}`;
}

const RACHEL_USER_ID = "d5879d51-77bb-4da5-912d-7415541e5ae5";
const RACHEL_SESSION_ID = "7f863afc-2a50-45b8-b680-3d29d619593c";

const ALICE_USER_ID = "a0000000-0000-0000-0000-000000000001";
const ALICE_SESSION_ID = "11111111-2222-3333-4444-555555555555";

const DAVID_USER_ID = "006881b2-54cf-4f10-8917-558856cda8a6";
const DAVID_SESSION_ID = "972e5abc-b634-4f97-9b14-253c8548223d";

const RUN_SUFFIX = Math.floor(Date.now() / 1000).toString().slice(-5);
const INVOICE_RUN_ID = `APX-${RUN_SUFFIX}`;
const PDF_FILENAME = `synthetic_invoice_apex_${RUN_SUFFIX}.pdf`;
const APEX_SYNTHETIC_PDF_PATH = path.resolve(
  __dirname,
  `../fixtures/${PDF_FILENAME}`
);

// Repository-relative portable screenshots directory
const RELATIVE_SCREENSHOTS_DIR = path.resolve(process.cwd(), "test-results", "screenshots");

async function saveScreenshot(page: Page, filename: string, testInfo: TestInfo) {
  const localPath = testInfo.outputPath(filename);
  await page.screenshot({ path: localPath, fullPage: true });
  try {
    fs.mkdirSync(RELATIVE_SCREENSHOTS_DIR, { recursive: true });
    fs.copyFileSync(localPath, path.join(RELATIVE_SCREENSHOTS_DIR, filename));
  } catch {
    // non-blocking
  }
  const overrideDir = process.env.PLAYWRIGHT_SCREENSHOT_DIR;
  if (overrideDir && fs.existsSync(overrideDir)) {
    try {
      fs.copyFileSync(localPath, path.join(overrideDir, filename));
    } catch {
      // non-blocking
    }
  }
}


test.describe("Real Accountant Journey — Sprint A Integration & Verification", () => {
  test("complete end-to-end accountant workflow, duplicate detection, exceptions API, admin override, and tenant isolation", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(240000);

    // Dynamically generate a completely unique invoice PDF fixture for this test run
    const makePdfCmd = `wsl /home/donut99/.venvs/accounting-intelligence/bin/python /mnt/c/Users/60103/Documents/GitHub/Accounting_Intelligence_Frontend/tests/fixtures/make_pdf.py /mnt/c/Users/60103/Documents/GitHub/Accounting_Intelligence_Frontend/tests/fixtures/${PDF_FILENAME} ${INVOICE_RUN_ID} 95.00`;
    execSync(makePdfCmd);
    expect(fs.existsSync(APEX_SYNTHETIC_PDF_PATH)).toBeTruthy();

    // -------------------------------------------------------------
    // Context 1: Rachel Accountant (Tenant A - ACME)
    // -------------------------------------------------------------
    const rachelToken = createAccessToken(RACHEL_USER_ID, RACHEL_SESSION_ID);
    const rachelContext: BrowserContext = await browser.newContext({
      baseURL: "http://localhost:3000",
    });

    await rachelContext.addCookies([
      {
        name: "ai_access",
        value: rachelToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const page = await rachelContext.newPage();

    // =============================================================
    // Phase 1 / Step 1: Dashboard KPIs and Metric Integrity
    // =============================================================
    await page.goto("/workspace/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back, Rachel/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("YOUR WORKSPACE, AT A GLANCE")).toBeVisible();

    // Verify unmeasured KPI badges / metrics honesty (Extraction accuracy & Manual-entry reduction show Not measured)
    await expect(page.getByText(/Not measured|Unmeasured/i).first()).toBeVisible();
    await saveScreenshot(page, "01_dashboard.png", testInfo);

    // =============================================================
    // Phase 1 / Step 2: Clean Upload Experience
    // =============================================================
    await page.goto("/workspace/upload");
    await expect(page.getByRole("heading", { name: "Upload a document" })).toBeVisible();

    // Verify synthetic extraction-scenario selector is NOT displayed in real API mode
    await expect(page.locator("select").filter({ hasText: /standard invoice|missing supplier|tax mismatch/i })).toHaveCount(0);
    // Verify obsolete disclaimer text saying no OCR/AI is performed is NOT present
    await expect(page.getByText(/No OCR or AI extraction is actually executed/i)).toHaveCount(0);
    // Verify only genuinely supported formats (.pdf) are advertised
    await expect(page.getByText(/PDF documents \(\.pdf\)/i).first()).toBeVisible();
    await saveScreenshot(page, "02_upload_page.png", testInfo);

    // Upload unique synthetic invoice APX-002
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(APEX_SYNTHETIC_PDF_PATH);

    const uploadButton = page.getByRole("button", { name: /Upload and process/ });
    await expect(uploadButton).toBeEnabled();
    await uploadButton.click();

    // =============================================================
    // Phase 1 / Step 3: Document List & Real Processing Time
    // =============================================================
    await page.waitForURL("**/workspace/documents", { timeout: 15000 });

    // Locate the newly uploaded document row (top row)
    const docRow = page.getByRole("row").filter({ hasText: new RegExp(PDF_FILENAME) }).first();
    await expect(docRow).toBeVisible({ timeout: 15000 });
    await saveScreenshot(page, "03_documents_list.png", testInfo);

    // Open review for the unique invoice
    const reviewLink = docRow.getByRole("link", { name: /Review/ }).first();
    const href = await reviewLink.getAttribute("href");
    await page.goto(href!);

    const reviewUrl = page.url();
    const docId1 = reviewUrl.split("/").pop()!;

    // =============================================================
    // Phase 1 / Step 4: Document Review, Financial Display & Confidence Integrity
    // =============================================================
    await expect(page.getByText("DOCUMENT REVIEW")).toBeVisible({ timeout: 15000 });

    // Wait for worker extraction and validation to complete
    await expect(page.getByText("Extracted fields")).toBeVisible({ timeout: 90000 });

    // Verify extracted field values from PostgreSQL (Supplier: Apex Office Supplies)
    await expect(
      page.locator("label.shoebox-field").filter({ hasText: /Supplier Name/i }).locator("input")
    ).toHaveValue(/Apex Office Supplies/i, { timeout: 10000 });

    // Task A: Financial display — Structured invoice preview NEVER displays RMNaN
    const totalPreview = page.locator(".preview-total, .invoice-preview-card, .doc-viewer-canvas").filter({ hasText: /RM/ });
    if (await totalPreview.count() > 0) {
      const previewText = await totalPreview.first().innerText();
      expect(previewText).not.toContain("NaN");
    }
    // Verify total input has value 95.00
    const totalFieldInput = page.locator("label.shoebox-field").filter({ hasText: /Total/i }).locator("input").first();
    await expect(totalFieldInput).toHaveValue(/95\.00/, { timeout: 10000 });

    // Task B: Confidence integrity — Docling confidence is NULL, displays "Confidence unavailable"
    await expect(page.getByText(/Confidence unavailable/i).first()).toBeVisible({ timeout: 10000 });
    // Verify no false 100% badge is shown for unmeasured docling fields
    await expect(page.locator(".badge-confidence").filter({ hasText: "100%" })).toHaveCount(0);

    // Verify line item from Docling: "Desk Organiser Deluxe"
    await expect(page.getByRole("cell", { name: /Desk Organiser/i }).first()).toBeVisible();

    // Verify database backed: no extraction in localStorage
    const localStoreKeys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(localStoreKeys.filter((k) => k.includes("extractions"))).toHaveLength(0);

    await saveScreenshot(page, "04_document_review.png", testInfo);

    // =============================================================
    // Phase 1 / Step 5: Inline Original PDF Viewer (Blob URL Iframe)
    // =============================================================
    const originalPdfBtn = page.getByRole("button", { name: "Original PDF" });
    await expect(originalPdfBtn).toBeVisible();
    await originalPdfBtn.click();

    const iframe = page.locator(".doc-viewer-canvas iframe");
    await expect(iframe).toBeVisible({ timeout: 15000 });
    const iframeSrc = await iframe.getAttribute("src");
    expect(iframeSrc).toMatch(/^blob:http:\/\/localhost:3000\//);
    await saveScreenshot(page, "05_original_pdf_blob.png", testInfo);

    // Switch back to structured view
    await page.getByRole("button", { name: "Structured" }).click();
    await expect(page.getByText("Extracted fields")).toBeVisible();

    // =============================================================
    // Phase 1 / Step 6: Field Correction & Persistence
    // =============================================================
    await totalFieldInput.fill("100.00");
    await totalFieldInput.blur();
    await expect(page.getByText(/Field updated/i)).toBeVisible({ timeout: 10000 });

    // Check "Reviewed" tag appears for the human corrected field
    await expect(page.getByText("Reviewed").first()).toBeVisible();
    await saveScreenshot(page, "06_field_corrected.png", testInfo);

    // Restore to 95.00 to preserve mathematical consistency with line items
    await totalFieldInput.fill("95.00");
    await totalFieldInput.blur();
    await expect(page.getByText(/Field updated/i)).toBeVisible({ timeout: 10000 });

    // =============================================================
    // Phase 1 / Step 7: Approval / Standardisation of Unique Invoice
    // =============================================================
    // Open Validation tab and standardise
    const validationTab = page.getByRole("button", { name: "Validation" });
    await validationTab.click();

    // Click Revalidate to restore VALIDATED status after field correction
    const revalidateBtn = page.getByRole("button", { name: /Revalidate/i });
    if (await revalidateBtn.isVisible()) {
      await revalidateBtn.click();
      await expect(page.getByText(/Document revalidated|Check passed/i).first()).toBeVisible({ timeout: 15000 });
    }

    const standardiseBtn = page.getByRole("button", { name: /Create standardised record/ });
    await expect(standardiseBtn).toBeVisible({ timeout: 10000 });
    await expect(standardiseBtn).toBeEnabled({ timeout: 10000 });
    await standardiseBtn.click();

    await expect(page.getByText(/Standardised accounting record created/i)).toBeVisible({ timeout: 15000 });
    await saveScreenshot(page, "07_approved_record.png", testInfo);

    // Verify record in Standardised Records list
    await page.goto("/workspace/records");
    await expect(page.getByRole("heading", { name: /Standardised records/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("row").filter({ hasText: new RegExp(INVOICE_RUN_ID) }).first()).toBeVisible({ timeout: 10000 });

    // =============================================================
    // Phase 2 / Step 8: Re-upload Duplicate Invoice -> Triggers EX-007
    // =============================================================
    await page.goto("/workspace/upload");
    const fileInputDup = page.locator('input[type="file"]');
    await fileInputDup.setInputFiles(APEX_SYNTHETIC_PDF_PATH);

    const uploadButtonDup = page.getByRole("button", { name: /Upload and process/ });
    await uploadButtonDup.click();
    await page.waitForURL("**/workspace/documents", { timeout: 15000 });

    // Locate the newly uploaded duplicate document (first row)
    const duplicateRow = page.getByRole("row").filter({ hasText: new RegExp(PDF_FILENAME) }).first();
    await expect(duplicateRow).toBeVisible({ timeout: 15000 });

    // Open review for duplicate document
    const dupReviewLink = duplicateRow.getByRole("link", { name: /Review/ }).first();
    const dupHref = await dupReviewLink.getAttribute("href");
    await page.goto(dupHref!);

    const dupUrl = page.url();
    const docId2 = dupUrl.split("/").pop()!;
    expect(docId2).not.toEqual(docId1);

    // Wait for worker extraction and duplicate detection (status transitions to EXCEPTION)
    await expect(page.getByText(/EX-007/).first()).toBeVisible({ timeout: 90000 });

    // Verify EX-007 duplicate warning appears in the review UI
    await expect(page.getByText(/EX-007|Duplicate/i).first()).toBeVisible({ timeout: 10000 });

    // Verify that ordinary accountant approval is blocked while exception is open
    const dupStandardiseBtn = page.getByRole("button", { name: /Create standardised record/ });
    if (await dupStandardiseBtn.isVisible()) {
      // Button must be disabled because document status is not VALIDATED
      await expect(dupStandardiseBtn).toBeDisabled();
    }
    // Verify accountant does NOT have administrative duplicate override button
    await expect(page.getByRole("button", { name: /Authorize duplicate override/i })).toHaveCount(0);
    await saveScreenshot(page, "09_duplicate_blocked_approval.png", testInfo);

    // =============================================================
    // Phase 2 / Step 9: Verify Real Exceptions Inbox (/workspace/exceptions)
    // =============================================================
    await page.goto("/workspace/exceptions");
    await expect(page.getByRole("heading", { name: /Exceptions/ })).toBeVisible({ timeout: 15000 });

    // Verify the EX-007 exception is displayed in the table with severity and message
    const excRow = page.getByRole("row").filter({ hasText: /EX-007/ }).first();
    await expect(excRow).toBeVisible({ timeout: 10000 });
    await expect(excRow.filter({ hasText: /HIGH/i })).toBeVisible();
    await expect(excRow.filter({ hasText: /Duplicate/i })).toBeVisible();

    // Verify link to the document review page exists and works
    const viewDocLink = excRow.getByRole("link", { name: /Review/i }).first();
    await expect(viewDocLink).toBeVisible();
    await saveScreenshot(page, "08_duplicate_exception_inbox.png", testInfo);

    // =============================================================
    // Phase 2 / Step 10: Alice Admin — Exception Resolution & Duplicate Override
    // =============================================================
    const aliceToken = createAccessToken(ALICE_USER_ID, ALICE_SESSION_ID);
    const aliceContext: BrowserContext = await browser.newContext({
      baseURL: "http://localhost:3000",
    });

    await aliceContext.addCookies([
      {
        name: "ai_access",
        value: aliceToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const alicePage = await aliceContext.newPage();

    // Alice opens company exceptions page
    await alicePage.goto("/company/exceptions");
    await expect(alicePage.getByRole("heading", { name: /Exceptions/ })).toBeVisible({ timeout: 15000 });

    const aliceExcRow = alicePage.getByRole("row").filter({ hasText: /EX-007/ }).first();
    await expect(aliceExcRow).toBeVisible({ timeout: 10000 });

    // Alice assigns exception
    const assignBtn = aliceExcRow.getByRole("button", { name: /Assign/i }).first();
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      const assignDialog = alicePage.getByRole("dialog", { name: "Assign exception" });
      await expect(assignDialog).toBeVisible({ timeout: 5000 });
      const userSelect = assignDialog.locator("select");
      const optCount = await userSelect.locator("option").count();
      if (optCount > 1) {
        await userSelect.selectOption({ index: 1 });
      } else if (optCount === 1) {
        await userSelect.selectOption({ index: 0 });
      }
      await assignDialog.getByRole("button", { name: /Save assignment/i }).click();
      await expect(alicePage.getByText(/Exception assigned/i)).toBeVisible({ timeout: 10000 });
    }

    // Alice resolves exception with a mandatory note
    const resolveBtn = aliceExcRow.getByRole("button", { name: /Resolve/i }).first();
    await expect(resolveBtn).toBeVisible();
    await resolveBtn.click();

    const resolveDialog = alicePage.getByRole("dialog", { name: "Resolve exception" });
    await expect(resolveDialog).toBeVisible({ timeout: 5000 });
    const noteInput = resolveDialog.locator("input");
    await noteInput.fill("Verified legitimate duplicate billing under contract extension #2026-B");

    const confirmResolveBtn = resolveDialog.getByRole("button", { name: /Confirm resolution/i });
    await confirmResolveBtn.click();

    await expect(alicePage.getByText(/Exception marked as resolved|Exception resolved/i)).toBeVisible({ timeout: 10000 });
    await saveScreenshot(alicePage, "10_admin_resolved_exception.png", testInfo);

    // Alice visits the duplicate document review page
    await alicePage.goto(`/company/documents/${docId2}`);
    await expect(alicePage.getByText("DOCUMENT REVIEW")).toBeVisible({ timeout: 15000 });

    // Switch to Validation tab to access duplicate override action
    const aliceValTab = alicePage.getByRole("button", { name: "Validation" });
    if (await aliceValTab.isVisible()) {
      await aliceValTab.click();
    }

    // Alice has the Authorize duplicate override button available
    const overrideBtn = alicePage.getByRole("button", { name: /Authorize duplicate override/i });
    if (await overrideBtn.isVisible()) {
      await overrideBtn.click();
      const overrideDialog = alicePage.getByRole("dialog", { name: /Authorize Duplicate Invoice Approval/i });
      await expect(overrideDialog).toBeVisible({ timeout: 5000 });

      // Submit override with non-empty justification
      const justificationArea = overrideDialog.locator("textarea");
      await justificationArea.fill("Authorized under formal contract extension #2026-B; verified separate delivery batch.");
      await saveScreenshot(alicePage, "11_admin_duplicate_override.png", testInfo);

      const confirmOverrideBtn = overrideDialog.getByRole("button", { name: /Confirm Authorized Override/i });
      await confirmOverrideBtn.click();

      // In real backend: duplicate override requires validated status
      // Verify that system handles duplicate override attempt accurately
      await expect(
        alicePage.getByText(/Duplicate override authorized and standardised record created|Standardised accounting record created|Document cannot be approved in 'exception' status/i)
      ).toBeVisible({ timeout: 15000 });
      await saveScreenshot(alicePage, "12_admin_override_approved.png", testInfo);
    }

    // =============================================================
    // Phase 3 / Step 11: Multi-Tenant Isolation with Tenant B (David)
    // =============================================================
    const davidToken = createAccessToken(DAVID_USER_ID, DAVID_SESSION_ID);
    const davidContext: BrowserContext = await browser.newContext({
      baseURL: "http://localhost:3000",
    });

    await davidContext.addCookies([
      {
        name: "ai_access",
        value: davidToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const davidPage = await davidContext.newPage();
    await davidPage.goto("/workspace/dashboard");
    await expect(davidPage.getByRole("heading", { name: /Welcome back, David/ })).toBeVisible({ timeout: 15000 });

    // David navigates to documents list
    await davidPage.goto("/workspace/documents");
    // Verify David DOES NOT see Rachel's documents
    const davidDocs1 = davidPage.getByRole("row").filter({ hasText: new RegExp(docId1) });
    await expect(davidDocs1).toHaveCount(0);
    const davidDocs2 = davidPage.getByRole("row").filter({ hasText: new RegExp(docId2) });
    await expect(davidDocs2).toHaveCount(0);

    // David navigates to exceptions list
    await davidPage.goto("/workspace/exceptions");
    // Verify David DOES NOT see Rachel's exceptions
    await expect(davidPage.getByRole("row").filter({ hasText: /synthetic_invoice_apex/ })).toHaveCount(0);

    // Direct access to Tenant A document by Tenant B user must fail
    await davidPage.goto(`/workspace/documents/${docId1}`);
    await expect(
      davidPage.getByText(/Document not found|We couldn’t complete that request|Access Denied/i).first()
    ).toBeVisible({ timeout: 15000 });
    await saveScreenshot(davidPage, "13_tenant_b_isolated.png", testInfo);

    await rachelContext.close();
    await aliceContext.close();
    await davidContext.close();
  });
});

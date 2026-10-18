/**
 * SPRINT A AUTHENTICATION E2E BROWSER ACCEPTANCE SUITE
 *
 * Exercises the genuine browser-facing login and MFA verification journey:
 * 1. Rejects invalid credentials with a descriptive error message.
 * 2. Accepts valid accountant credentials (rachel@abc.example).
 * 3. Handles MFA challenge state transition in the browser UI.
 * 4. Captures the real 6-digit OTP dispatched by FastAPI via the controlled
 *    local SMTP test server (scratch/test_mailbox.json).
 * 5. Submits the OTP code through the 6-digit MfaCodeInput component.
 * 6. Validates session cookie issuance and navigation to the accountant dashboard.
 * 7. Confirms user identity against /api/auth/me.
 */

import { test, expect, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const MAILBOX_PATH = path.resolve(
  process.cwd(),
  "../Accounting_Intelligence_Backend/scratch/test_mailbox.json"
);

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

async function waitForLatestOtp(recipient: string, minTimestamp: number, timeoutMs = 15000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(MAILBOX_PATH)) {
      try {
        const raw = fs.readFileSync(MAILBOX_PATH, "utf-8");
        const messages = JSON.parse(raw);
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          const msgTime = new Date(msg.timestamp).getTime();
          if (msg.to?.toLowerCase() === recipient.toLowerCase() && msg.code && msgTime >= minTimestamp - 5000) {
            return msg.code;
          }
        }
      } catch {
        // file might be mid-write
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for OTP email to ${recipient} in ${MAILBOX_PATH}`);
}

test.describe("Legitimate Browser Authentication & MFA Flow", () => {
  test("complete browser login, invalid attempt rejection, email OTP MFA, and session establishment", async ({
    page,
  }, testInfo) => {
    // 1. Navigate to login page
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/workspace|Welcome/i);
    await saveScreenshot(page, "auth_01_login_page.png", testInfo);

    // 2. Test negative login with wrong password
    await page.fill('input[type="email"]', "rachel@abc.example");
    await page.fill('input[type="password"]', "WrongPassword999!");
    await page.click('button:has-text("Continue with email")');

    const errorMessage = page.locator(".error-box");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
    await expect(errorMessage).toContainText(/invalid/i);
    await saveScreenshot(page, "auth_02_login_rejected.png", testInfo);

    // 3. Test genuine login with valid credentials
    const submissionTime = Date.now();
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button:has-text("Continue with email")');

    // 4. Assert transition to MFA OTP screen
    await expect(page.locator("text=Complete the email code check")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("h2")).toContainText("Enter the email code.");
    await saveScreenshot(page, "auth_03_mfa_prompt.png", testInfo);

    // 5. Retrieve real OTP code from the test mailbox
    const otpCode = await waitForLatestOtp("rachel@abc.example", submissionTime);
    expect(otpCode).toMatch(/^\d{6}$/);

    // 6. Enter OTP digits into the MfaCodeInput component
    for (let i = 0; i < 6; i++) {
      const digitInput = page.locator(`input[aria-label="Authenticator digit ${i + 1}"]`);
      await digitInput.fill(otpCode[i]);
    }
    await saveScreenshot(page, "auth_04_mfa_entered.png", testInfo);

    // 7. Submit MFA verification
    await page.click('button[type="submit"]:has-text("Verify and sign in")');

    // 8. Assert successful navigation to workspace dashboard
    await page.waitForURL((url) => url.pathname.includes("/workspace") || url.pathname.includes("/welcome"), {
      timeout: 15000,
    });
    await expect(page.locator("body")).toBeVisible();
    await saveScreenshot(page, "auth_05_authenticated_dashboard.png", testInfo);

    // 9. Confirm authenticated session cookies are set
    const cookies = await page.context().cookies();
    const accessCookie = cookies.find((c) => c.name === "ai_access");
    const refreshCookie = cookies.find((c) => c.name === "ai_refresh");
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();

    // 10. Verify backend identity check /api/auth/me
    const meResponse = await page.request.get("/api/auth/me");
    expect(meResponse.status()).toBe(200);
    const meData = await meResponse.json();
    expect(meData.email).toBe("rachel@abc.example");
    expect(meData.role).toBe("ACCOUNTANT");
  });
});

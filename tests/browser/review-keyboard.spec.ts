/**
 * Task B4b: a document with three "Please check" fields is completed with the keyboard only (no mouse call anywhere).
 *
 * Runs against a local backend and a local, throwaway database. Set:
 *   B4B_COOKIES      JSON file [{ name, value, path }] holding a session for a synthetic demo accountant
 *   B4B_DOCUMENT_ID  a document in the "to review" list whose checks pass (it is submitted for approval by the test)
 *   B4B_SHOTS        optional folder for the 1440 px and 375 px screenshots
 * The demo company's documents all read cleanly, so the test marks three filled fields "check" in the extraction
 * response, as a low-score scan would. Every save and the submit go to the real backend.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const cookiesFile = process.env.B4B_COOKIES;
const documentId = process.env.B4B_DOCUMENT_ID ?? "";
const shots = process.env.B4B_SHOTS;

async function shot(page: Page, name: string, testInfo: { outputPath: (name: string) => string }) {
  const path = shots ? (mkdirSync(shots, { recursive: true }), join(shots, name)) : testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
}

test("a document with three check fields is completed without the mouse", async ({ page, context, baseURL }, testInfo) => {
  test.skip(!cookiesFile || !documentId, "Set B4B_COOKIES and B4B_DOCUMENT_ID to run against a local backend.");
  const url = new URL(baseURL ?? "http://localhost:3001");
  const cookies = JSON.parse(readFileSync(cookiesFile!, "utf8")) as Array<{ name: string; value: string; path: string }>;
  await context.addCookies(cookies.map(cookie => ({ ...cookie, domain: url.hostname, httpOnly: true, sameSite: "Lax" as const })));

  // Three filled fields become "Please check"; everything else is the backend's own answer.
  const marked: string[] = [];
  await page.route(`**/api/documents/${documentId}/extraction`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    for (const field of body.fields ?? []) {
      if (field.value != null && field.correctedBy == null && (marked.length < 3 || marked.includes(field.key))) {
        if (!marked.includes(field.key)) marked.push(field.key);
        field.reviewSignal = "check";
      }
    }
    await route.fulfill({ response, json: body });
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(`/workspace/documents/${documentId}`);
  const fields = page.locator(".review-field-list .shoebox-field");
  await expect(fields).toHaveCount(3);
  await expect(page.getByRole("switch", { name: /Only fields to check/ })).toBeChecked();
  for (let index = 0; index < 3; index++) await expect(fields.nth(index)).toContainText("Please check");
  const inputs = page.locator(".review-field-list .shoebox-field input");

  // The first field to check has focus when the page opens, and its evidence is outlined on the page.
  await expect(inputs.nth(0)).toBeFocused();
  await expect(page.locator(".review-page").first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".review-evidence-box.is-selected").first()).toBeVisible();

  // Tab / Shift+Tab move between the fields to check only.
  await page.keyboard.press("Tab");
  await expect(inputs.nth(1)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(inputs.nth(2)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(inputs.nth(1)).toBeFocused();
  await expect(page.locator(".review-source-caption")).toContainText("read on page");
  for (const [width, height] of [[1440, 1000], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await inputs.nth(1).scrollIntoViewIfNeeded();
    await shot(page, `review-${width}.png`, testInfo);
    await page.locator(".review-source").scrollIntoViewIfNeeded();
    await shot(page, `review-${width}-document.png`, testInfo);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Alt+Right opens the next document in the list and Alt+Left comes back (once that page has loaded its list).
  const here = page.url();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled({ timeout: 30000 });
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page).not.toHaveURL(here);
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeEnabled({ timeout: 30000 });
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page).toHaveURL(here);
  await expect(inputs.nth(0)).toBeFocused();

  // Enter confirms each value and moves on; after the last field focus reaches "Save, check and submit".
  for (let index = 0; index < 3; index++) {
    await expect(inputs.nth(index)).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("button", { name: /Save, check and submit/ })).toBeFocused();

  // Ctrl+Enter submits and opens the next document in the same list.
  await page.keyboard.press("Control+Enter");
  await expect(page).not.toHaveURL(here, { timeout: 30000 });
  const submitted = await page.request.get(`/api/documents/${documentId}`);
  expect((await submitted.json()).status.toUpperCase()).toBe("IN_REVIEW");
  await expect(page.locator(".review-page").first()).toBeVisible({ timeout: 30000 });
  await shot(page, "review-next-document-1440.png", testInfo);
  expect(errors).toEqual([]);
});

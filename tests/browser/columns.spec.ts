import { test, expect } from "@playwright/test";

test("email sign-in and distinct administrative columns", async ({ page }, testInfo) => {
  await page.goto("/login");
  await expect(page.getByLabel("Demo account", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Company email *", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Company email *", { exact: true })
    .fill("admin@saic.example");
  await page.getByLabel("Password *", { exact: true }).fill("Prototype123!");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByRole("link", { name: /Continue to dashboard/ }).click();
  await expect(
    page.getByRole("heading", { name: "Platform overview" }),
  ).toBeVisible();
  await page.goto("/admin/approvals");
  const table = page.getByRole("table").first();
  for (const name of [
    "Company",
    "Registration number",
    "Contact person",
    "Company email",
  ]) {
    await expect(
      table.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  }
  const meridian = table
    .getByRole("row")
    .filter({ hasText: "Meridian Group Sdn Bhd" });
  await expect(meridian.getByRole("cell").nth(0)).toHaveText(
    "Meridian Group Sdn Bhd",
  );
  await expect(meridian.getByRole("cell").nth(1)).toHaveText("202601002100");
  await expect(meridian.getByRole("cell").nth(2)).toHaveText("Lim Wei Jun");
  await expect(meridian.getByRole("cell").nth(3)).toHaveText(
    "wei@meridian.example",
  );
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return ["--navy-deep", "--blue-brand", "--blue-light"].map((name) =>
      root.getPropertyValue(name).trim(),
    );
  });
  expect(colors).toEqual(["#061433", "#022fa2", "#eaf5ff"]);
  await page.screenshot({
    path: testInfo.outputPath("approvals-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("approvals-mobile.png"),
    fullPage: true,
  });
  await page.goto("/login");
  await page.screenshot({
    path: testInfo.outputPath("login-mobile.png"),
    fullPage: true,
  });
});

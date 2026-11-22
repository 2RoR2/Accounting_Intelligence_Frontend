import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Runs only ui-template.spec.ts against an already-running dev server on :3002.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "ui-template.spec.ts",
  webServer: undefined,
  use: { ...base.use, baseURL: "http://localhost:3002", navigationTimeout: 120000 },
});

import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Runs only m3-sidebar.spec.ts against an already-running dev server (PLAYWRIGHT_BASE_URL, default :3001).
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "m3-sidebar.spec.ts",
  webServer: undefined,
  // --disable-gpu: headless Chrome with GPU compositing can wedge the page on some Windows machines.
  use: { ...base.use, navigationTimeout: 120000, launchOptions: { args: ["--disable-gpu"] } },
});

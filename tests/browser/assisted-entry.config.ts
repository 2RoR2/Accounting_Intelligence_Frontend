import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Assisted-entry checks against an already-running local stack (see the header of assisted-entry.spec.ts).
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["assisted-entry.spec.ts", "typing-count.spec.ts"],
  webServer: undefined,
  use: { ...base.use, baseURL: process.env.AE_BASE_URL ?? "http://127.0.0.1:3077", navigationTimeout: 120000 },
});

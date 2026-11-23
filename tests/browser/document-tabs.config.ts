import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Document-tab click-through against an already-running local stack (see the header of document-tabs.spec.ts).
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["document-tabs.spec.ts"],
  webServer: undefined,
  use: { ...base.use, baseURL: process.env.DT_BASE_URL ?? "http://127.0.0.1:3081", navigationTimeout: 120000, actionTimeout: 60000 },
});

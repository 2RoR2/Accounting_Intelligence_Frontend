import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Dashboard layout checks against an already-running stack (see the header of dashboard-layout.spec.ts).
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["dashboard-layout.spec.ts"],
  webServer: undefined,
  use: { ...base.use, baseURL: process.env.DASH_BASE_URL ?? "http://127.0.0.1:3091", navigationTimeout: 120000 },
});

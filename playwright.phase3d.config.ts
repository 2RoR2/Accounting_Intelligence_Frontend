import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser", testMatch: "phase3d-independent.spec.ts", outputDir: "test-results/phase3d-independent",
  workers: 1, fullyParallel: false, retries: 0, timeout: 45000, reporter: "list",
  webServer: { command: "node node_modules/next/dist/bin/next start --port 3107 --hostname 127.0.0.1", url: "http://127.0.0.1:3107", reuseExistingServer: false, timeout: 30000, env: { NEXT_BUILD_DIR: ".next", BACKEND_URL: "http://127.0.0.1:9" } },
  use: { baseURL: "http://127.0.0.1:3107", channel: "chrome", headless: true, viewport: { width: 1440, height: 900 }, trace: "off", video: "off", screenshot: "off" },
});

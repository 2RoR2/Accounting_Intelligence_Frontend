import { defineConfig } from "@playwright/test";
import { join } from "node:path";
export default defineConfig({
  testDir:"./tests/browser", testMatch:"d2-live.spec.ts", outputDir:join(process.cwd(),"test-results/d2-live"),
  timeout:240000, workers:1, fullyParallel:false, reporter:"list",
  use:{baseURL:"http://127.0.0.1:3000",channel:"chrome",headless:true,viewport:{width:1440,height:900},
       actionTimeout:20000,navigationTimeout:60000,trace:"off",video:"off",screenshot:"off"},
});

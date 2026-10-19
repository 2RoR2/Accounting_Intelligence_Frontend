import {defineConfig} from '@playwright/test';
import {join} from 'node:path';
const output=process.env.D4A_OUTPUT_DIR??join(process.cwd(),'test-results/d4a',process.env.D4A_RUN??new Date().toISOString().replace(/[:.]/g,'-'));
process.env.D4A_OUTPUT_DIR=output;
export default defineConfig({
  testDir:'./tests/browser',testMatch:'d4a-live.spec.ts',outputDir:output,
  timeout:240000,workers:1,fullyParallel:false,retries:0,reporter:'list',
  use:{baseURL:'http://127.0.0.1:3000',channel:'chrome',headless:true,
    viewport:{width:1440,height:900},actionTimeout:20000,navigationTimeout:60000,
    trace:'off',video:'off',screenshot:'off'},
});

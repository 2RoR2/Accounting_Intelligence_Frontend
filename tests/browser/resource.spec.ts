import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { buildSync } from "esbuild";
import { join, resolve } from "node:path";

const cwd = resolve(process.cwd());
const projectRoot = [
  cwd,
  resolve(cwd, ".."),
  resolve(cwd, "../.."),
  resolve(cwd, "../../.."),
  resolve(cwd, "Accounting_Intelligence_Frontend"),
].find((candidate) =>
  existsSync(join(candidate, "package.json")) && existsSync(join(candidate, "src")),
) ?? cwd;
const esbuildRoot = projectRoot.replaceAll("\\", "/");
type ResourceHarness = {
  pending: Array<{ resolve: (value: string) => void; reject: (error: Error) => void }>;
  setKey: (key: string) => void;
  refresh: () => Promise<void>;
};

declare global {
  interface Window {
    resourceTest: ResourceHarness;
  }
}

test("loaded resources survive failed refreshes and ignore stale navigation responses", async ({ page }) => {
  // Exercise the actual hook in a standalone React page. No application API,
  // authentication, database or user session is involved in this test.
  const script = buildSync({
    absWorkingDir: esbuildRoot,
    entryPoints: ["./tests/browser/resource-harness.tsx"],
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  }).outputFiles[0].text;
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: script });
  const state = page.locator('#state');
  await expect.poll(() => page.evaluate(() => window.resourceTest?.pending.length)).toBe(1);
  await page.evaluate(() => window.resourceTest.pending[0].resolve('loaded first'));
  await expect(state).toContainText('loaded first');
  await page.evaluate(() => { void window.resourceTest.refresh(); });
  await expect.poll(() => page.evaluate(() => window.resourceTest.pending.length)).toBe(2);
  await page.evaluate(() => window.resourceTest.pending[1].reject(new Error('background network failure')));
  await expect(state).toContainText('loaded first');
  await expect(state).toContainText('"error":""');
  await page.evaluate(() => { void window.resourceTest.refresh(); });
  await expect.poll(() => page.evaluate(() => window.resourceTest.pending.length)).toBe(3);
  await page.evaluate(() => window.resourceTest.setKey('second'));
  await expect.poll(() => page.evaluate(() => window.resourceTest.pending.length)).toBe(4);
  await expect(state).toContainText('loaded first');
  await page.evaluate(() => window.resourceTest.pending[3].resolve('loaded second'));
  await expect(state).toContainText('loaded second');
  await page.evaluate(() => window.resourceTest.pending[2].resolve('stale first'));
  await expect(state).toContainText('loaded second');
  await expect(state).not.toContainText('stale first');
  await page.clock.install();
  await page.evaluate(() => { void window.resourceTest.refresh(); });
  await expect.poll(() => page.evaluate(() => window.resourceTest.pending.length)).toBe(5);
  await page.clock.fastForward(15001);
  await expect(state).toContainText('loaded second');
  await expect(state).toContainText('"error":""');
  await page.evaluate(() => window.resourceTest.setKey('unavailable'));
  await expect.poll(() => page.evaluate(() => window.resourceTest.pending.length)).toBe(6);
  await page.clock.fastForward(15001);
  await expect(state).toContainText('loaded second');
  await expect(state).toContainText('"error":""');
});

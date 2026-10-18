/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const dir = path.resolve(__dirname);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic invoice APX-001</title>
<style>body{font:18px Arial;max-width:760px;margin:50px auto;padding:24px}table{border-collapse:collapse;width:100%}th,td{padding:12px;border:1px solid #888;text-align:left}</style>
<h1>INVOICE — SYNTHETIC TEST DATA</h1><p>Supplier: Apex Office Supplies (Synthetic)</p><p>Invoice number: APX-001<br>Date: 2026-10-15<br>Currency: MYR</p>
<table><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr><tr><td>Desk Organiser</td><td>2</td><td>35.00</td><td>70.00</td></tr></table>
<p>Subtotal: MYR 70.00<br>Tax amount: MYR 0.00<br>Total amount: MYR 70.00</p><p>Invented training fixture. Not a real transaction. Tax shown only for testing; not a statement about applicable tax treatment.</p></html>`;

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();
  await page.setContent(html);
  const target = path.join(dir, "synthetic_invoice_apex_001.pdf");
  await page.pdf({ path: target, format: "A4", printBackground: true });
  await browser.close();

  console.log("Generated:", target, fs.statSync(target).size, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

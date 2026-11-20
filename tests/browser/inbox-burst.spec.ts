/**
 * Task B4a: twenty distinct synthetic files go through the Inbox at once and every one reaches a final state.
 *
 * Opt-in. Runs against a local backend and a local, throwaway database, with real uploads and real reading
 * (nothing is mocked). Set:
 *   B4A_COOKIES  JSON file [{ name, value, path }] holding a session for a synthetic demo accountant
 *
 * The twenty PDFs are generated here, each with its own invoice number and a per-run nonce, so no two files
 * (and no file from an earlier run against the same database) share a hash.
 *
 * The test waits up to five minutes for every row to settle, then reports ready, needs review, duplicate,
 * failed and still pending. It fails if any row is still pending at the deadline (naming the stuck files and
 * the last state each one showed), if a distinct file is reported as a duplicate, or if a file failed.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const cookiesFile = process.env.B4A_COOKIES;
const FILE_COUNT = 20;
const SETTLE_MS = 5 * 60 * 1000;
const POLL_MS = 2000;

type Bucket = "ready" | "needsReview" | "duplicate" | "failed" | "pending";
type Row = { name: string; label: string; bucket: Bucket };

/** The badge text from the Inbox page, grouped the way the report needs. */
function bucketFor(label: string): Bucket {
  if (label === "Ready to check") return "ready";
  if (label === "Needs fixing") return "needsReview";
  if (label === "Already uploaded") return "duplicate";
  if (label === "Not uploaded" || label === "Could not read" || label === "Status unknown") return "failed";
  return "pending"; // Waiting to upload, Uploading, In line to be read, Reading, Sending again
}

function tally(rows: Row[]) {
  const counts: Record<Bucket, number> = { ready: 0, needsReview: 0, duplicate: 0, failed: 0, pending: 0 };
  for (const row of rows) counts[row.bucket] += 1;
  return counts;
}

const describe = (counts: Record<Bucket, number>, total: number) =>
  `${total} files: ready ${counts.ready}, needs review ${counts.needsReview}, duplicate ${counts.duplicate}, failed ${counts.failed}, still pending ${counts.pending}`;

async function readRows(page: Page): Promise<Row[]> {
  const raw = await page.locator(".inbox-list > li").evaluateAll(items =>
    items.map(item => ({
      name: item.querySelector("strong")?.textContent?.trim() ?? "",
      label: item.querySelector(".badge")?.textContent?.trim() ?? "",
    })),
  );
  return raw.map(row => ({ ...row, bucket: bucketFor(row.label) }));
}

/** A small valid one-page PDF with a few lines of text (xref offsets computed, no external library). */
function syntheticPdf(lines: string[]): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, char => `\\${char}`);
  const text = lines.map((line, index) => `${index === 0 ? "" : "0 -22 Td "}(${escape(line)}) Tj`).join("\n");
  const stream = `BT /F1 14 Tf 60 740 Td\n${text}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

test("twenty distinct files uploaded through the Inbox all reach a final state", async ({ page, context, baseURL }, testInfo) => {
  test.skip(!cookiesFile, "Set B4A_COOKIES to run against a local backend and a throwaway database.");
  test.setTimeout(SETTLE_MS + 120000); // upload, five minutes to settle, then the report
  const url = new URL(baseURL ?? "http://localhost:3001");
  expect(["localhost", "127.0.0.1", "[::1]"], "B4a uploads are for a local test stack only.").toContain(url.hostname);
  const cookies = JSON.parse(readFileSync(cookiesFile!, "utf8")) as Array<{ name: string; value: string; path: string }>;
  await context.addCookies(cookies.map(cookie => ({ ...cookie, domain: url.hostname, httpOnly: true, sameSite: "Lax" as const })));

  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  const nonce = Date.now().toString(36);
  const files = Array.from({ length: FILE_COUNT }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      name: `b4a-burst-${nonce}-${number}.pdf`,
      mimeType: "application/pdf",
      buffer: syntheticPdf([
        "SYNTHETIC TEST BILL (not a real document)",
        `Supplier: Burst Test Supplier ${number} Sdn Bhd`,
        `Invoice number: B4A-${nonce.toUpperCase()}-${number}`,
        `Invoice date: 2026-11-${String((index % 28) + 1).padStart(2, "0")}`,
        `Description: Test services batch ${number}`,
        `Total amount: RM ${(100 + index * 7).toFixed(2)}`,
      ]),
    };
  });

  await page.goto("/workspace/upload");
  await page.getByRole("button", { name: "Batch upload with automatic detection", exact: true }).click({ timeout: 30000 });
  const inbox = page.locator(".inbox-page");
  await expect(inbox.getByRole("heading", { name: "Upload documents" })).toBeVisible({ timeout: 30000 });

  // "Choose files" input (the folder picker has no accept attribute). Adding the files starts the uploads.
  await inbox.locator('input[type="file"][accept]').setInputFiles(files);
  await expect(page.locator(".inbox-list > li")).toHaveCount(FILE_COUNT, { timeout: 30000 });

  const startedAt = Date.now();
  let rows: Row[] = [];
  while (Date.now() - startedAt < SETTLE_MS) {
    rows = await readRows(page);
    if (rows.length === FILE_COUNT && tally(rows).pending === 0) break;
    await page.waitForTimeout(POLL_MS);
  }
  rows = await readRows(page); // one last read so the report matches the page at the deadline
  const counts = tally(rows);
  const summary = describe(counts, rows.length);
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`[B4A] ${summary} after ${seconds} s`);
  testInfo.annotations.push({ type: "B4A result", description: `${summary} after ${seconds} s` });

  if (counts.pending > 0 || rows.length !== FILE_COUNT) {
    const stuck = rows.filter(row => row.bucket === "pending").map(row => `${row.name}: "${row.label}"`);
    throw new Error(`Timed out after ${seconds} s. ${summary}.\nStuck files and their last visible state:\n${stuck.join("\n") || "(none; the list did not hold all rows)"}`);
  }
  const failedRows = rows.filter(row => row.bucket === "failed").map(row => `${row.name}: "${row.label}"`);
  expect(counts.duplicate, `distinct files must not be reported as duplicates. ${summary}`).toBe(0);
  expect(failedRows, `no file should fail. ${summary}`).toEqual([]);
  expect(new Set(rows.map(row => row.name)).size).toBe(FILE_COUNT);
  expect(errors).toEqual([]);
});

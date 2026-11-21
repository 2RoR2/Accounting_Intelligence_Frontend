import assert from "node:assert/strict";
import test from "node:test";
import { readyInvoicesInRange } from "../src/features/common/erp/myinvois-page";
import { shareLinkStatus } from "../src/features/common/erp/share-links";
import { publicShareErrorText, type ErpDocument } from "../src/lib/api/erp.service";

test("share status maps to a plain label and badge tone", () => {
  assert.deepEqual(shareLinkStatus("active"), { label: "Active", tone: "green" });
  assert.deepEqual(shareLinkStatus("expired"), { label: "Expired", tone: "amber" });
  assert.deepEqual(shareLinkStatus("revoked"), { label: "Revoked", tone: "neutral" });
});

test("consolidation includes ready typed invoices on both dates of the range", () => {
  const invoice = { type: "invoice", source: "typed", status: "ready" } as const;
  const rows = [
    { ...invoice, id: "before", documentDate: "2026-08-31" },
    { ...invoice, id: "start", documentDate: "2026-09-01" },
    { ...invoice, id: "end", documentDate: "2026-09-30" },
    { ...invoice, id: "after", documentDate: "2026-10-01" },
    { ...invoice, id: "undated", documentDate: null },
    { ...invoice, id: "draft", documentDate: "2026-09-15", status: "draft" },
    { ...invoice, id: "scanned", documentDate: "2026-09-15", source: "scanned" },
    { ...invoice, id: "bill", documentDate: "2026-09-15", type: "bill" },
  ] satisfies (Pick<ErpDocument, "type" | "source" | "status" | "documentDate"> & { id: string })[];

  assert.deepEqual(readyInvoicesInRange(rows, { dateFrom: "2026-09-01", dateTo: "2026-09-30" }).map(({ id }) => id), ["start", "end"]);
  assert.deepEqual(readyInvoicesInRange(rows, { dateFrom: "2026-09-30", dateTo: "2026-09-30" }).map(({ id }) => id), ["end"]);
  assert.deepEqual(readyInvoicesInRange(rows, { dateFrom: "2026-09-30", dateTo: "2026-09-01" }), []);
  assert.deepEqual(readyInvoicesInRange(rows, { dateFrom: "", dateTo: "2026-09-30" }), []);
});

test("public share failures explain invalid and withdrawn links", () => {
  assert.equal(publicShareErrorText(404), "This link is not valid");
  assert.equal(publicShareErrorText(410), "This link has expired or was withdrawn");
  assert.equal(publicShareErrorText(503), "Unable to open this shared document. Please try again.");
  assert.equal(publicShareErrorText(), publicShareErrorText(503));
});

test("share links use this site's address and keep only the share path", async () => {
  const { shareUrlForThisSite } = await import("../src/features/common/erp/share-links");
  assert.equal(shareUrlForThisSite("http://127.0.0.1:3000/share/abcDEF_123", "https://app.example.test"),
    "https://app.example.test/share/abcDEF_123");
  assert.equal(shareUrlForThisSite("not a url", "https://app.example.test"), "not a url");
});

test("unit prices keep four decimals and prepared invoices are excluded", async () => {
  const { unitPrice } = await import("../src/features/public/shared-document");
  const { preparedInvoiceIds } = await import("../src/features/common/erp/myinvois-page");
  assert.equal(unitPrice("0.0125", "MYR"), "RM 0.0125");
  assert.equal(unitPrice("12.5", "USD"), "USD 12.50");
  assert.deepEqual([...preparedInvoiceIds([{ documentIds: ["a", "b"] }, {}])], ["a", "b"]);
});

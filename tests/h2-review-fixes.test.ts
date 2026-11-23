// Codex H2 review of `features`: bank-import mapping, records export filters and the upload deadline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { api } from "../src/lib/api/client";
import { autoMapColumns, importMappingForPreview } from "../src/features/common/money/import-mapping";

const HEADERS = ["Date", "Description", "Debit", "Credit", "Amount"];

test("a chosen Debit/Credit pair survives a generic Amount column in the statement", () => {
  const chosen = { ...autoMapColumns(HEADERS), debit: "Debit", credit: "Credit" };
  const mapping = importMappingForPreview(chosen, HEADERS);
  assert.equal(mapping.debit, "Debit");
  assert.equal(mapping.credit, "Credit");
});

test("auto-mapping prefers explicit Debit and Credit columns over Amount", () => {
  const mapping = autoMapColumns(HEADERS);
  assert.equal(mapping.debit, "Debit");
  assert.equal(mapping.credit, "Credit");
});

test("a single signed Amount column still maps to both sides", () => {
  const headers = ["Date", "Payee", "Amount", "Reference"];
  const auto = autoMapColumns(headers);
  assert.equal(auto.debit, "Amount");
  assert.equal(auto.credit, "Amount");
  const cleared = importMappingForPreview({ ...auto, debit: "", credit: "" }, headers);
  assert.equal(cleared.debit, "Amount");
  assert.equal(cleared.credit, "Amount");
});

async function deadlineFor(init: RequestInit): Promise<number[]> {
  const oldFetch = globalThis.fetch;
  const oldSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.fetch = async () => Response.json({ ok: true });
  globalThis.setTimeout = ((_handler: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return oldSetTimeout(() => undefined, 0);
  }) as typeof setTimeout;
  try {
    await api("/api/anything", init);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.setTimeout = oldSetTimeout;
  }
  return delays;
}

test("an upload gets a long request deadline; ordinary requests keep 15 s", async () => {
  const form = new FormData();
  form.append("file", new Blob(["x"]), "statement.pdf");
  assert.deepEqual(await deadlineFor({ method: "POST", body: form }), [120000]);
  assert.deepEqual(await deadlineFor({ method: "POST", body: JSON.stringify({}) }), [15000]);
});

test("the records export sends the records the filters show", () => {
  const source = readFileSync("src/features/common/records/records.tsx", "utf8");
  assert.doesNotMatch(source, /createExport\("records",\s*\{\}/);
  assert.match(source, /createExport\("records",\s*\{\s*recordIds:\s*records\.map\(\(record\) => record\.id\)\s*\}/);
});

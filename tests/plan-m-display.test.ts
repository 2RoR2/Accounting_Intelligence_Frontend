import assert from "node:assert/strict";
import test from "node:test";
import { getLatestBenchmark, latestBenchmarkPath } from "../src/lib/api/benchmark.service";
import { documentDisplayName } from "../src/lib/document-display-name";

test("uses the document name supplied by either API spelling with a legacy fallback", () => {
  assert.equal(documentDisplayName({ displayName: "canonical.pdf", display_name: "other.pdf" }, "legacy.pdf"), "canonical.pdf");
  assert.equal(documentDisplayName({ displayName: "", display_name: "canonical.pdf" }, "legacy.pdf"), "canonical.pdf");
  assert.equal(documentDisplayName({ display_name: null }, "legacy.pdf"), "legacy.pdf");
});

test("shows only a completed lite benchmark from the synthetic hold-out set", async (t) => {
  const holdout = {
    benchmark: "lite-extraction",
    created_at: "2026-11-23T00:00:00Z",
    documents: [{}],
    settings: { manifest_dir: "ai/synthetic/output/holdout" },
    overall: { accuracy: 0.9 },
    seconds_per_document: { total: { median: 3, p90: 5 } },
  };
  let response = Response.json(holdout);
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(new URL(url).pathname, latestBenchmarkPath);
    return response;
  });

  assert.deepEqual(await getLatestBenchmark(), holdout);
  response = Response.json({ ...holdout, settings: { manifest_dir: "ai/synthetic/output/tuning" } });
  assert.equal(await getLatestBenchmark(), null);
  response = Response.json({ ...holdout, stopped: "PROVIDER_ERROR" });
  assert.equal(await getLatestBenchmark(), null);
  response = Response.json({ qwen: [] });
  assert.equal(await getLatestBenchmark(), null);
  response = new Response(null, { status: 404 });
  assert.equal(await getLatestBenchmark(), null);
  response = new Response(null, { status: 500 });
  await assert.rejects(getLatestBenchmark(), { status: 500 });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { IDEMPOTENCY_HEADER, isRetrySafeWrite, withIdempotencyKey } from "../src/lib/api/client";
import { createDocument, duplicateDocument, transitionDocument, updateDocument } from "../src/lib/api/erp.service";

type Call = { url: string; method?: string; key: string | null };

async function withFetch(responses: Array<() => Response | Promise<Response>>, check: (calls: Call[]) => Promise<void>) {
  const old = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method, key: new Headers(init?.headers).get(IDEMPOTENCY_HEADER) });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next();
  }) as typeof fetch;
  try { await check(calls); } finally { globalThis.fetch = old; }
}

const created = { id: "doc-1", type: "invoice", status: "draft" };

test("only the backend's retry-safe POST writes get a key", () => {
  assert.ok(isRetrySafeWrite("POST", "/api/erp/documents/invoice"));
  assert.ok(isRetrySafeWrite("post", "/api/erp/documents/invoice/abc/transition"));
  assert.ok(isRetrySafeWrite("POST", "/api/erp/documents/invoice/abc/duplicate"));
  assert.ok(isRetrySafeWrite("POST", "/api/erp/documents/quotation/abc/transfer"));
  assert.ok(isRetrySafeWrite("POST", "/api/documents/abc/review"));
  assert.ok(isRetrySafeWrite("POST", "/api/documents/abc/review/decision"));
  assert.ok(isRetrySafeWrite("POST", "/api/documents/abc/exclude"));
  assert.ok(isRetrySafeWrite("POST", "/api/records/from-document/abc"));
  assert.ok(isRetrySafeWrite("POST", "/api/review/bulk-approve"));
  assert.ok(isRetrySafeWrite("POST", "/api/erp/scanned/abc/post"));
  assert.ok(!isRetrySafeWrite("PATCH", "/api/erp/documents/invoice/abc"));
  assert.ok(!isRetrySafeWrite("POST", "/api/erp/documents/invoice/preview.pdf"));
  assert.ok(!isRetrySafeWrite("POST", "/api/erp/contacts/abc/reactivate"));
  assert.ok(!isRetrySafeWrite(undefined, "/api/erp/documents/invoice"));
});

test("a caller's own key is kept", () => {
  const init = withIdempotencyKey("/api/erp/documents/invoice", { method: "POST", headers: { [IDEMPOTENCY_HEADER]: "mine" } });
  assert.equal(new Headers(init.headers).get(IDEMPOTENCY_HEADER), "mine");
});

test("a dropped connection is retried once with the same key", async () => {
  await withFetch([() => { throw new TypeError("Failed to fetch"); }, () => Response.json(created, { status: 201 })], async (calls) => {
    assert.deepEqual(await createDocument("invoice", {}), created);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].key && calls[0].key.length <= 160);
    assert.equal(calls[1].key, calls[0].key);
  });
});

test("a gateway error is retried once with the same key; a second failure surfaces", async () => {
  await withFetch([() => new Response("", { status: 503 }), () => Response.json({ detail: "Busy" }, { status: 503 })], async (calls) => {
    await assert.rejects(transitionDocument("invoice", "doc-1", "ready"), /Busy/);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].key, calls[0].key);
  });
});

test("a refused action is not retried, and each user action gets its own key", async () => {
  await withFetch([
    () => Response.json({ detail: "Cannot move a void document to ready." }, { status: 409 }),
    () => Response.json(created, { status: 201 }),
  ], async (calls) => {
    await assert.rejects(transitionDocument("invoice", "doc-1", "ready"), /Cannot move/);
    await duplicateDocument("invoice", "doc-1");
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0].key, calls[1].key);
  });
});

test("the 401 refresh retry reuses the key", async () => {
  await withFetch([
    () => Response.json({ detail: "Your session expired" }, { status: 401 }),
    () => new Response(null, { status: 200 }),
    () => Response.json(created, { status: 201 }),
  ], async (calls) => {
    await createDocument("invoice", {});
    assert.equal(calls.length, 3);
    assert.ok(calls[1].url.endsWith("/api/auth/refresh"));
    assert.equal(calls[2].key, calls[0].key);
  });
});

test("writes outside the list are sent without a key", async () => {
  await withFetch([() => Response.json(created)], async (calls) => {
    await updateDocument("invoice", "doc-1", {});
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].key, null);
  });
});

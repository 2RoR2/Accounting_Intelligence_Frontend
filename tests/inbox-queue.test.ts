import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InboxQueue,
  rejectReason,
  stateForDocument,
  summarise,
  type DocumentSnapshot,
  type InboxCategory,
  type InboxFile,
  type InboxKind,
  type UploadReceipt,
} from "../src/features/common/documents/inbox/inbox-queue";

type Call = { file: InboxFile; kind: InboxKind; category: InboxCategory; resolve(value: UploadReceipt): void; reject(error: unknown): void };

/** A fake server: uploads stay open until the test settles them; documents answer from a status map. */
function fakeServer() {
  const calls: Call[] = [];
  const statuses = new Map<string, DocumentSnapshot>();
  const asked: string[] = [];
  const retried: string[] = [];
  const queue = new InboxQueue<InboxFile>({
    upload: (file, kind, category) => new Promise((resolve, reject) => calls.push({ file, kind, category, resolve, reject })),
    getDocument: async (id) => { asked.push(id); const doc = statuses.get(id); if (!doc) throw new Error("offline"); return doc; },
    retryReading: async (id) => { retried.push(id); return { id }; },
  });
  return { queue, calls, statuses, asked, retried };
}
const file = (name: string, size = 1000): InboxFile => ({ name, size, lastModified: 1 });
const files = (count: number) => Array.from({ length: count }, (_, i) => file(`scan-${i + 1}.pdf`, 1000 + i));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const states = (queue: InboxQueue<InboxFile>) => queue.getItems().map((item) => item.state);
const uploadingCount = (queue: InboxQueue<InboxFile>) => states(queue).filter((state) => state === "uploading").length;
const apiError = (status: number, message: string, details?: Record<string, unknown>) => Object.assign(new Error(message), { status, details });
const receipt = (id: string, extra: Partial<UploadReceipt> = {}): UploadReceipt =>
  ({ id, code: `DOC_${id.toUpperCase()}`, kind: "AUTO", status: "QUEUED", jobId: `job-${id}`, dispatchAccepted: false, ...extra });

test("uploads three files at a time and starts the next as each finishes", async () => {
  const { queue, calls } = fakeServer();
  queue.add(files(20));
  assert.equal(calls.length, 3);
  assert.deepEqual(states(queue).slice(0, 4), ["uploading", "uploading", "uploading", "waiting"]);
  for (let i = 0; i < 20; i++) {
    assert.ok(uploadingCount(queue) <= 3);
    calls[i].resolve(receipt(`d${i}`));
    await settle();
    if (i < 17) assert.equal(uploadingCount(queue), 3, "a free slot is filled at once");
  }
  assert.equal(calls.length, 20);
  assert.ok(calls.every((call) => call.kind === "AUTO" && call.category === "ACCOUNTS_PAYABLE"));
  assert.equal(summarise(queue.getItems()).queued, 20);
});

test("dispatchAccepted false is normal progress: in line to be read", async () => {
  const { queue, calls } = fakeServer();
  queue.add([file("photo.jpg")]);
  calls[0].resolve(receipt("x", { dispatchAccepted: false }));
  await settle();
  const [item] = queue.getItems();
  assert.equal(item.state, "queued");
  assert.equal(item.documentId, "x");
  assert.equal(item.note, undefined);
});

test("polling moves a file from in line, to reading, to ready, then stops asking", async () => {
  const { queue, calls, statuses, asked } = fakeServer();
  queue.add([file("bill.pdf")]);
  calls[0].resolve(receipt("b", { dispatchAccepted: true, status: "QUEUED" }));
  await settle();
  statuses.set("b", { id: "b", status: "PROCESSING", code: "DOC_B" });
  await queue.tick();
  assert.equal(queue.getItems()[0].state, "reading");
  statuses.set("b", { id: "b", status: "EXTRACTED", code: "BILL_100004", kind: "BILL" });
  await queue.tick();
  const [item] = queue.getItems();
  assert.deepEqual([item.state, item.code, item.kind], ["ready", "BILL_100004", "BILL"]);
  const before = asked.length;
  await queue.tick();
  assert.equal(asked.length, before, "a finished file is not polled again");
});

test("exception, unrecognised type and read failure map to plain final states", () => {
  assert.deepEqual(stateForDocument("EXCEPTION", "INVOICE_1"), { state: "needs_fixing" });
  assert.match(stateForDocument("EXCEPTION", "DOC_ABCDEF123456").note ?? "", /type was not recognised/);
  const untyped = stateForDocument("EXTRACTED", "DOC_ABCDEF123456");
  assert.equal(untyped.state, "needs_fixing");
  assert.match(untyped.note ?? "", /type was not recognised/);
  assert.deepEqual(stateForDocument("FAILED"), { state: "failed", note: "This file could not be read.", retry: "reading" });
  assert.equal(stateForDocument("VALIDATING").state, "reading");
  assert.equal(stateForDocument("UPLOADED").state, "queued");
});

test("a duplicate is reported per file with a link to the earlier document", async () => {
  const { queue, calls } = fakeServer();
  queue.add([file("a.pdf"), file("b.pdf")]);
  calls[0].reject(apiError(409, "This document is already uploaded.", { existingDocumentId: "old-1", existingDocumentCode: "INVOICE_100001", existingFilename: "a.pdf" }));
  calls[1].resolve(receipt("new"));
  await settle();
  const [dup, fresh] = queue.getItems();
  assert.equal(dup.state, "duplicate");
  assert.deepEqual(dup.existing, { id: "old-1", code: "INVOICE_100001", name: "a.pdf" });
  assert.equal(dup.retry, undefined, "a duplicate is not offered for upload again");
  assert.equal(fresh.state, "queued");
});

test("a failed upload can be tried again; content refusals cannot", async () => {
  const { queue, calls } = fakeServer();
  queue.add([file("net.pdf"), file("bad.pdf"), file("big.pdf")]);
  calls[0].reject(new Error("Unable to reach the backend API."));
  calls[1].reject(apiError(422, "The file content does not match a PDF."));
  calls[2].reject(apiError(413, "Too large"));
  await settle();
  const [net, bad, big] = queue.getItems();
  assert.deepEqual([net.state, net.retry], ["failed", "upload"]);
  assert.deepEqual([bad.state, bad.retry, bad.note], ["failed", undefined, "The file content does not match a PDF."]);
  assert.deepEqual([big.state, big.retry], ["failed", undefined]);
  await queue.retry(net.key);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].file.name, "net.pdf");
  calls[3].resolve(receipt("n"));
  await settle();
  assert.equal(queue.getItems()[0].state, "queued");
  await queue.retry(bad.key);
  assert.equal(calls.length, 4, "a refused file is not uploaded again");
});

test("a file the server could not read is sent for reading again, not uploaded twice", async () => {
  const { queue, calls, statuses, retried } = fakeServer();
  queue.add([file("blurry.jpg")]);
  calls[0].resolve(receipt("r", { dispatchAccepted: true }));
  await settle();
  statuses.set("r", { id: "r", status: "FAILED", code: "DOC_R" });
  await queue.tick();
  const [item] = queue.getItems();
  assert.deepEqual([item.state, item.retry], ["failed", "reading"]);
  await queue.retry(item.key);
  assert.deepEqual(retried, ["r"]);
  assert.equal(calls.length, 1);
  assert.equal(queue.getItems()[0].state, "queued");
});

test("files the server cannot take fail in the browser without a request", () => {
  const { queue, calls } = fakeServer();
  queue.add([file("notes.txt"), file("empty.pdf", 0), file("huge.pdf", 21 * 1024 * 1024), file("ok.png")]);
  assert.equal(calls.length, 1);
  assert.deepEqual(states(queue), ["failed", "failed", "failed", "uploading"]);
  assert.equal(rejectReason(file("scan.JPEG")), null);
  assert.match(rejectReason(file("scan"))!, /PDF files and photos/);
});

test("the same file picked twice is listed once", () => {
  const { queue, calls } = fakeServer();
  queue.add([file("same.pdf"), file("same.pdf")]);
  queue.add([file("same.pdf")]);
  assert.equal(queue.getItems().length, 1);
  assert.equal(calls.length, 1);
});

test("a server without kind=auto pauses the queue and asks for a type once", async () => {
  const { queue, calls } = fakeServer();
  queue.add(files(4));
  for (const call of calls.splice(0, 3)) call.reject(apiError(422, "Invalid document kind or category."));
  await settle();
  assert.equal(queue.needsType, true);
  assert.deepEqual(states(queue), ["waiting", "waiting", "waiting", "waiting"]);
  assert.equal(calls.length, 0, "nothing more is sent until a type is chosen");
  queue.chooseKind("RECEIPT");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.kind === "RECEIPT"));
});

test("polling asks at most maxPolls files per round and rotates through the rest", async () => {
  const { queue, calls, statuses, asked } = fakeServer();
  queue.add(files(9));
  for (let i = 0; i < 9; i++) {
    calls[i].resolve(receipt(`p${i}`));
    statuses.set(`p${i}`, { id: `p${i}`, status: "QUEUED" });
    await settle();
  }
  await queue.tick();
  assert.equal(asked.length, 6);
  await queue.tick();
  assert.equal(new Set(asked).size, 9, "every open file is asked within two rounds");
});

test("a missed poll leaves the file as it was", async () => {
  const { queue, calls } = fakeServer();
  queue.add([file("x.pdf")]);
  calls[0].resolve(receipt("missing"));
  await settle();
  await queue.tick();
  assert.equal(queue.getItems()[0].state, "queued");
});

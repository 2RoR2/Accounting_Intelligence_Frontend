import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InboxQueue,
  rejectReason,
  stateForDocument,
  queueOwnerKey,
  statusLostNote,
  summarise,
  typePending,
  type DocumentSnapshot,
  type InboxCategory,
  type InboxFile,
  type InboxKind,
  type UploadReceipt,
} from "../src/features/common/documents/inbox/inbox-queue";
import { filesFromDrop } from "../src/features/common/documents/inbox/collect-files";

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

test("a refreshed document that is still AUTO never shows its stored placeholder as a type", async () => {
  const { queue, calls, statuses } = fakeServer();
  queue.add([file("photo.jpg"), file("bill.pdf")]);
  // Upload receipts as the server sends them for kind=auto.
  calls[0].resolve(receipt("u", { dispatchAccepted: true, kindDetected: false }));
  calls[1].resolve(receipt("k", { dispatchAccepted: true, kindDetected: false }));
  await settle();
  assert.deepEqual(queue.getItems().map((item) => [item.kind, item.kindDetected]), [[undefined, false], [undefined, false]]);
  // Read DTOs: kind AUTO + kindDetected false until classified. The code alone need not carry the signal.
  statuses.set("u", { id: "u", status: "EXCEPTION", code: "SOME_CODE", kind: "AUTO", kindDetected: false });
  statuses.set("k", { id: "k", status: "EXTRACTED", code: "BILL_100009", kind: "BILL", kindDetected: true });
  await queue.tick();
  const [untyped, typed] = queue.getItems();
  assert.deepEqual([untyped.state, untyped.kind, untyped.kindDetected], ["needs_fixing", undefined, false]);
  assert.match(untyped.note ?? "", /type was not recognised/);
  assert.deepEqual([typed.state, typed.kind, typed.kindDetected], ["ready", "BILL", true]);
  // kindDetected false on an otherwise finished document still needs fixing.
  assert.equal(stateForDocument("EXTRACTED", "INVOICE_1", false).state, "needs_fixing");
  assert.equal(typePending({ kind: "auto" }), true);
  assert.equal(typePending({ kind: "INVOICE", code: "INVOICE_1", kindDetected: true }), false);
});

test("P2-1: the queue belongs to the person and company, not to the user object", () => {
  const signedIn = { id: "u-1", tenantId: "t-1", name: "Aina", theme: "light" };
  const refreshed = { ...signedIn, theme: "dark" }; // re-fetched after a storage event: new object, same person
  assert.notEqual(signedIn, refreshed);
  assert.equal(queueOwnerKey(refreshed), queueOwnerKey(signedIn));
  assert.notEqual(queueOwnerKey({ id: "u-1", tenantId: "t-2" }), queueOwnerKey(signedIn));
  assert.notEqual(queueOwnerKey({ id: "u-2", tenantId: "t-1" }), queueOwnerKey(signedIn));
});

test("P2-2: a poll during a pending read-again retry cannot end the row as failed", async () => {
  let confirm!: () => void;
  const statuses = new Map<string, DocumentSnapshot>();
  const calls: Call[] = [];
  const queue = new InboxQueue<InboxFile>({
    upload: (file, kind, category) => new Promise((resolve, reject) => calls.push({ file, kind, category, resolve, reject })),
    getDocument: async (id) => statuses.get(id)!,
    retryReading: () => new Promise<void>((resolve) => { confirm = resolve; }),
  });
  queue.add([file("blurry.jpg")]);
  calls[0].resolve(receipt("r", { dispatchAccepted: true }));
  await settle();
  statuses.set("r", { id: "r", status: "FAILED", code: "DOC_R" });
  await queue.tick();
  const key = queue.getItems()[0].key;
  const retried = queue.retry(key);
  // The server has not processed the retry yet and still says FAILED.
  await queue.tick();
  assert.deepEqual([queue.getItems()[0].state, queue.getItems()[0].retrying], ["failed", true]);
  // Confirmed: the server now holds a new job.
  statuses.set("r", { id: "r", status: "QUEUED", code: "DOC_R" });
  confirm();
  await retried;
  assert.deepEqual([queue.getItems()[0].state, queue.getItems()[0].retrying], ["queued", false]);
  statuses.set("r", { id: "r", status: "EXTRACTED", code: "RECEIPT_100001", kind: "RECEIPT", kindDetected: true });
  await queue.tick();
  assert.equal(queue.getItems()[0].state, "ready", "a successful retry ends as ready, not failed");
});

test("P2-3: one unreadable file in a dropped folder is counted, the rest still go through", async () => {
  const fileEntry = (name: string, readable = true) => ({
    name, isFile: true, isDirectory: false,
    file: (ok: (f: File) => void, fail: (e: Error) => void) => (readable ? ok(new File(["x"], name)) : fail(new Error("NotReadableError"))),
  });
  const folder = (name: string, children: unknown[]) => ({
    name, isFile: false, isDirectory: true,
    createReader: () => { let done = false; return { readEntries: (ok: (e: unknown[]) => void) => { ok(done ? [] : children); done = true; } }; },
  });
  const tree = folder("August", [fileEntry("a.pdf"), fileEntry("locked.pdf", false), folder("photos", [fileEntry("b.jpg"), fileEntry("notes.txt")]), fileEntry("c.png")]);
  const drop = { items: [{ kind: "file", webkitGetAsEntry: () => tree, getAsFile: () => null }], files: [] } as unknown as DataTransfer;
  const collected = await filesFromDrop(drop);
  assert.deepEqual(collected.files.map((f) => f.name).sort(), ["a.pdf", "b.jpg", "c.png"]);
  assert.equal(collected.skipped, 2, "locked.pdf (unreadable) and notes.txt (not a document)");
});

test("P2-4: repeated failed status checks end in Status unknown, keep the document, and can be refreshed", async () => {
  let online = false;
  let status: DocumentSnapshot = { id: "d", status: "PROCESSING", code: "DOC_D" };
  const calls: Call[] = [];
  const queue = new InboxQueue<InboxFile>({
    upload: (file, kind, category) => new Promise((resolve, reject) => calls.push({ file, kind, category, resolve, reject })),
    getDocument: async () => { if (!online) throw new Error("Unable to reach the backend API."); return status; },
    retryReading: async () => ({}),
  }, { maxPollFailures: 3 });
  queue.add([file("scan.pdf")]);
  calls[0].resolve(receipt("d", { dispatchAccepted: true }));
  await settle();
  await queue.tick();
  await queue.tick();
  assert.equal(queue.getItems()[0].state, "queued", "short outages are retried");
  await queue.tick();
  const [lost] = queue.getItems();
  assert.deepEqual([lost.state, lost.retry, lost.documentId], ["failed", "refresh", "d"]);
  assert.match(lost.note ?? "", /could not be checked.*Unable to reach the backend API.*refresh/);
  online = true;
  await queue.retry(lost.key);
  assert.equal(queue.getItems()[0].state, "queued");
  status = { id: "d", status: "EXTRACTED", code: "INVOICE_100001", kind: "INVOICE", kindDetected: true };
  await queue.tick();
  assert.equal(queue.getItems()[0].state, "ready");
  // A signed-out session does not recover by retrying: it stops at the first failure.
  const signedOut = new InboxQueue<InboxFile>({
    upload: async () => receipt("s", { dispatchAccepted: true }),
    getDocument: async () => { throw Object.assign(new Error("Your session expired"), { status: 401 }); },
    retryReading: async () => ({}),
  });
  signedOut.add([file("x.pdf")]);
  await settle();
  await signedOut.tick();
  assert.deepEqual([signedOut.getItems()[0].state, signedOut.getItems()[0].retry], ["failed", "refresh"]);
  assert.equal(statusLostNote({ status: 401 }), "Your session ended. Sign in again, then refresh this file's status.");
});

test("a missed poll leaves the file as it was", async () => {
  const { queue, calls } = fakeServer();
  queue.add([file("x.pdf")]);
  calls[0].resolve(receipt("missing"));
  await settle();
  await queue.tick();
  assert.equal(queue.getItems()[0].state, "queued");
});

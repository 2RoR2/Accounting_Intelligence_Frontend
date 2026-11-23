import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTACHABLE_TYPES, canAttach, fileProblem, formatBytes, isImage, linkHost, linkProblem, MAX_ATTACHMENT_BYTES,
} from "../src/features/common/erp/attachments-logic";

test("only typed payments, refunds, money in/out, transfers and manual journals carry attachments", () => {
  assert.deepEqual([...ATTACHABLE_TYPES].sort(), [
    "bank-transfer", "journal-entry", "money-in", "money-out", "payment", "purchase-payment", "purchase-refund", "refund",
  ]);
  assert.equal(canAttach("payment"), true);
  assert.equal(canAttach("invoice"), false);
  assert.equal(canAttach("bill"), false);
});

test("files are checked for size and type before upload", () => {
  const png = { name: "slip.png", size: 1000, type: "image/png" };
  assert.equal(fileProblem(png), "");
  assert.equal(fileProblem({ name: "photo.JPG", size: 1000, type: "" }), "");
  assert.equal(fileProblem({ ...png, size: MAX_ATTACHMENT_BYTES }), "");
  assert.match(fileProblem({ ...png, size: MAX_ATTACHMENT_BYTES + 1 }), /10 MB/);
  assert.match(fileProblem({ ...png, size: 0 }), /empty/);
  assert.match(fileProblem({ name: "notes.txt", size: 10, type: "text/plain" }), /PDF, PNG, JPEG or WebP/);
  assert.match(fileProblem({ name: "anim.gif", size: 10, type: "image/gif" }), /PDF, PNG, JPEG or WebP/);
});

test("only plain https links are accepted", () => {
  assert.equal(linkProblem("https://bank.example.com/slip/1?x=1"), "");
  assert.equal(linkProblem("  HTTPS://Bank.example.com/a  "), "");
  for (const bad of ["http://example.com", "javascript:alert(1)", "ftp://example.com", "example.com/a", "//example.com"]) {
    assert.match(linkProblem(bad), /https/, bad);
  }
  assert.match(linkProblem(""), /Enter the link/);
  assert.match(linkProblem("https://exa mple.com"), /spaces/);
  assert.match(linkProblem("https://user:pw@example.com/a"), /valid web address/);
  assert.match(linkProblem("https://"), /valid web address/);
  assert.match(linkProblem(`https://example.com/${"a".repeat(2000)}`), /too long/);
});

test("sizes, hosts and previews read plainly", () => {
  assert.equal(formatBytes(null), "");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3.5 * 1024 * 1024), "3.5 MB");
  assert.equal(linkHost("https://drive.example.com/file/1"), "drive.example.com");
  assert.equal(isImage("image/webp"), true);
  assert.equal(isImage("application/pdf"), false);
  assert.equal(isImage(null), false);
});

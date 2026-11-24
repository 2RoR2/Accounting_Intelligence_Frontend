/** 25 Nov local-admin end-to-end audit: "Set aside…" as a row action, the Set-aside list, and the admin fixes found. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compiles JSX with the classic runtime; the shared UI kit relies on Next's automatic one.
(globalThis as { React?: typeof React }).React = React;
import {
  SET_ASIDE_REASON_MIN, SET_ASIDE_STATUSES, SetAsideRowAction, canSetAside, setAsideReasonReady,
} from "../src/features/common/documents/set-aside";
import { inviterName } from "../src/features/common/users/invitation-link";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("a row offers Set aside only for the statuses the backend accepts", () => {
  for (const status of ["UPLOADED", "FAILED", "EXTRACTED", "CORRECTED", "EXCEPTION", "exception"]) assert.equal(canSetAside(status), true, status);
  for (const status of ["QUEUED", "PROCESSING", "IN_REVIEW", "VALIDATED", "COMPLETED", "STANDARDISED", "", undefined, null]) {
    assert.equal(canSetAside(status), false, String(status));
  }
  // The same set the review tab uses, so both entry points agree with ExcludeInput / EXCLUDABLE_STATUSES.
  assert.deepEqual([...SET_ASIDE_STATUSES].sort(), ["CORRECTED", "EXCEPTION", "EXTRACTED", "FAILED", "UPLOADED"]);
});

test("the reason needs at least five characters, as the API requires", () => {
  assert.equal(SET_ASIDE_REASON_MIN, 5);
  assert.equal(setAsideReasonReady("dup"), false);
  assert.equal(setAsideReasonReady("   abcd   "), false);
  assert.equal(setAsideReasonReady("Duplicate"), true);
});

test("the row action is a labelled button that opens the shared reason form", () => {
  const html = renderToStaticMarkup(createElement(SetAsideRowAction, { documentId: "d1", label: "RECEIPT_100006", onDone: () => {} }));
  assert.match(html, /aria-label="Set aside RECEIPT_100006"/);
  assert.match(html, />Set aside…</);
  const file = source("features/common/documents/set-aside.tsx");
  // One form for the review tab and the dialog: both call excludeDocument with the trimmed reason.
  assert.equal(file.match(/excludeDocument\(/g)?.length, 1);
  assert.match(file, /function SetAsideControl[\s\S]*<SetAsideReasonForm /);
  assert.match(file, /function SetAsideRowAction[\s\S]*<SetAsideReasonForm stacked /);
});

test("All documents and Exceptions show the row action only when allowed and refresh after it", () => {
  const documents = source("features/common/documents/documents.tsx");
  assert.match(documents, /canSetAside\(d\.status\) && <SetAsideRowAction/);
  assert.match(documents, /setSetAsideVersion\(\(version\) => version \+ 1\); void refresh\(\)/);
  assert.match(documents, /<SetAsideList [^>]*version=\{setAsideVersion\}/);
  const exceptions = source("features/common/exceptions/exceptions.tsx");
  assert.match(exceptions, /documentStatus: doc\?\.status/);
  assert.match(exceptions, /canSetAside\(e\.documentStatus\) && \(\s*<SetAsideRowAction/);
  assert.match(exceptions, /onDone=\{\(message\) => \{ setToast\(message\); void refresh\(\); \}\}/);
});

test("the Set-aside list says who set each document aside; only a local admin gets Restore", () => {
  const file = source("features/common/documents/set-aside.tsx");
  assert.match(file, /label: "By", render: \(row\) => row\.excludedBy/);
  assert.match(file, /\.\.\.\(canRestore \? \[\{ label: "Action"/);
  assert.match(source("lib/api/document.service.ts"), /excludedBy\?: string \| null/);
});

test("Users & roles shows who invited a person by name, never a raw id", () => {
  const people = [{ id: "246a8440-3875-4b7f-a5c6-7abe1db8292a", name: "KNT Demo Local Admin" }];
  assert.equal(inviterName("246a8440-3875-4b7f-a5c6-7abe1db8292a", people), "KNT Demo Local Admin");
  assert.equal(inviterName("11111111-2222-3333-4444-555555555555", people), "Another administrator");
  assert.equal(inviterName("", people), "—");
  assert.equal(inviterName("Platform team", people), "Platform team");
  assert.doesNotMatch(source("features/common/users/user-management.tsx"), /render: \(u\) => u\.invitedBy/);
});

test("Preview journal is wide enough to show the Credit column", () => {
  assert.match(source("features/common/records/journal-preview.tsx"), /className="panel-body journal-preview-body"/);
  const css = source("styles/common.css");
  assert.match(css, /dialog:has\(\.journal-preview-body\) \{\s*width: min\(880px/);
  assert.match(css, /\.set-aside-dialog \{ white-space: normal; text-align: left; \}/);
});

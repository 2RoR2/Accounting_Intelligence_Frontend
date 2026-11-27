/** AI Inbox (F3) and Fraud Shield (F2): rendering, confirm-before-accept, copy-only drafts, flag-off hiding, approve-anyway. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compiles JSX with the classic runtime; the shared UI kit relies on Next's automatic one.
(globalThis as { React?: typeof React }).React = React;
import {
  APPROVE_ANYWAY_MIN, actionIsRunnable, approveAnywayCodes, approveAnywayReady, describeAction, draftClipboardText, groupByKind,
  normaliseFlags, normaliseFraud, normaliseInbox, resolveEvidenceHref, shieldLabel, shieldTone, type InboxAction, type InboxItem,
} from "../src/features/common/inbox/inbox-contract";
import { ApiError } from "../src/lib/api/client";
import { InboxFlow, type InboxDeps, type InboxState } from "../src/features/common/inbox/inbox-flow";
import { ConfirmAcceptDialog, DraftBlock, InboxCard, InboxView } from "../src/features/common/inbox/ai-inbox-page";
import { ApproveAnywayForm, ShieldChip, ShieldFlagList, hasFraudWarnings } from "../src/features/common/inbox/shield";
import { mockFraud, mockInbox } from "../src/features/common/inbox/inbox-mock";
import { AiAssistOffError, getDocumentFraud, getInbox, isAssistOff, runInboxAction } from "../src/lib/api/inbox.service";
import { jobNavigation, navLeaves, navHref } from "../src/components/common/layout/navigation";
import { isAllowedWorkspaceRoute } from "../src/lib/constants/routes";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const ACCEPT: InboxAction = { label: "Add “Seladah Trading” as a supplier", method: "POST", path: "/api/contacts", body: { name: "Seladah Trading", type: "supplier" },
  then: [{ method: "POST", path: "/api/documents/d1/revalidate", body: undefined }, { method: "POST", path: "/api/documents/d2/revalidate", body: undefined }],
  confirm: "Add Seladah Trading and check 2 documents again?" };
const item = (extra: Partial<InboxItem> = {}): InboxItem => ({ id: "g1", kind: "exceptions", rawKind: "EXCEPTION_GROUP", severity: "medium", title: "12 documents share one cause",
  why: "The same supplier is missing.", evidence: [{ label: "Documents", value: "12", href: "exceptions?lane=needs-fixing" }, { label: "Elsewhere", value: "x", href: "https://evil.example/a" }],
  actions: [ACCEPT], basis: [], ...extra });
const DRAFT: InboxItem = item({ id: "m1", kind: "supplier-email", rawKind: "SUPPLIER_QUERY_DRAFT", title: "Ask Meranti", actions: [], draft: { to: "a@b.example", subject: "Query", body: "Dear team,\n\nPlease confirm." } });

function flow(items: InboxItem[] = [item()], overrides: Partial<InboxDeps> = {}) {
  const calls = { load: 0, run: [] as InboxAction[], dismiss: [] as string[] };
  let list = items;
  const deps: InboxDeps = {
    load: async () => { calls.load += 1; return list; },
    run: async (action) => { calls.run.push(action); list = []; },
    dismiss: async (id) => { calls.dismiss.push(id); },
    ...overrides,
  };
  return { flow: new InboxFlow(deps), calls };
}
const base = (over: Partial<InboxState> = {}): InboxState => ({ phase: "ready", items: [], error: "", pending: null, dismissing: new Set(), notice: "", ...over });
const view = (state: InboxState, extra: Record<string, unknown> = {}) =>
  html(createElement(InboxView, { state, prefix: "company", userName: "Aina", onRetry() {}, onAccept() {}, onConfirm() {}, onCancel() {}, onDismiss() {}, ...extra } as never));

// ------------------------------------------------------------------ contract

test("the backend response is read into the groups, with the real action shapes", () => {
  const items = normaliseInbox({ generatedAt: "2026-11-27T00:00:00+00:00", count: 6, items: [
    { id: "a", kind: "EXCEPTION_GROUP", severity: "medium", title: "t", why: "w", evidence: [{ label: "L", value: "V", href: "documents/x" }],
      actions: [{ label: "Go", method: "post", path: "/api/x", body: { a: 1 }, then: [{ method: "POST", path: "/api/y", body: null }], confirm: "Sure?" }], basis: null, draft: null },
    { id: "b", kind: "BANK_MATCH", severity: "low", title: "t", why: "w", evidence: [], actions: [], basis: ["Rule", "Match"], draft: null },
    { id: "c", kind: "CLOSE_BLOCKER", severity: "low", title: "t", why: "w", evidence: [], actions: [{ label: "Open", method: "LINK", path: "approvals", body: null }] },
    { id: "d", kind: "SUPPLIER_QUERY_DRAFT", severity: "high", title: "t", why: "w", evidence: [], actions: [{ label: "Copy email", method: "COPY", path: null }],
      draft: { to: null, subject: "S", body: "B", wording: "template" } },
    { id: "e", kind: "FRAUD_SHIELD", severity: "high", title: "t", why: "w" },
    { id: "f", kind: "never_heard_of_it", title: "t", why: "w" },
    { title: "no id is dropped" },
  ] });
  assert.deepEqual(items.map((entry) => entry.kind), ["exceptions", "bank-match", "close-blocker", "supplier-email", "fraud", "other"]);
  assert.equal(items[0].actions[0].method, "POST");
  assert.deepEqual(items[0].actions[0].then, [{ method: "POST", path: "/api/y", body: undefined }]);
  assert.equal(items[0].actions[0].confirm, "Sure?");
  assert.deepEqual(items[1].basis, ["Rule", "Match"]);
  assert.equal(items[3].draft?.to, undefined);
  assert.equal(items[3].actions[0].method, "COPY");
  assert.deepEqual(groupByKind(items).map((group) => group.kind), ["fraud", "supplier-email", "exceptions", "bank-match", "close-blocker", "other"]);
});

test("the built-in sample data follows the contract", async () => {
  mockInbox.reset();
  const items = normaliseInbox(await mockInbox.list());
  assert.deepEqual([...new Set(items.map((entry) => entry.kind))].sort(), ["bank-match", "close-blocker", "exceptions", "fraud", "supplier-email"]);
  assert.ok(items.every((entry) => entry.title && entry.why && entry.evidence.length > 0));
  const { flags } = normaliseFraud(mockFraud("a"));
  assert.ok(flags.length > 0 && flags.every((flag) => flag.code && flag.title && flag.message && flag.action && flag.evidence.length > 0));
});

test("Accept can run only writes to this app's own API, follow-ups included", () => {
  assert.equal(actionIsRunnable(ACCEPT), true);
  for (const path of ["https://evil.example/api/x", "//evil.example/api/x", "/api/../admin", "/other/api/x", "api/x", "/api//x"]) {
    assert.equal(actionIsRunnable({ ...ACCEPT, path }), false, path);
  }
  assert.equal(actionIsRunnable({ ...ACCEPT, method: "GET" }), false);
  assert.equal(actionIsRunnable({ ...ACCEPT, method: "DELETE" }), false);
  assert.equal(actionIsRunnable({ ...ACCEPT, method: "LINK", path: "documents/x" }), false);
  assert.equal(actionIsRunnable({ ...ACCEPT, then: [{ method: "POST", path: "https://evil.example/x" }] }), false);
});

test("evidence links are in-app page segments with the area prefix; anything that leaves the app is dropped", () => {
  assert.equal(resolveEvidenceHref("documents/d1", "company"), "/company/documents/d1");
  assert.equal(resolveEvidenceHref("reconciliation?status=unmatched", "workspace"), "/workspace/reconciliation?status=unmatched");
  assert.equal(resolveEvidenceHref("/workspace/documents/d1", "workspace"), "/workspace/documents/d1");
  assert.equal(resolveEvidenceHref(null, "company"), undefined);
  assert.equal(resolveEvidenceHref("https://evil.example", "company"), undefined);
  assert.equal(resolveEvidenceHref("//evil.example", "company"), undefined);
  assert.equal(resolveEvidenceHref("javascript:alert(1)", "company"), undefined);
});

// ------------------------------------------------------------------ the page

test("the page shows cards grouped by kind with title, why, evidence links, Accept and Dismiss", () => {
  const link: InboxAction = { label: "Open approval queue", method: "LINK", path: "approvals", then: [] };
  const out = view(base({ items: [item(), item({ id: "b1", kind: "bank-match", title: "Bank line matches PB-0041", basis: ["Rule", "Match"], actions: [ACCEPT, link] }), DRAFT] }));
  assert.match(out, /Grouped exceptions/);
  assert.match(out, /Bank-match proposals/);
  assert.match(out, /Drafted supplier emails/);
  assert.match(out, /12 documents share one cause/);
  assert.match(out, /The same supplier is missing\./);
  assert.match(out, /href="\/company\/exceptions\?lane=needs-fixing"/);
  // The match basis and a LINK action (a page, not a call) are shown.
  assert.match(out, /aria-label="Why this match was chosen"><span>Rule<\/span><span>Match<\/span>/);
  assert.match(out, /href="\/company\/approvals"[^>]*>Open approval queue</);
  // A link that leaves the app is shown as plain text, never as a link.
  assert.doesNotMatch(out, /href="https:\/\/evil/);
  assert.match(out, /aria-label="Accept: Add “Seladah Trading” as a supplier"/);
  assert.match(out, />Dismiss</);
});

test("loading, empty, error-with-retry and assistant-off states", () => {
  assert.doesNotMatch(view(base({ phase: "loading" })), /Grouped exceptions|Nothing to review/);
  assert.match(view(base({ items: [] })), /Nothing to review/);
  const error = view(base({ phase: "error", error: "The backend could not complete this request (500)." }));
  assert.match(error, /The backend could not complete this request \(500\)\./);
  assert.match(error, />Try again</);
  const off = view(base({ phase: "off" }));
  assert.match(off, /not turned on/);
  assert.doesNotMatch(off, />Accept</);
});

test("a failed refresh keeps the cards and offers a retry", () => {
  const out = view(base({ items: [item()], error: "Could not refresh the inbox." }));
  assert.match(out, /12 documents share one cause/);
  assert.match(out, /Could not refresh the inbox\./);
  assert.match(out, />Try again</);
});

// ------------------------------------------------------------------ confirm before accept

test("Accept only opens a confirmation: nothing runs until it is confirmed", async () => {
  const { flow: inbox, calls } = flow();
  await inbox.refresh();
  assert.equal(inbox.requestAccept(inbox.getState().items[0], ACCEPT), true);
  assert.equal(inbox.getState().pending?.action, ACCEPT);
  assert.equal(calls.run.length, 0, "opening the confirmation must not call the endpoint");
  inbox.cancel();
  assert.equal(inbox.getState().pending, null);
  assert.equal(calls.run.length, 0);
});

test("confirming runs exactly the listed action once, then refreshes the list", async () => {
  const { flow: inbox, calls } = flow();
  await inbox.refresh();
  inbox.requestAccept(inbox.getState().items[0], ACCEPT);
  const first = inbox.confirm();
  const second = inbox.confirm(); // a double click
  assert.equal(await first, true);
  assert.equal(await second, false);
  assert.deepEqual(calls.run, [ACCEPT], "one accept, with its follow-ups carried inside it");
  assert.equal(calls.load, 2, "the list is loaded again after the action");
  assert.deepEqual(inbox.getState().items, []);
  assert.equal(inbox.getState().pending, null);
  assert.match(inbox.getState().notice, /Done: Add/);
});

test("a failed action keeps the confirmation open with the reason, and can be retried", async () => {
  let attempts = 0;
  const ran: InboxAction[] = [];
  const { flow: inbox } = flow([item()], { run: async (action) => { attempts += 1; if (attempts === 1) throw new Error("That supplier already exists."); ran.push(action); } });
  await inbox.refresh();
  inbox.requestAccept(inbox.getState().items[0], ACCEPT);
  assert.equal(await inbox.confirm(), false);
  assert.equal(inbox.getState().pending?.error, "That supplier already exists.");
  assert.equal(inbox.getState().pending?.running, false);
  assert.equal(await inbox.confirm(), true);
  assert.equal(inbox.getState().pending, null);
  assert.deepEqual(ran, [ACCEPT]);
});

test("an action that is not a write to the API cannot even be proposed", async () => {
  const { flow: inbox } = flow();
  await inbox.refresh();
  assert.equal(inbox.requestAccept(inbox.getState().items[0], { ...ACCEPT, path: "https://evil.example/x" }), false);
  assert.equal(inbox.getState().pending, null);
});

test("the confirmation names every call in order, the body and who runs it", () => {
  const out = html(createElement(ConfirmAcceptDialog, { pending: { item: item(), action: ACCEPT, running: false, error: "" }, userName: "Aina", onConfirm() {}, onCancel() {} }));
  assert.match(out, /as Aina/);
  assert.match(out, /Add “Seladah Trading” as a supplier/);
  assert.match(out, /Add Seladah Trading and check 2 documents again\?/, "the backend's own confirm sentence");
  assert.match(out, /<code>POST \/api\/contacts<\/code>.*<code>POST \/api\/documents\/d1\/revalidate<\/code>.*<code>POST \/api\/documents\/d2\/revalidate<\/code>/);
  assert.match(out, /stop at the first one that fails/);
  assert.match(out, /name: Seladah Trading/);
  assert.match(out, /type: supplier/);
  assert.match(out, />Cancel</);
  assert.match(out, />Yes, run it</);
  assert.deepEqual(describeAction(ACCEPT).calls, ["POST /api/contacts", "POST /api/documents/d1/revalidate", "POST /api/documents/d2/revalidate"]);
});

test("a page rendered with an open confirmation shows it", () => {
  const out = view(base({ items: [item()], pending: { item: item(), action: ACCEPT, running: false, error: "" } }));
  assert.match(out, /Confirm before running/);
});

test("dismiss removes only that card", async () => {
  const { flow: inbox, calls } = flow([item(), item({ id: "g2", title: "second" })]);
  await inbox.refresh();
  await inbox.dismiss("g1");
  assert.deepEqual(calls.dismiss, ["g1"]);
  assert.deepEqual(inbox.getState().items.map((entry) => entry.id), ["g2"]);
  assert.equal(inbox.getState().dismissing.size, 0);
});

// ------------------------------------------------------------------ drafts are copy-only

test("a drafted email offers Copy and nothing that sends or runs", () => {
  // The backend lists COPY, MAILTO and LINK for a draft, and may list a runnable action too: only Copy and the page link show.
  const listed: InboxAction[] = [ACCEPT, { label: "Copy email", method: "COPY", path: "", then: [] }, { label: "Open in mail app", method: "MAILTO", path: "", then: [] },
    { label: "Open document", method: "LINK", path: "documents/d9", then: [] }];
  const out = html(createElement(InboxCard, { item: { ...DRAFT, actions: listed }, prefix: "company", busy: false, onAccept() {}, onDismiss() {} }));
  assert.match(out, /Copy/);
  assert.match(out, /href="\/company\/documents\/d9"/);
  assert.doesNotMatch(out, /Open in mail app/);
  assert.match(out, /Nothing is sent from here/);
  assert.match(out, /Dear team,/);
  assert.doesNotMatch(out, />Accept</);
  assert.doesNotMatch(out, /aria-label="Accept/);
  assert.doesNotMatch(out, /mailto:|>Send/i);
  assert.match(html(createElement(DraftBlock, { draft: DRAFT.draft! })), /a@b\.example/);
});

test("Copy puts the whole draft on the clipboard", () => {
  assert.equal(draftClipboardText(DRAFT.draft!), "Query\n\nDear team,\n\nPlease confirm.");
  assert.equal(draftClipboardText({ body: "Only body" }), "Only body");
});

test("a draft cannot be accepted even if the backend lists an action for it", async () => {
  const { flow: inbox } = flow([{ ...DRAFT, actions: [ACCEPT] }]);
  await inbox.refresh();
  assert.equal(inbox.requestAccept(inbox.getState().items[0], ACCEPT), false);
});

test("nothing in the inbox feature can send an email", () => {
  const dir = new URL("../src/features/common/inbox/", import.meta.url);
  for (const file of readdirSync(dir)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const text = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(text, /mailto:|sendMail|smtp/i, file);
  }
});

// ------------------------------------------------------------------ flag off

test("a 403 means the assistant is off: the page and menu hide the feature", async () => {
  const { flow: inbox } = flow([item()], { load: async () => { throw new AiAssistOffError(); } });
  await inbox.refresh();
  assert.equal(inbox.getState().phase, "off");
  assert.deepEqual(inbox.getState().items, []);
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("AI_ASSIST off (404 with its code, or an older 403) reads as the assistant being off, for the inbox and the shield", async () => {
  const off = { detail: { code: "AI_ASSIST_OFF", message: "The AI assistant is off." } };
  assert.equal(isAssistOff(new ApiError("x", 404, off.detail), "inbox"), true);
  assert.equal(isAssistOff(new ApiError("x", 404, off.detail), "fraud"), true);
  assert.equal(isAssistOff(new ApiError("x", 403), "fraud"), true);
  assert.equal(isAssistOff(new ApiError("x", 404), "inbox"), true, "a backend without the inbox at all");
  assert.equal(isAssistOff(new ApiError("No such document", 404), "fraud"), false, "a fraud 404 can be a missing document");
  assert.equal(isAssistOff(new ApiError("boom", 500), "inbox"), false);
  const realFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => { paths.push(String(input)); return json(404, off); }) as typeof fetch;
  try {
    await assert.rejects(getInbox(), AiAssistOffError);
    await assert.rejects(getDocumentFraud("d 1"), AiAssistOffError);
    assert.ok(paths.some((path) => path.endsWith("/api/inbox")));
    assert.ok(paths.some((path) => path.endsWith("/api/insights/fraud?documentId=d%201")));
  } finally { globalThis.fetch = realFetch; }
});

test("a confirmed action calls its listed endpoint and then each follow-up, in order, as the signed-in user", async () => {
  const realFetch = globalThis.fetch;
  const seen: { url: string; method?: string; body?: unknown; credentials?: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { seen.push({ url: String(input), method: init?.method, body: init?.body, credentials: init?.credentials }); return json(200, {}); }) as typeof fetch;
  try {
    await runInboxAction(ACCEPT);
    assert.deepEqual(seen.map((call) => call.url.replace(/^.*(?=\/api\/)/, "")), ["/api/contacts", "/api/documents/d1/revalidate", "/api/documents/d2/revalidate"]);
    assert.equal(seen[0].method, "POST");
    assert.deepEqual(JSON.parse(String(seen[0].body)), ACCEPT.body);
    assert.ok(seen.every((call) => call.credentials === "include"));
    const before = seen.length;
    await assert.rejects(runInboxAction({ ...ACCEPT, path: "https://evil.example/x" }));
    await assert.rejects(runInboxAction({ ...ACCEPT, then: [{ method: "POST", path: "https://evil.example/x" }] }));
    assert.equal(seen.length, before, "an unsafe action never reaches fetch, even when only a follow-up is unsafe");
  } finally { globalThis.fetch = realFetch; }
});

test("the follow-ups stop at the first failure and say which step failed", async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => { urls.push(String(input)); return String(input).endsWith("/d1/revalidate") ? json(422, { detail: "Cannot re-check this document." }) : json(200, {}); }) as typeof fetch;
  try {
    await assert.rejects(runInboxAction(ACCEPT), /The first step worked, but step 2 of 3 \(POST \/api\/documents\/d1\/revalidate\) failed: Cannot re-check this document\./);
    assert.equal(urls.length, 2, "step 3 never ran");
  } finally { globalThis.fetch = realFetch; }
});

test("the AI links are in the menu for both roles only when the assistant is on", () => {
  for (const [role, area] of [["ACCOUNTANT", "workspace"], ["LOCAL_ADMIN", "company"]] as const) {
    const off = navLeaves(jobNavigation(role, false)).map((entry) => entry.label);
    assert.ok(!off.includes("AI Inbox") && !off.includes("Insights"), `${role} off`);
    const on = navLeaves(jobNavigation(role, true));
    assert.deepEqual(on.filter((entry) => ["AI Inbox", "Insights"].includes(entry.label)).map((entry) => navHref(area, entry)), [`/${area}/ai-inbox`, `/${area}/insights`]);
    assert.equal(on.find((entry) => entry.label === "AI Inbox")?.count, "ai-inbox");
    for (const entry of on) assert.ok(isAllowedWorkspaceRoute([area, entry.page], role), `${role} cannot open ${entry.page}`);
  }
  // The default menu is unchanged.
  assert.deepEqual(jobNavigation("ACCOUNTANT"), jobNavigation("ACCOUNTANT", false));
  assert.ok(navLeaves(jobNavigation("LOCAL_ADMIN", true)).some((entry) => entry.label === "Audit trail"), "the admin group stays");
});

test("the menu badge reads the inbox count only once the backend answered", () => {
  const shell = source("components/common/layout/app-shell.tsx");
  assert.match(shell, /useAiNav\(!isAdmin\)/);
  assert.match(shell, /jobNavigation\(user\.role, aiNav\.available\)/);
  assert.match(shell, /entry\.count === "ai-inbox"/);
  assert.match(source("features/common/inbox/use-inbox.ts"), /available: enabled && state\.phase === "ready"/);
});

// ------------------------------------------------------------------ Fraud Shield

const FLAGS = normaliseFlags({ flags: [
  { code: "FS-NEAR-DUP", severity: "medium", title: "Possible duplicate", message: "Looks like PB-0038.", evidence: [{ label: "Earlier", value: "PB-0038", href: "purchases/b38" }], action: "Compare invoice numbers." },
  { code: "FS-BANK-CHANGE", severity: "high", title: "Bank account changed", message: "New bank account.", evidence: [], action: "Call the supplier." },
] });

test("the chip is green with no warnings, amber for advice and red when a flag is high", () => {
  assert.equal(shieldLabel([]), "No warnings");
  assert.equal(shieldTone([]), "clear");
  assert.equal(shieldTone(FLAGS.slice(0, 1)), "amber");
  assert.equal(shieldTone(FLAGS), "red");
  assert.equal(shieldLabel(FLAGS.slice(0, 1)), "1 warning");
  assert.equal(shieldLabel(FLAGS), "2 warnings");
  const chip = (flags: typeof FLAGS) => html(createElement(ShieldChip, { shield: { status: "on", flags }, onOpen() {} }));
  assert.match(chip([]), /is-clear/);
  assert.match(chip([]), /No warnings/);
  assert.match(chip(FLAGS.slice(0, 1)), /is-amber/);
  assert.match(chip(FLAGS), /is-red/);
  assert.match(chip(FLAGS), /2 warnings/);
});

test("the chip is absent while loading and when the assistant is off", () => {
  for (const status of ["loading", "off"] as const) {
    assert.equal(html(createElement(ShieldChip, { shield: { status, flags: [] }, onOpen() {} })), "");
  }
  assert.match(html(createElement(ShieldChip, { shield: { status: "error", flags: [] }, onOpen() {} })), /Shield unavailable/);
  assert.equal(hasFraudWarnings({ status: "off", flags: FLAGS }), false);
  assert.equal(hasFraudWarnings({ status: "error", flags: [] }), false);
  assert.equal(hasFraudWarnings({ status: "on", flags: FLAGS }), true);
});

test("the panel lists each flag with its message, evidence and suggested action", () => {
  const out = html(createElement(ShieldFlagList, { flags: FLAGS, prefix: "workspace" }));
  assert.match(out, /Possible duplicate/);
  assert.match(out, /Looks like PB-0038\./);
  assert.match(out, /href="\/workspace\/purchases\/b38"/);
  assert.match(out, /Suggested: <\/strong>Compare invoice numbers\./);
  assert.match(out, /High/);
});

test("approving past a warning needs a reason", () => {
  assert.equal(approveAnywayReady(""), false);
  assert.equal(approveAnywayReady("x".repeat(APPROVE_ANYWAY_MIN - 1)), false);
  assert.equal(approveAnywayReady(" ".repeat(20)), false);
  assert.equal(approveAnywayReady("Confirmed by phone."), true);
  const form = html(createElement(ApproveAnywayForm, { flags: FLAGS, prefix: "company", busy: false, onConfirm() {}, onCancel() {} }));
  assert.match(form, /<button[^>]*disabled=""[^>]*>Approve anyway<\/button>/, "starts disabled with no reason");
  assert.match(form, /Why is it safe to approve this anyway\?/);
});

test("the reason is recorded as an acknowledgement of the shown codes, before the approval", async () => {
  assert.deepEqual(approveAnywayCodes(FLAGS), ["FS-NEAR-DUP", "FS-BANK-CHANGE"]);
  assert.deepEqual(approveAnywayCodes([...FLAGS, ...FLAGS]), ["FS-NEAR-DUP", "FS-BANK-CHANGE"], "each code once");
  const realFetch = globalThis.fetch;
  const seen: { url: string; method?: string; body?: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { seen.push({ url: String(input), method: init?.method, body: init?.body }); return json(201, {}); }) as typeof fetch;
  try {
    const { acknowledgeFraud } = await import("../src/lib/api/inbox.service");
    await acknowledgeFraud("doc 1", ["FS-BANK-CHANGE"], "  Confirmed by phone with the finance manager.  ");
    assert.ok(seen[0].url.endsWith("/api/insights/fraud/doc%201/acknowledge"));
    assert.equal(seen[0].method, "POST");
    assert.deepEqual(JSON.parse(String(seen[0].body)), { codes: ["FS-BANK-CHANGE"], reason: "Confirmed by phone with the finance manager." });
  } finally { globalThis.fetch = realFetch; }
});

test("the review page asks for the reason before approving a flagged document, and records it first", () => {
  const review = source("features/common/documents/document-review.tsx");
  // A flagged document opens the reason dialog instead of approving; a clear one approves as before.
  assert.match(review, /hasFraudWarnings\(shield\) \? setAnywayOpen\(true\) : decide\("approved"/);
  // The confirmed reason is acknowledged first; the unchanged decision call follows, and does not run if that fails.
  assert.match(review, /decide\("approved", "Approved", "Document approved and saved to records\.", \(\) => acknowledgeFraud\(documentId, approveAnywayCodes\(shield\.flags\), reason\)\)/);
  assert.match(review, /await before\?\.\(\);\s*await decideDocumentReview\(/);
  // The chip sits in the header; the existing decision call is the only one used.
  assert.match(review, /<ShieldChip shield=\{shield\}/);
  assert.equal(review.match(/decideDocumentReview\(/g)?.length, 1);
});

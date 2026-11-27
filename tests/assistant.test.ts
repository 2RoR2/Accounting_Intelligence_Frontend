/** Ask AccordAI panel: facts and sources, refusal and fallback states, model text is never HTML, the flag-off case. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compiles JSX with the classic runtime; the components rely on Next's automatic one.
(globalThis as { React?: typeof React }).React = React;
import { AnswerView, FactChip, SourcesList } from "../src/features/common/assistant/answer-view";
import { composerKeyAction, formatFactValue, normaliseAnswer, pageFromPath, safeHref, splitAnswer, wireContext } from "../src/features/common/assistant/assistant-logic";
import { AskButtonView, ExplainThisButton } from "../src/features/common/assistant/assistant-panel";
import { createAssistantStore, friendlyError, type AssistantClient, type TextStorage } from "../src/features/common/assistant/assistant-store";
import { mockAsk, mockSuggestions, mockTiming } from "../src/features/common/assistant/mock";
import type { AssistantAnswer } from "../src/features/common/assistant/types";
import { ApiError } from "../src/lib/api/client";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const answer = (patch: Partial<AssistantAnswer> = {}): AssistantAnswer => ({
  answer: "Expenses were {{f1}} in November, up {{f2}} on October.",
  facts: [
    { id: "f1", label: "Expenses, Nov 2026", value: "18,420.00", unit: "RM", href: "/workspace/reports/profit-and-loss?period=2026-11" },
    { id: "f2", label: "Change from October", value: "3,160.00", unit: "RM", href: "/workspace/reports/profit-and-loss?compare=2026-10" },
  ],
  citations: [{ label: "Profit and loss, November 2026", href: "/workspace/reports/profit-and-loss" }, { label: "Supplier bills", href: null }],
  refused: false, fallback: false, suggestions: ["Which bills are due next week?"], auditId: "9f3a1c2e77aa",
  toolsUsed: ["compare_periods"], model: "gpt-oss-20b",
  ...patch,
});

/* ---------- Links ---------- */

test("a link is used only when it is an in-app path from the server", () => {
  assert.equal(safeHref("/workspace/reports/profit-and-loss?period=2026-11#top"), "/workspace/reports/profit-and-loss?period=2026-11#top");
  for (const bad of ["https://evil.example/x", "http://localhost/x", "//evil.example", "javascript:alert(1)", "\\\\evil", "/ok\\evil", "/with space", "/tab\there", "data:text/html,x", "", "   ", null, undefined, 42, {}]) {
    assert.equal(safeHref(bad), null, String(bad));
  }
  assert.equal(safeHref(`/${"a".repeat(600)}`), null);
});

test("the panel never builds a link from an id: every href goes through safeHref", () => {
  for (const file of ["answer-view.tsx", "assistant-panel.tsx", "assistant-store.ts"]) {
    // Comments may name the rule ("no dangerouslySetInnerHTML"); only code counts.
    const code = source(`features/common/assistant/${file}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|document\.write|\beval\(/, file);
  }
  assert.match(source("features/common/assistant/answer-view.tsx"), /safeHref\(fact\.href\)/);
  assert.match(source("features/common/assistant/answer-view.tsx"), /safeHref\(citation\.href\)/);
});

/* ---------- Parsing ---------- */

test("a response is trimmed to the contract: unknown fields, bad hrefs and duplicate facts are dropped", () => {
  const parsed = normaliseAnswer({
    answer: "Hello", extra: "ignored", refused: "yes", fallback: true,
    facts: [
      { id: "f1", label: "A", value: "1.00", unit: "RM", href: "javascript:alert(1)" },
      { id: "f1", label: "dup", value: "9", unit: null, href: "/x" },
      { id: "", label: "no id", value: "1" },
      { id: "f2", label: "B", value: "", href: "/x" },
      "junk", null,
      { id: "f3", label: "C", value: "3", unit: "%", href: "/ok" },
    ],
    citations: [{ label: "R", href: "https://evil.example" }, { label: "R", href: "https://evil.example" }, { label: "", href: "/x" }, { label: "S", href: "/s" }],
    suggestions: ["Q1", "  ", 5, "Q2", "Q3", "Q4", "Q5"], auditId: "abc",
  });
  assert.equal(parsed.refused, false, "only a real true refuses");
  assert.equal(parsed.fallback, true);
  assert.deepEqual(parsed.facts.map((fact) => [fact.id, fact.href]), [["f1", null], ["f3", "/ok"]]);
  assert.deepEqual(parsed.citations, [{ label: "R", href: null }, { label: "S", href: "/s" }]);
  assert.deepEqual(parsed.suggestions, ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(normaliseAnswer(null), { answer: "", facts: [], citations: [], refused: false, fallback: false, suggestions: [], auditId: null, toolsUsed: [], model: null });
  const extras = normaliseAnswer({ toolsUsed: ["compare_periods", "x; DROP", 5, "ageing"], model: "gpt-oss-20b" });
  assert.deepEqual(extras.toolsUsed, ["compare_periods", "ageing"]);
  assert.equal(extras.model, "gpt-oss-20b");
});

test("{{f1}} markers become chips in place; unknown markers are dropped; unused facts go to the Figures row", () => {
  const { segments, loose } = splitAnswer("A {{f1}} and {{ f2 }} then {{f9}} end", answer().facts);
  assert.deepEqual(segments.map((segment) => (segment.type === "text" ? segment.text : `<${segment.fact.id}>`)), ["A ", "<f1>", " and ", "<f2>", " then ", " end"]);
  assert.deepEqual(loose, []);
  assert.deepEqual(splitAnswer("No markers here", answer().facts).loose.map((fact) => fact.id), ["f1", "f2"]);
});

test("a figure reads 'RM 18,420.00', '6 bills' or '12%', and the unit is never doubled", () => {
  assert.equal(formatFactValue({ value: "18,420.00", unit: "RM" }), "RM 18,420.00");
  assert.equal(formatFactValue({ value: "RM 18,420.00", unit: "RM" }), "RM 18,420.00");
  assert.equal(formatFactValue({ value: "6", unit: "bills" }), "6 bills");
  assert.equal(formatFactValue({ value: "12", unit: "%" }), "12%");
  assert.equal(formatFactValue({ value: "42", unit: null }), "42");
});

test("the backend's units read naturally: MYR gets 'RM' and thousands separators, count, date and text are shown as sent", () => {
  assert.equal(formatFactValue({ value: "4210.00", unit: "MYR" }), "RM 4,210.00");
  assert.equal(formatFactValue({ value: "1234567.50", unit: "MYR" }), "RM 1,234,567.50");
  assert.equal(formatFactValue({ value: "-3160.00", unit: "MYR" }), "RM -3,160.00");
  assert.equal(formatFactValue({ value: "6", unit: "count" }), "6");
  assert.equal(formatFactValue({ value: "2026-12-04", unit: "date" }), "2026-12-04");
  assert.equal(formatFactValue({ value: "Seladah Utilities", unit: "text" }), "Seladah Utilities");
  assert.equal(formatFactValue({ value: "n/a", unit: "MYR" }), "RM n/a", "a value that is not a plain number is left alone");
});

test("the context sent to the backend includes the document id, and nothing it would reject", () => {
  assert.deepEqual(wireContext({ page: "documents", documentId: "0b0e6f5e-1111-4222-8333-444455556666", label: "INV-1", foo: "bar" } as never),
    { page: "documents", documentId: "0b0e6f5e-1111-4222-8333-444455556666" });
});

test("the 'How this was answered' note names the tools, and says when no model was used", () => {
  const withModel = renderToStaticMarkup(createElement(AnswerView, { answer: answer() }));
  assert.match(withModel, /How this was answered/);
  assert.match(withModel, /compare periods/);
  assert.match(withModel, /Worded by gpt-oss-20b/);
  const rules = renderToStaticMarkup(createElement(AnswerView, { answer: answer({ fallback: true, model: null, toolsUsed: ["cash_position", "ageing"] }) }));
  assert.match(rules, /cash position, then ageing/);
  assert.match(rules, /No AI model was used/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(AnswerView, { answer: answer({ toolsUsed: [] }) })), /How this was answered/);
});

test("only the four documented context keys are sent, and the page comes from the path", () => {
  assert.deepEqual(wireContext({ page: "reports", reportType: "profit-and-loss", period: "2026-11", label: "P&L Nov", recordId: " ", extra: "x" } as never),
    { page: "reports", reportType: "profit-and-loss", period: "2026-11" });
  assert.equal(pageFromPath("/workspace/reports/profit-and-loss"), "reports");
  assert.equal(pageFromPath("/company/dashboard"), "dashboard");
  assert.equal(pageFromPath("/"), "");
});

test("Enter sends, Shift+Enter adds a line, and text still being composed is left alone", () => {
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: false }), "send");
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: true }), "newline");
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: true }), "none");
  assert.equal(composerKeyAction({ key: "a", shiftKey: false }), "none");
});

/* ---------- Rendering: facts and sources ---------- */

test("an answer shows each cited figure as a chip that links to its record, and a Sources list", () => {
  const html = renderToStaticMarkup(createElement(AnswerView, { answer: answer() }));
  assert.match(html, /Expenses were /);
  assert.match(html, /<a[^>]*class="ask-chip is-inline"[^>]*href="\/workspace\/reports\/profit-and-loss\?period=2026-11"/);
  assert.match(html, /RM 18,420\.00/);
  assert.match(html, /RM 3,160\.00/);
  assert.match(html, /aria-label="Expenses, Nov 2026: RM 18,420\.00\. Open the record\."/);
  assert.match(html, /<h4>Sources<\/h4>/);
  assert.match(html, /<a[^>]*href="\/workspace\/reports\/profit-and-loss"[^>]*>Profit and loss, November 2026/);
  assert.match(html, /<span>Supplier bills<\/span>/, "a source with no link is plain text");
  assert.match(html, /Logged · ref 9f3a1c2e/);
  assert.doesNotMatch(html, /ask-facts/, "every fact is placed inline, so there is no Figures row");
});

test("facts the text does not mention are listed as labelled chips below it", () => {
  const html = renderToStaticMarkup(createElement(AnswerView, { answer: answer({ answer: "Here are the figures." }) }));
  assert.match(html, /class="ask-facts"/);
  assert.match(html, /Expenses, Nov 2026<\/span><strong>RM 18,420\.00<\/strong>/);
  assert.match(html, /Change from October/);
});

test("a figure without a link is a plain chip, not a dead link", () => {
  const html = renderToStaticMarkup(createElement(FactChip, { fact: { id: "f1", label: "Count", value: "6", unit: "bills", href: null } }));
  assert.match(html, /^<span class="ask-chip is-static"/);
  assert.doesNotMatch(html, /<a /);
  assert.equal(renderToStaticMarkup(createElement(SourcesList, { citations: [] })), "");
});

test("follow-up questions appear only when the panel can ask them", () => {
  assert.doesNotMatch(renderToStaticMarkup(createElement(AnswerView, { answer: answer() })), /ask-followup/);
  const html = renderToStaticMarkup(createElement(AnswerView, { answer: answer(), onAsk: () => {} }));
  assert.match(html, /<button[^>]*class="ask-followup"[^>]*>Which bills are due next week\?<\/button>/);
});

/* ---------- Rendering: fallback and refusal ---------- */

test("a rule-based answer carries the 'Answered without the AI model' badge; a model answer does not", () => {
  assert.match(renderToStaticMarkup(createElement(AnswerView, { answer: answer({ fallback: true }) })), /Answered without the AI model/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(AnswerView, { answer: answer() })), /Answered without the AI model/);
});

test("a refusal has its own style and heading, and says why in plain words", () => {
  const html = renderToStaticMarkup(createElement(AnswerView, {
    answer: answer({ refused: true, facts: [], answer: "I cannot post bills. Use the Review queue.", citations: [{ label: "Review queue", href: "/workspace/review" }] }),
  }));
  assert.match(html, /class="ask-answer is-refused"/);
  assert.match(html, /I can(&#x27;|')t help with that here/);
  assert.match(html, /I cannot post bills\. Use the Review queue\./);
  assert.match(html, /aria-label="AccordAI cannot help with this"/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(AnswerView, { answer: answer() })), /is-refused/);
});

/* ---------- Model text is never HTML ---------- */

test("model text is shown as text: tags, event handlers and Markdown stay inert", () => {
  const hostile = `<img src=x onerror="alert(1)"><script>alert(2)</script> **bold** [click](javascript:alert(3)) {{f1}}`;
  const html = renderToStaticMarkup(createElement(AnswerView, {
    answer: answer({
      answer: hostile,
      facts: [{ id: "f1", label: "<b>Label</b>", value: "<i>9</i>", unit: "RM", href: "javascript:alert(4)" }],
      citations: [{ label: "<script>x</script>", href: "https://evil.example/phish" }],
      suggestions: ["<img src=y onerror=alert(5)>"],
    }),
    onAsk: () => {},
  }));
  // The angle brackets arrive as entities, so no element is created from the model's text.
  assert.doesNotMatch(html, /<img|<script|<b>|<i>/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /\*\*bold\*\*/, "Markdown is not rendered");
  assert.match(html, /\[click\]\(javascript:alert\(3\)\)/, "a Markdown link stays text");
  // A hostile href is dropped by the response parser, and the view refuses it again on its own.
  assert.doesNotMatch(html, /href="(javascript|https?:)/);
  const parsed = normaliseAnswer({ answer: hostile, facts: [{ id: "f1", label: "L", value: "9", href: "javascript:alert(4)" }], citations: [{ label: "S", href: "https://evil.example" }] });
  assert.equal(parsed.facts[0].href, null);
  assert.equal(parsed.citations[0].href, null);
});

test("a user's own question is rendered as text too", () => {
  const code = source("features/common/assistant/assistant-panel.tsx");
  assert.match(code, /<p>\{turn\.question\}<\/p>/);
});

/* ---------- The flag-off case ---------- */

test("the Ask button shows only when the assistant is on: not while checking, not when off, not for other roles", () => {
  const view = (availability: "checking" | "on" | "off", hosted = true) => renderToStaticMarkup(createElement(AskButtonView, { availability, hosted, open: false, onClick: () => {} }));
  assert.match(view("on"), /Ask AccordAI/);
  assert.match(view("on"), /aria-haspopup="dialog"/);
  assert.equal(view("checking"), "");
  assert.equal(view("off"), "");
  assert.equal(view("on", false), "", "no host mounted (a super admin, a public page)");
  // "Explain this" buttons hide the same way (nothing is hosted during server rendering).
  assert.equal(renderToStaticMarkup(createElement(ExplainThisButton, { context: { reportType: "profit-and-loss" } })), "");
});

test("the shell offers the assistant to accountants and local admins only", () => {
  const shell = source("components/common/layout/app-shell.tsx");
  assert.match(shell, /\(isAccountant \|\| isCompanyAdmin\) && <AskAssistantButton \/>/);
  assert.match(shell, /\(isAccountant \|\| isCompanyAdmin\) && <AssistantHost user=\{user\} pathname=\{pathname\} \/>/);
});

type Call = { question: string; context: object };
function fakeClient(overrides: Partial<AssistantClient> = {}) {
  const asked: Call[] = [];
  const client: AssistantClient = {
    ask: async (question, context) => { asked.push({ question, context }); return answer(); },
    suggestions: async () => ["Why were expenses higher?", "Which bills are due?"],
    isOff: (error) => error instanceof ApiError && (error.status === 403 || error.status === 404),
    ...overrides,
  };
  return { client, asked };
}
function memoryStorage(): TextStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}

test("a 403 from the suggestions check keeps the assistant off: nothing opens, nothing is stored", async () => {
  const { client } = fakeClient({ suggestions: async () => { throw new ApiError("AI_ASSIST is off", 403); } });
  const storage = memoryStorage();
  const store = createAssistantStore(client, () => storage);
  store.mount("u1", "dashboard");
  await store.settled();
  assert.equal(store.getState().availability, "off");
  assert.equal(store.open({ question: "hello" }), false);
  assert.equal(store.getState().open, false);
  assert.equal(store.send("hello"), false);
  assert.equal(storage.data.size, 0);
});

test("a 403 on an ask (the flag was switched off meanwhile) closes the panel and clears the chat", async () => {
  const { client } = fakeClient({ ask: async () => { throw new ApiError("off", 403); } });
  const storage = memoryStorage();
  const store = createAssistantStore(client, () => storage);
  store.mount("u1", "dashboard");
  await store.settled();
  store.open();
  assert.equal(store.getState().open, true);
  store.send("hello");
  await store.settled();
  assert.equal(store.getState().availability, "off");
  assert.equal(store.getState().open, false);
  assert.deepEqual(store.getState().turns, []);
  assert.equal(storage.data.size, 0);
});

test("a network blip while checking does not hide the assistant; a 401 leaves it hidden until sign-in", async () => {
  const blip = createAssistantStore(fakeClient({ suggestions: async () => { throw new Error("Unable to reach the backend API."); } }).client, () => null);
  blip.mount("u1", "dashboard");
  await blip.settled();
  assert.equal(blip.getState().availability, "on");
  assert.ok(blip.getState().suggestions.dashboard.length > 0, "static starter questions are offered");
  const signedOut = createAssistantStore(fakeClient({ suggestions: async () => { throw new ApiError("expired", 401); } }).client, () => null);
  signedOut.mount("u1", "dashboard");
  await signedOut.settled();
  assert.equal(signedOut.getState().availability, "checking");
});

/* ---------- The conversation ---------- */

test("asking sends the question with the page context and keeps the answer", async () => {
  const { client, asked } = fakeClient();
  const store = createAssistantStore(client, () => memoryStorage());
  store.mount("u1", "reports");
  await store.settled();
  assert.deepEqual(store.getState().suggestions.reports, ["Why were expenses higher?", "Which bills are due?"]);
  assert.equal(store.open(), true);
  assert.equal(store.send("  why were expenses higher?  "), true);
  assert.equal(store.getState().turns[0].state, "pending");
  assert.equal(store.send("a second one while waiting"), false, "one question at a time");
  await store.settled();
  assert.deepEqual(asked, [{ question: "why were expenses higher?", context: { page: "reports" } }]);
  assert.equal(store.getState().turns[0].state, "done");
  assert.equal(store.getState().turns[0].answer?.facts.length, 2);
  assert.equal(store.send("   "), false);
  assert.equal(store.send("x".repeat(900)), true);
  await store.settled();
  assert.equal(asked[1].question.length, 500);
});

test("an 'Explain this' button opens the panel about one report and sends its question at once", async () => {
  const { client, asked } = fakeClient();
  const store = createAssistantStore(client, () => memoryStorage());
  store.mount("u1", "reports");
  await store.settled();
  assert.equal(store.open({ context: { reportType: "profit-and-loss", period: "2026-11", label: "Profit and loss, Nov 2026" }, question: "Explain this report" }), true);
  await store.settled();
  assert.deepEqual(asked[0], { question: "Explain this report", context: { page: "reports", reportType: "profit-and-loss", period: "2026-11" } });
  assert.equal(store.getState().turns[0].label, "Profit and loss, Nov 2026");
  assert.equal(store.getState().open, true);
  // The context belongs to its page.
  store.setPage("documents");
  assert.equal(store.getState().pinned, null);
});

test("an Explain request made before the first check answers is held, then sent", async () => {
  const { client, asked } = fakeClient();
  const store = createAssistantStore(client, () => null);
  store.mount("u1", "reports");
  assert.equal(store.getState().availability, "checking");
  assert.equal(store.open({ question: "Explain this" }), true, "accepted, not lost");
  await store.settled();
  assert.equal(store.getState().open, true);
  assert.equal(asked[0].question, "Explain this");
});

test("without a mounted panel (a super admin, a public page) openAssistant does nothing", () => {
  const store = createAssistantStore(fakeClient().client, () => null);
  assert.equal(store.open({ question: "hi" }), false);
  assert.equal(store.getState().open, false);
});

test("a failed question shows an error with Try again, and the retry answers the same question", async () => {
  let fail = true;
  const { client, asked } = fakeClient({ ask: async (question) => { asked.push({ question, context: {} }); if (fail) throw new ApiError("raw backend detail 500", 500); return answer(); } });
  const store = createAssistantStore(client, () => memoryStorage());
  store.mount("u1", "dashboard");
  await store.settled();
  store.open();
  store.send("How much cash?");
  await store.settled();
  const failed = store.getState().turns[0];
  assert.equal(failed.state, "error");
  assert.doesNotMatch(failed.error ?? "", /raw backend detail/, "the user sees plain words, not the server's text");
  assert.match(failed.error ?? "", /try again/i);
  fail = false;
  assert.equal(store.retry(failed.id), true);
  await store.settled();
  assert.equal(store.getState().turns.length, 1, "the retry answers in place");
  assert.equal(store.getState().turns[0].state, "done");
  assert.equal(store.retry(failed.id), false, "only a failed question can be retried");
});

test("errors are worded for the person: busy, signed out, offline, anything else", () => {
  assert.match(friendlyError(new ApiError("x", 429)), /answered a lot of questions/);
  assert.match(friendlyError(new ApiError("x", 401)), /Sign in again/);
  assert.equal(friendlyError(new Error("Unable to reach the backend API. Check your connection, then try again.")), "Unable to reach the backend API. Check your connection, then try again.");
  assert.match(friendlyError(new Error("TypeError: x is undefined")), /could not answer that just now/);
});

test("New chat clears the thread, and an answer that arrives afterwards is ignored", async () => {
  let release: (value: AssistantAnswer) => void = () => {};
  const { client } = fakeClient({ ask: () => new Promise<AssistantAnswer>((resolve) => { release = resolve; }) });
  const store = createAssistantStore(client, () => memoryStorage());
  store.mount("u1", "dashboard");
  await store.settled();
  store.open();
  store.send("slow one");
  store.newChat();
  release(answer());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(store.getState().turns, []);
});

/* ---------- Kept per tab, in sessionStorage ---------- */

test("the conversation is kept per signed-in user in the tab's storage and restored on the next mount", async () => {
  const storage = memoryStorage();
  const first = createAssistantStore(fakeClient().client, () => storage);
  first.mount("u1", "dashboard");
  await first.settled();
  first.open();
  first.send("Which bills are due?");
  await first.settled();
  assert.deepEqual([...storage.data.keys()], ["accordai-assistant:v1:u1"]);
  const reloaded = createAssistantStore(fakeClient().client, () => storage);
  reloaded.mount("u1", "dashboard");
  assert.equal(reloaded.getState().turns[0].question, "Which bills are due?");
  assert.equal(reloaded.getState().turns[0].state, "done");
  const other = createAssistantStore(fakeClient().client, () => storage);
  other.mount("u2", "dashboard");
  assert.deepEqual(other.getState().turns, [], "another user on the same tab starts empty");
});

test("a question that was cut off by a reload comes back as a retryable error, not a spinner", () => {
  const storage = memoryStorage();
  storage.setItem("accordai-assistant:v1:u1", JSON.stringify([{ id: "t1", question: "Slow", context: {}, state: "pending" }, { id: "t2", question: 5 }, "junk"]));
  const store = createAssistantStore(fakeClient().client, () => storage);
  store.mount("u1", "dashboard");
  assert.equal(store.getState().turns.length, 1);
  assert.equal(store.getState().turns[0].state, "error");
});

test("storage that is blocked, full or corrupt never breaks the panel", async () => {
  const hostile: TextStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
  const store = createAssistantStore(fakeClient().client, () => hostile);
  store.mount("u1", "dashboard");
  await store.settled();
  store.open();
  store.send("Still works?");
  await store.settled();
  assert.equal(store.getState().turns[0].state, "done");
  const corrupt = memoryStorage();
  corrupt.setItem("accordai-assistant:v1:u1", "{not json");
  const again = createAssistantStore(fakeClient().client, () => corrupt);
  again.mount("u1", "dashboard");
  assert.deepEqual(again.getState().turns, []);
  const none = createAssistantStore(fakeClient().client, () => null);
  none.mount("u1", "dashboard");
  await none.settled();
  none.open();
  assert.equal(none.send("No storage at all"), true);
  assert.match(source("features/common/assistant/assistant-store.ts"), /try \{[\s\S]*sessionStorage[\s\S]*\} catch/);
});

/* ---------- The mock follows the contract ---------- */

test("the mock answers in the contract's shape, refuses write requests, and can play the flag-off case", async () => {
  mockTiming.scale = 0;
  const normal = normaliseAnswer(await mockAsk("Why were expenses higher in November?", { page: "reports" }, "1"));
  assert.equal(normal.refused, false);
  assert.ok(normal.facts.length >= 2 && normal.citations.length >= 1 && normal.auditId);
  assert.ok(normal.facts.every((fact) => fact.href?.startsWith("/")));
  const refused = normaliseAnswer(await mockAsk("Please post this bill and email the supplier", {}, "1"));
  assert.equal(refused.refused, true);
  assert.deepEqual(refused.facts, []);
  assert.equal(normaliseAnswer(await mockAsk("How much cash do we have?", {}, "1")).fallback, true);
  await assert.rejects(() => mockAsk("anything", {}, "off"), (error: unknown) => error instanceof ApiError && error.status === 403);
  await assert.rejects(() => mockSuggestions("reports", "off"), (error: unknown) => error instanceof ApiError && error.status === 403);
  assert.equal((await mockSuggestions("reports", "1")).length, 4);
});

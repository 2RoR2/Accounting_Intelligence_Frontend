import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnomalyList, BucketTable, CategoryDonut, ForecastChart, KpiRow, SupplierBars, TrendChart } from "../src/features/common/insights/charts";
import { CommentaryBody, CommentarySection } from "../src/features/common/insights/commentary-card";
import {
  commentaryPath, getInsightsCommentary, normalizeCommentary, normalizeOverview, overviewPath, type Commentary, type InsightsOverview,
} from "../src/features/common/insights/insights-api";
import {
  barWidth, currentPeriod, donutSlices, forecastColumns, forecastIsEmpty, formatFact, horizonFor, niceScale, percent, periodLabel,
  resolveHref, shiftPeriod, spendRows, trendColumns, unplottedAnomalies,
} from "../src/features/common/insights/insights-data";
import { mockCommentary, mockOverview } from "../src/features/common/insights/insights-mock";

const overview = (): InsightsOverview => normalizeOverview(mockOverview("2026-11"))!;
const commentary = (options: { fallback?: boolean; reason?: string } = {}): Commentary =>
  normalizeCommentary(mockCommentary("2026-11", options))!;
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const noop = () => undefined;
const BASE = "/workspace";

/* ---------- requests and periods ---------- */

test("the requests carry only the chosen period, encoded", () => {
  assert.equal(overviewPath("2026-11"), "/api/insights/overview?period=2026-11");
  assert.equal(commentaryPath("2026-11"), "/api/insights/commentary?period=2026-11");
  assert.equal(overviewPath("2026-11&x=1"), "/api/insights/overview?period=2026-11%26x%3D1");
});

test("periods: current month in Kuala Lumpur, stepping across years, readable labels", () => {
  // 30 Nov 2026 20:00 UTC is already 1 Dec 2026 in Kuala Lumpur.
  assert.equal(currentPeriod(new Date("2026-11-30T20:00:00Z")), "2026-12");
  assert.equal(shiftPeriod("2026-01", -1), "2025-12");
  assert.equal(shiftPeriod("2026-12", 1), "2027-01");
  assert.match(periodLabel("2026-11"), /November 2026/);
});

/* ---------- chart data mapping ---------- */

test("the 30, 60 and 90 day toggle adds one due-date bucket at a time", () => {
  const { forecast } = overview();
  assert.deepEqual(forecastColumns(forecast, 30).map((column) => column.key), ["opening", "overdue", "d1_30"]);
  assert.deepEqual(forecastColumns(forecast, 60).map((column) => column.key), ["opening", "overdue", "d1_30", "d31_60"]);
  // "After 90 days" is on no chart
  assert.deepEqual(forecastColumns(forecast, 90).map((column) => column.key), ["opening", "overdue", "d1_30", "d31_60", "d61_90"]);
});

test("each projected balance is the backend's own horizon figure and past-due items carry none", () => {
  const { forecast } = overview();
  const columns = forecastColumns(forecast, 90);
  const byKey = Object.fromEntries(columns.map((column) => [column.key, column]));
  assert.equal(byKey.opening.balance, forecast.openingBalance);
  assert.equal(byKey.overdue.balance, null);
  assert.equal(byKey.d1_30.balance, horizonFor(forecast, 30)!.projectedBalance);
  assert.equal(byKey.d31_60.balance, horizonFor(forecast, 60)!.projectedBalance);
  assert.equal(byKey.d61_90.balance, horizonFor(forecast, 90)!.projectedBalance);
  assert.equal(byKey.d1_30.receivables, forecast.buckets.find((bucket) => bucket.key === "d1_30")!.receivables);
});

test("an axis always includes zero so a negative balance is drawn below it", () => {
  const scale = niceScale([1200, -3400, 800]);
  assert.ok(scale.min <= -3400 && scale.max >= 1200);
  assert.ok(scale.ticks.includes(0));
  assert.deepEqual(niceScale([0, 0]), { min: 0, max: 1, ticks: [0, 1] });
});

test("spend rows keep the API order with zero and negative rows dropped, and shares come from the API", () => {
  const section = {
    total: "60.00",
    items: [
      { key: "b", name: "B", amount: "30.00", share: "50.00", entries: 2, isOther: false },
      { key: "z", name: "Z", amount: "0.00", share: "0.00", entries: 0, isOther: false },
      { key: "n", name: "N", amount: "-5.00", share: null, entries: 1, isOther: false },
      { key: "o", name: "Other", amount: "30.00", share: "50.00", entries: 4, isOther: true },
    ],
  };
  assert.deepEqual(spendRows(section).map((row) => row.key), ["b", "o"]);
  assert.equal(percent("33.97"), "34%");
  assert.equal(percent(null), null);
  assert.equal(barWidth("15.00", "30.00"), 0.5);
  assert.equal(barWidth("40.00", "30.00"), 1);
  assert.equal(barWidth("5.00", "0.00"), 0);
});

test("donut slices cover the ring once, in order, and a lone row is a full ring", () => {
  const rows = spendRows(overview().spendByCategory);
  const slices = donutSlices(rows, 100, 100, 92, 58);
  assert.equal(slices.length, rows.length);
  assert.ok(Math.abs(slices[slices.length - 1].end - Math.PI * 2) < 1e-9);
  assert.ok(slices.every((slice, index) => index === 0 || Math.abs(slice.start - slices[index - 1].end) < 1e-9));
  const single = donutSlices([rows[0]], 100, 100, 92, 58);
  assert.equal(single.length, 1);
  assert.ok(single[0].end - single[0].start > Math.PI * 2 - 0.001);
  assert.deepEqual(donutSlices([{ ...rows[0], amount: "0.00" }], 100, 100, 92, 58), []);
});

test("only month anomalies are marked on the trend; supplier anomalies and older months are listed without a marker", () => {
  const { trend, anomalies } = overview();
  assert.equal(anomalies.find((anomaly) => anomaly.kind === "supplier")?.month, "2026-10");
  const columns = trendColumns(trend, anomalies);
  assert.deepEqual(columns.map((column) => column.anomalies.length), [0, 0, 0, 0, 0, 1]);
  const older = { ...anomalies[1], id: "old", month: "2026-01" };
  assert.deepEqual(unplottedAnomalies(trend, [...anomalies, older]).map((anomaly) => anomaly.id), ["a1", "old"]);
});

test("fact values use the backend's wording, else read from their unit", () => {
  assert.equal(formatFact({ value: "3160.00", unit: "MYR", display: "RM 3,160.00" }), "RM 3,160.00");
  assert.match(formatFact({ value: "3160.00", unit: "MYR" }), /^RM\s3,160\.00$/);
  assert.equal(formatFact({ value: "12.5", unit: "percent" }), "12.5%");
  assert.equal(formatFact({ value: "3", unit: "count" }), "3");
  assert.equal(formatFact({ value: "12", unit: "days" }), "12 days");
  assert.equal(formatFact({ value: "n/a", unit: "MYR" }), "n/a");
});

test("only in-app paths the signed-in role can open become links", () => {
  assert.equal(resolveHref("/reports/profit-and-loss?fromDate=2026-11-01&toDate=2026-11-27", "/workspace"), "/workspace/reports");
  assert.equal(resolveHref("/reports/ageing?type=payables&asOf=2026-11-27", "/company"), "/company/reports");
  assert.equal(resolveHref("/records", "/company"), "/company/records");
  assert.equal(resolveHref("/contacts/abc", "/workspace"), "/workspace/contacts/abc");
  assert.equal(resolveHref("/workspace/records", "/workspace"), "/workspace/records");
  for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil", "records/1", "", "/nowhere", "/company/users", null, undefined]) {
    assert.equal(resolveHref(bad, "/workspace"), null, String(bad));
  }
  assert.equal(resolveHref("/workspace/records", "/company"), null, "another role's area is not opened");
});

/* ---------- the response is reshaped, never invented ---------- */

test("missing or malformed fields become empty values instead of zeros", () => {
  const empty = normalizeOverview({ period: "2026-11", forecast: { openingBalance: "abc" }, trend: { months: [{ month: "2026-11", revenue: "1.00" }] } })!;
  assert.equal(empty.forecast.openingBalance, null);
  assert.equal(horizonFor(empty.forecast, 30), null);
  assert.deepEqual(empty.trend, []);
  assert.deepEqual(empty.spendBySupplier, { total: null, items: [] });
  assert.equal(normalizeOverview("nope"), null);
  assert.equal(normalizeCommentary(null), null);
});

test("the real response shape is read: buckets, horizons, spend sections, trend months, anomalies", () => {
  const data = overview();
  assert.equal(data.forecast.buckets.length, 5);
  assert.equal(data.forecast.horizons.length, 3);
  assert.equal(data.spendBySupplier.items[0].share, "36.81");
  assert.equal(data.spendByCategory.items[0].key, "a-5000");
  assert.equal(data.trend.length, 6);
  assert.equal(data.trend[5].partial, true);
  assert.equal(data.anomalies[0].subject, "Seladah Hardware Sdn Bhd");
  assert.match(data.forecast.basis ?? "", /^Projection from recorded due dates/);
});

/* ---------- empty and zero states ---------- */

test("unavailable key figures say so instead of showing RM 0.00", () => {
  const blank = normalizeOverview({ period: "2026-11" })!;
  const markup = html(createElement(KpiRow, { overview: blank }));
  assert.equal((markup.match(/Not available/g) ?? []).length, 4);
  assert.doesNotMatch(markup, /RM\s?0\.00/);
});

test("real key figures show the API values", () => {
  const data = overview();
  const markup = html(createElement(KpiRow, { overview: data }));
  assert.match(markup, /RM\s?38,250\.00/);
  assert.match(markup, new RegExp(`RM\\s?${horizonFor(data.forecast, 30)!.projectedBalance!.replace(/(\d)(?=(\d{3})+\.)/g, "$1,").replace(".", "\\.")}`));
  assert.match(markup, /Payables due, 30 days/);
  assert.match(markup, /Receivables due, 30 days/);
  assert.match(markup, /Projected cash, 30 days/);
});

test("a forecast with nothing falling due says so, and a missing forecast does too", () => {
  const data = overview();
  const quiet = { ...data.forecast, buckets: data.forecast.buckets.map((bucket) => ({ ...bucket, receivables: "0.00", payables: "0.00" })) };
  assert.ok(forecastIsEmpty(quiet, 30));
  assert.match(html(createElement(ForecastChart, { forecast: quiet, days: 30 })), /No open invoices or bills have a recorded due date in the next 30 days/);
  const none = { ...data.forecast, openingBalance: null, buckets: [] };
  assert.match(html(createElement(ForecastChart, { forecast: none, days: 90 })), /No cash forecast is available/);
});

test("the forecast chart draws each bucket, the opening balance and its key", () => {
  const markup = html(createElement(ForecastChart, { forecast: overview().forecast, days: 60 }));
  assert.match(markup, /Projected cash over the next 60 days from recorded due dates/);
  assert.match(markup, /Receivables due/);
  assert.match(markup, /Payables due/);
  assert.match(markup, />Past due</);
  assert.match(markup, />31–60 d</);
  assert.equal((markup.match(/class="ins-hit"/g) ?? []).length, 4);
});

test("the bucket table lists every due-date bucket and the items with no due date", () => {
  const markup = html(createElement(BucketTable, { forecast: overview().forecast }));
  assert.match(markup, /Already due/);
  assert.match(markup, /After 90 days/);
  assert.match(markup, /No due date/);
  assert.match(markup, /RM\s?1,250\.00/);
});

test("zero spend shows an empty message for the supplier bars and the category donut", () => {
  const zero = { total: "0.00", items: [{ key: "z", name: "Nobody", amount: "0.00", share: null, entries: null, isOther: false }] };
  assert.match(html(createElement(SupplierBars, { section: zero, period: "2026-11" })), /No supplier spend is recorded for November 2026/);
  assert.match(html(createElement(SupplierBars, { section: { total: null, items: [] }, period: "2026-11" })), /No supplier spend/);
  assert.match(html(createElement(CategoryDonut, { section: zero, period: "2026-11" })), /No expenses are recorded for November 2026/);
});

test("supplier bars and the donut show real amounts and shares", () => {
  const bars = html(createElement(SupplierBars, { section: overview().spendBySupplier, period: "2026-11" }));
  assert.match(bars, /Seladah Hardware Sdn Bhd/);
  assert.match(bars, /RM\s?12,410\.00/);
  assert.match(bars, /36\.8% of spend/);
  assert.match(bars, /14 entries/);
  const donut = html(createElement(CategoryDonut, { section: overview().spendByCategory, period: "2026-11" }));
  assert.match(donut, /Purchases/);
  assert.equal((donut.match(/class="ins-slice/g) ?? []).length, 5);
});

test("a six-month trend with no activity shows an empty message", () => {
  const flat = ["2026-09", "2026-10", "2026-11"].map((month) => ({ month, revenue: "0.00", expenses: "0.00", net: "0.00", partial: false }));
  assert.match(html(createElement(TrendChart, { trend: flat, anomalies: [] })), /No posted sales or expenses in the last six months/);
  assert.match(html(createElement(TrendChart, { trend: [], anomalies: [] })), /No posted sales or expenses/);
});

test("the trend marks flagged months and shows each reason as text", () => {
  const { trend, anomalies } = overview();
  const markup = html(createElement(TrendChart, { trend, anomalies }));
  assert.equal((markup.match(/class="ins-marker"/g) ?? []).length, 1, "the supplier anomaly in October gets no marker");
  assert.match(markup, /Expenses of RM 38,420\.00 in Nov 2026 is higher than the usual RM 31,020\.00/);
  assert.match(markup, /Month to date/);
  const list = html(createElement(AnomalyList, { anomalies }));
  assert.match(list, /far above its usual RM 1,500\.00/);
  assert.match(list, /Supplier spend/);
  assert.match(html(createElement(AnomalyList, { anomalies: [] })), /No flagged items in this window/);
});

/* ---------- commentary ---------- */

test("a template commentary carries the Template, not AI badge and an AI one does not", () => {
  const template = html(createElement(CommentaryBody, { commentary: commentary({ fallback: true }), base: BASE, onExplain: noop }));
  assert.match(template, /Template, not AI/);
  assert.doesNotMatch(template, /Draft commentary: review before sending/);
  const ai = html(createElement(CommentaryBody, { commentary: commentary(), base: BASE, onExplain: noop }));
  assert.doesNotMatch(ai, /Template, not AI/);
  assert.match(ai, /Draft commentary: review before sending/);
  assert.match(ai, /AI month-end commentary/);
  assert.match(ai, /Explain this report/);
  assert.match(ai, /AI draft commentary\. Check it against the figures/);
});

test("the Explain button is hidden when the assistant is not offered", () => {
  const on = html(createElement(CommentaryBody, { commentary: commentary(), base: BASE, onExplain: noop }));
  assert.match(on, /Explain this report/);
  const off = html(createElement(CommentaryBody, { commentary: commentary(), base: BASE, onExplain: noop, canExplain: false }));
  assert.doesNotMatch(off, /Explain this report/);
  assert.match(off, /AI month-end commentary/);
});

test("fact chips show the backend's wording and link to the reports they came from", () => {
  const markup = html(createElement(CommentaryBody, { commentary: commentary(), base: BASE, onExplain: noop }));
  assert.match(markup, /Sales, November 2026/);
  assert.match(markup, /RM 46,900\.00/);
  assert.match(markup, /href="\/workspace\/reports"/);
  assert.doesNotMatch(markup, /href="\/reports/);
  // a chip for a fact id that is not in the table is skipped, never invented
  const stray = { ...commentary(), paragraphs: [{ text: "Only a stray citation.", factIds: ["missing"] }] };
  assert.doesNotMatch(html(createElement(CommentaryBody, { commentary: stray, base: BASE, onExplain: noop })), /ins-chip/);
  // an unsafe link is shown as plain text, not as an anchor
  const unsafe = { ...commentary(), facts: [{ id: "f1", label: "Bad", value: "1", unit: "count", display: null, href: "javascript:alert(1)" }],
    paragraphs: [{ text: "x", factIds: ["f1"] }] };
  const unsafeMarkup = html(createElement(CommentaryBody, { commentary: unsafe, base: BASE, onExplain: noop }));
  assert.doesNotMatch(unsafeMarkup, /href="javascript/);
  assert.match(unsafeMarkup, /<span class="ins-chip">/);
});

test("model text is rendered as plain text, never as markup", () => {
  const hostile = {
    ...commentary(),
    paragraphs: [{ text: "<img src=x onerror=alert(1)> **bold** [link](javascript:alert(2)) {{f1}} <b>tax is 0</b> <script>alert('h')</script>", factIds: [] }],
    label: "<i>label</i>",
  };
  const markup = html(createElement(CommentaryBody, { commentary: hostile, base: BASE, onExplain: noop }));
  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /<script/);
  assert.doesNotMatch(markup, /<b>/);
  assert.doesNotMatch(markup, /<i>label/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(markup, /\*\*bold\*\*/);
  assert.match(markup, /\{\{f1\}\}/);
});

test("with the AI features off the commentary card is not drawn at all", () => {
  const props = { loading: false, error: "", retry: noop, base: BASE, onExplain: noop };
  assert.equal(html(createElement(CommentarySection, { ...props, result: { status: "off" } })), "");
  assert.equal(html(createElement(CommentarySection, { ...props, result: { status: "off" }, loading: true })), "");
  const ready = html(createElement(CommentarySection, { ...props, result: { status: "ready", commentary: commentary() } }));
  assert.match(ready, /AI month-end commentary/);
  assert.match(html(createElement(CommentarySection, { ...props, result: undefined, loading: true })), /aria-busy="true"/);
});

async function withFetch(response: () => Response, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => response()) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("the loader treats a switched-off AI as off, keeps a template as a template, and other failures as errors", async () => {
  // AI_ASSIST off: the backend answers 200 with a template and fallbackReason "ai_disabled"
  await withFetch(() => json(mockCommentary("2026-11", { fallback: true, reason: "ai_disabled" })), async () => {
    assert.deepEqual(await getInsightsCommentary("2026-11"), { status: "off" });
  });
  await withFetch(() => json({ detail: "AI features are off." }, 503), async () => {
    assert.deepEqual(await getInsightsCommentary("2026-11"), { status: "off" });
  });
  await withFetch(() => json({ detail: "Not found" }, 404), async () => {
    assert.deepEqual(await getInsightsCommentary("2026-11"), { status: "off" });
  });
  await withFetch(() => json({ enabled: false }), async () => {
    assert.deepEqual(await getInsightsCommentary("2026-11"), { status: "off" });
  });
  await withFetch(() => json({ detail: "boom" }, 500), async () => {
    await assert.rejects(getInsightsCommentary("2026-11"), /boom/);
  });
  // AI on but the provider failed: a template, shown with its badge
  await withFetch(() => json(mockCommentary("2026-11", { fallback: true, reason: "provider_unavailable" })), async () => {
    const result = await getInsightsCommentary("2026-11");
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.equal(result.commentary.fallback, true);
  });
  await withFetch(() => json(mockCommentary("2026-11")), async () => {
    const result = await getInsightsCommentary("2026-11");
    assert.equal(result.status === "ready" && result.commentary.fallback, false);
  });
});

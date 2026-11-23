import test from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_WIDGETS, DEFAULT_ORDER, dropPlacement, isDefaultOrder, layoutKey, loadLayout, moveWidget, normalizeOrder, resetLayout,
  saveLayout, shiftWidget, widgetSpans, type DashboardWidgetId, type LayoutStorage,
} from "../src/lib/dashboard-layout";

function memoryStorage(initial: Record<string, string> = {}): LayoutStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}
const brokenStorage: LayoutStorage = {
  getItem: () => { throw new Error("SecurityError: storage is blocked"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError: storage is blocked"); },
};

test("the default order has every panel once, starting with Attention needed and Month-end", () => {
  assert.equal(new Set(DEFAULT_ORDER).size, DASHBOARD_WIDGETS.length);
  assert.deepEqual(DEFAULT_ORDER.slice(0, 2), ["attention", "monthEnd"]);
  assert.equal(isDefaultOrder(DEFAULT_ORDER), true);
  assert.equal(isDefaultOrder([...DEFAULT_ORDER].reverse()), false);
});

test("a saved order is kept; unknown, repeated and wrongly typed entries are dropped; new panels are appended", () => {
  assert.deepEqual(normalizeOrder(["recentDocuments", "attention"]).slice(0, 2), ["recentDocuments", "attention"]);
  assert.equal(normalizeOrder(["recentDocuments", "attention"]).length, DEFAULT_ORDER.length);
  assert.deepEqual(normalizeOrder(["attention", "attention", "gone", 7, null, "monthEnd"]).slice(0, 2), ["attention", "monthEnd"]);
  assert.equal(normalizeOrder(["attention", "attention", "gone"]).length, DEFAULT_ORDER.length);
  for (const bad of [null, undefined, "attention", 5, {}, []]) assert.deepEqual(normalizeOrder(bad), DEFAULT_ORDER);
});

test("moving a panel before or after another keeps the rest in order", () => {
  const order = ["attention", "monthEnd", "income", "cashflow"] as DashboardWidgetId[];
  assert.deepEqual(moveWidget(order, "cashflow", "attention", "before"), ["cashflow", "attention", "monthEnd", "income"]);
  assert.deepEqual(moveWidget(order, "attention", "income", "after"), ["monthEnd", "income", "attention", "cashflow"]);
  assert.deepEqual(moveWidget(order, "attention", "monthEnd", "before"), order, "dropping next to itself changes nothing");
  assert.deepEqual(moveWidget(order, "attention", "attention", "after"), order);
  assert.deepEqual(moveWidget(order, "attention", "nowhere" as DashboardWidgetId, "after"), order);
  assert.deepEqual(order, ["attention", "monthEnd", "income", "cashflow"], "the input is not changed");
});

test("keyboard moves go one place earlier or later and stop at the ends", () => {
  const order = ["attention", "monthEnd", "income"] as DashboardWidgetId[];
  assert.deepEqual(shiftWidget(order, "monthEnd", -1), ["monthEnd", "attention", "income"]);
  assert.deepEqual(shiftWidget(order, "monthEnd", 1), ["attention", "income", "monthEnd"]);
  assert.deepEqual(shiftWidget(order, "attention", -1), order);
  assert.deepEqual(shiftWidget(order, "income", 1), order);
});

test("a drop lands before or after by the pointer: left/right for half-width panels, top/bottom for full-width ones", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.equal(dropPlacement(rect, { x: 150, y: 240 }, "half"), "before");
  assert.equal(dropPlacement(rect, { x: 450, y: 60 }, "half"), "after");
  assert.equal(dropPlacement(rect, { x: 450, y: 60 }, "full"), "before");
  assert.equal(dropPlacement(rect, { x: 150, y: 240 }, "full"), "after");
});

test("a half-width panel left alone in its row is widened so the grid has no hole", () => {
  const half = DASHBOARD_WIDGETS.filter((item) => item.span === "half").map((item) => item.id);
  const full = DASHBOARD_WIDGETS.find((item) => item.span === "full")!.id;
  assert.ok(half.length >= 3);
  const spans = widgetSpans([half[0], full, half[1], half[2]]);
  assert.deepEqual(spans, { [half[0]]: "full", [full]: "full", [half[1]]: "half", [half[2]]: "half" });
  assert.equal(widgetSpans([half[0], half[1], half[2]])[half[2]], "full", "an odd last panel fills its row");
  assert.equal(Object.values(widgetSpans(DEFAULT_ORDER)).filter((span) => span === "full").length,
    DASHBOARD_WIDGETS.filter((item) => item.span === "full").length, "the default layout needs no widening");
});

test("each user has their own saved order, and it survives a reload", () => {
  const storage = memoryStorage();
  const custom = shiftWidget(DEFAULT_ORDER, "monthEnd", -1);
  assert.equal(saveLayout(storage, "user-1", custom), true);
  assert.deepEqual(loadLayout(storage, "user-1"), custom);
  assert.deepEqual(loadLayout(storage, "user-2"), DEFAULT_ORDER);
  assert.notEqual(layoutKey("user-1"), layoutKey("user-2"));
  assert.deepEqual(JSON.parse(storage.data[layoutKey("user-1")]), custom);
});

test("saving the default order stores nothing, and reset removes a saved order", () => {
  const storage = memoryStorage();
  saveLayout(storage, "user-1", shiftWidget(DEFAULT_ORDER, "monthEnd", 1));
  assert.ok(layoutKey("user-1") in storage.data);
  saveLayout(storage, "user-1", DEFAULT_ORDER);
  assert.equal(layoutKey("user-1") in storage.data, false);
  saveLayout(storage, "user-1", shiftWidget(DEFAULT_ORDER, "monthEnd", 1));
  assert.equal(resetLayout(storage, "user-1"), true);
  assert.deepEqual(loadLayout(storage, "user-1"), DEFAULT_ORDER);
  assert.deepEqual(storage.data, {});
});

test("a corrupt or old saved value falls back to the default order", () => {
  for (const raw of ["not json", "{\"a\":1}", "null", "[1,2,3]", "\"attention\""]) {
    assert.deepEqual(loadLayout(memoryStorage({ [layoutKey("u")]: raw }), "u"), DEFAULT_ORDER, raw);
  }
});

test("without usable browser storage the page still works: nothing throws and the default order is used", () => {
  assert.deepEqual(loadLayout(brokenStorage, "u"), DEFAULT_ORDER);
  assert.equal(saveLayout(brokenStorage, "u", shiftWidget(DEFAULT_ORDER, "monthEnd", 1)), false);
  assert.equal(resetLayout(brokenStorage, "u"), false);
  assert.deepEqual(loadLayout(null, "u"), DEFAULT_ORDER);
  assert.equal(saveLayout(null, "u", DEFAULT_ORDER), false);
  assert.equal(resetLayout(null, "u"), false);
});

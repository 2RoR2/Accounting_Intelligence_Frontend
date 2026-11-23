/**
 * Dashboard layout: the order of the Dashboard's panels, saved per user in the browser.
 *
 * Pure rules only (order, moves, drop position, saving); the page and the drag handles live in
 * `features/common/today`. Browser storage is optional: every read and write is guarded, so a blocked or full
 * storage leaves the default layout and never an error.
 */

export type WidgetSpan = "half" | "full";

/** The panels in their default order. `span` is the width on a wide screen; on a phone every panel stacks. */
export const DASHBOARD_WIDGETS = [
  { id: "attention", label: "Attention needed", span: "half" },
  { id: "monthEnd", label: "Month-end", span: "half" },
  { id: "monthlySummary", label: "Monthly summary", span: "half" },
  { id: "monthlyLedger", label: "Monthly ledger", span: "half" },
  { id: "moneyKpis", label: "Invoices and bills totals", span: "full" },
  { id: "invoicesOutstanding", label: "Outstanding invoices", span: "half" },
  { id: "billsOutstanding", label: "Outstanding bills", span: "half" },
  { id: "income", label: "Income", span: "half" },
  { id: "profitLoss", label: "Profit & Loss", span: "half" },
  { id: "cashflow", label: "Cashflow trend", span: "half" },
  { id: "reviewDocuments", label: "Documents needing review", span: "half" },
  { id: "recentDocuments", label: "Recent documents", span: "full" },
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];
export type DropPlacement = "before" | "after";

export const DEFAULT_ORDER: DashboardWidgetId[] = DASHBOARD_WIDGETS.map((item) => item.id);

const KNOWN = new Set<string>(DEFAULT_ORDER);

export function widgetLabel(id: DashboardWidgetId) {
  return DASHBOARD_WIDGETS.find((item) => item.id === id)?.label ?? id;
}

export function isDefaultOrder(order: readonly DashboardWidgetId[]) {
  return order.length === DEFAULT_ORDER.length && order.every((id, index) => id === DEFAULT_ORDER[index]);
}

/**
 * Any saved value to a complete, valid order: known panels in the saved order, each once; panels added since
 * the order was saved go at the end in their default order. Anything that is not an array gives the default.
 */
export function normalizeOrder(value: unknown): DashboardWidgetId[] {
  if (!Array.isArray(value)) return [...DEFAULT_ORDER];
  const seen = new Set<string>();
  const kept: DashboardWidgetId[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && KNOWN.has(entry) && !seen.has(entry)) {
      seen.add(entry);
      kept.push(entry as DashboardWidgetId);
    }
  }
  return [...kept, ...DEFAULT_ORDER.filter((id) => !seen.has(id))];
}

/** Moves `id` just before or after `targetId`. Unknown ids or a drop next to itself return the same order. */
export function moveWidget(order: readonly DashboardWidgetId[], id: DashboardWidgetId, targetId: DashboardWidgetId, placement: DropPlacement) {
  if (id === targetId || !order.includes(id) || !order.includes(targetId)) return [...order];
  const rest = order.filter((item) => item !== id);
  const at = rest.indexOf(targetId) + (placement === "after" ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** One place earlier (-1) or later (+1), for the keyboard and the move buttons; the ends stay put. */
export function shiftWidget(order: readonly DashboardWidgetId[], id: DashboardWidgetId, delta: -1 | 1) {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Where a drop lands on a panel: left/right half for a half-width panel, top/bottom half for a full-width one. */
export function dropPlacement(rect: { left: number; top: number; width: number; height: number }, point: { x: number; y: number }, span: WidgetSpan): DropPlacement {
  const before = span === "half" ? point.x < rect.left + rect.width / 2 : point.y < rect.top + rect.height / 2;
  return before ? "before" : "after";
}

/**
 * The width each panel is drawn at for this order: a half-width panel with no partner in its row (next to a
 * full-width panel, or last of an odd run) is widened to fill the row, so no order leaves a hole.
 */
export function widgetSpans(order: readonly DashboardWidgetId[]): Record<DashboardWidgetId, WidgetSpan> {
  const spans = {} as Record<DashboardWidgetId, WidgetSpan>;
  const base = new Map<DashboardWidgetId, WidgetSpan>(DASHBOARD_WIDGETS.map((item) => [item.id, item.span]));
  let waiting: DashboardWidgetId | null = null;
  const flush = () => { if (waiting) spans[waiting] = "full"; waiting = null; };
  for (const id of order) {
    if (base.get(id) === "full") {
      flush();
      spans[id] = "full";
    } else if (waiting) {
      spans[waiting] = "half";
      spans[id] = "half";
      waiting = null;
    } else {
      waiting = id;
    }
  }
  flush();
  return spans;
}

/** The part of browser storage this feature uses; `window.localStorage` fits. */
export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const layoutKey = (userId: string) => `accordai-dashboard-layout-v1:${userId}`;

/** The browser's storage, or null where it is missing or blocked (even reading `window.localStorage` can throw). */
export function browserStorage(): LayoutStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The user's saved order, or the default when nothing usable is saved. Never throws. */
export function loadLayout(storage: LayoutStorage | null, userId: string): DashboardWidgetId[] {
  try {
    const raw = storage?.getItem(layoutKey(userId));
    return raw ? normalizeOrder(JSON.parse(raw)) : [...DEFAULT_ORDER];
  } catch {
    return [...DEFAULT_ORDER];
  }
}

/** Saves the order; the default order is stored as nothing, so later changes to the default reach everyone. True when it was stored. */
export function saveLayout(storage: LayoutStorage | null, userId: string, order: readonly DashboardWidgetId[]) {
  if (isDefaultOrder(order)) return resetLayout(storage, userId);
  try {
    if (!storage) return false;
    storage.setItem(layoutKey(userId), JSON.stringify(order));
    return true;
  } catch {
    return false;
  }
}

/** Forgets the saved order. True when storage was reachable. */
export function resetLayout(storage: LayoutStorage | null, userId: string) {
  try {
    if (!storage) return false;
    storage.removeItem(layoutKey(userId));
    return true;
  } catch {
    return false;
  }
}

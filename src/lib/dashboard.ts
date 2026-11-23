/**
 * Dashboard (plan v3, R0): the team's dashboard layout filled with the Today figures (B3).
 *
 * Every figure comes from `todayTiles` (the tested mapping of `GET /api/home/summary`); this module
 * only decides where each one goes: an "Attention needed" list in working order (each line carries its
 * count), the money due, and one sentence for the greeting banner.
 */
import { type HomeSummary, type TileId, type TodayRole, type TodayTileView, todayTiles } from "./today";

export interface DashboardView {
  /** Work waiting for a person, in working order, each with its count; only tiles with something to do. */
  attention: TodayTileView[];
  /** Bills due soon, overdue bills, customers overdue. */
  money: TodayTileView[];
  /** One sentence under the greeting, e.g. "3 things need you today." */
  headline: string;
  /** True only when every work and overdue figure is known and zero (an unavailable figure is not "clear"). */
  allClear: boolean;
}

const WORK_IDS: TileId[] = ["toReview", "needsFixing", "readyToApprove", "waitingApproval", "bankToMatch", "journalsToPost",
  "paymentsToPost"];
const MONEY_IDS: TileId[] = ["billsDueSoon", "billsOverdue", "invoicesOverdue"];

export function dashboardView(summary: HomeSummary, role: TodayRole): DashboardView {
  const tiles = todayTiles(summary, role);
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const pick = (ids: TileId[]) => ids.map((id) => byId.get(id)).filter((tile): tile is TodayTileView => !!tile);
  // Unavailable work stays in the list with its reason: hiding it would claim there is nothing to do.
  const attention = pick(WORK_IDS).filter((tile) => tile.tone !== "clear");
  const overdueTiles = pick(["billsOverdue", "invoicesOverdue"]);
  const things = attention.filter((tile) => tile.tone !== "unavailable").length
    + overdueTiles.filter((tile) => tile.tone === "attention").length;
  const unknown = [...attention, ...overdueTiles].some((tile) => tile.tone === "unavailable");
  const allClear = things === 0 && !unknown;
  const needs = `${things} ${things === 1 ? "thing needs" : "things need"} you today. Start at the top of "Attention needed".`;
  const headline = allClear
    ? "You are all caught up. New work appears here as documents and bank lines arrive."
    : things === 0
      ? "Some figures are not available yet, so this page cannot say everything is done."
      : unknown ? `${needs} Some figures are not available yet.` : needs;
  return { attention, money: pick(MONEY_IDS), headline, allClear };
}

/** How often an open Dashboard refreshes its figures while the tab is visible. */
export const DASHBOARD_REFRESH_MS = 30_000;

export interface VisibilitySource {
  visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}
interface Timers { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void }

/**
 * Calls `refresh` every `ms` while the page is visible, and once as soon as it becomes visible again;
 * a hidden tab makes no requests. Returns the function that stops it.
 */
export function pollWhileVisible(refresh: () => void, ms: number, doc: VisibilitySource,
  timers: Timers = { set: (run, every) => setInterval(run, every), clear: (handle) => clearInterval(handle as ReturnType<typeof setInterval>) }) {
  const visible = () => doc.visibilityState === "visible";
  const handle = timers.set(() => { if (visible()) refresh(); }, ms);
  const onChange = () => { if (visible()) refresh(); };
  doc.addEventListener("visibilitychange", onChange);
  return () => {
    timers.clear(handle);
    doc.removeEventListener("visibilitychange", onChange);
  };
}

/** "Good morning" ... "Good night" for the hour in Malaysia (0-23), as the team's dashboard greets. */
export function greetingFor(hour: number) {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

/** The first word of a display name, for the greeting ("Angeline Tan" -> "Angeline"). */
export function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

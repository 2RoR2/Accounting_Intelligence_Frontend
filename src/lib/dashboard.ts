/**
 * Dashboard (plan v3, R0): the team's dashboard layout filled with the Today figures (B3).
 *
 * Every figure comes from `todayTiles` (the tested mapping of `GET /api/home/summary`); this module
 * only decides where each one goes: four headline numbers, an "Attention needed" list in working
 * order, the money due, and one sentence for the greeting banner.
 */
import { type HomeSummary, type TileId, type TodayRole, type TodayTileView, todayTiles } from "./today";

export interface DashboardView {
  /** The four headline numbers, in working order. */
  kpis: TodayTileView[];
  /** Work waiting for a person, in working order; only tiles with something to do. */
  attention: TodayTileView[];
  /** Bills due soon, overdue bills, customers overdue. */
  money: TodayTileView[];
  /** One sentence under the greeting, e.g. "3 things need you today." */
  headline: string;
}

const KPI_IDS: Record<TodayRole, TileId[]> = {
  ACCOUNTANT: ["toReview", "needsFixing", "readyToApprove", "bankToMatch"],
  LOCAL_ADMIN: ["toReview", "needsFixing", "waitingApproval", "bankToMatch"],
};
const WORK_IDS: TileId[] = ["toReview", "needsFixing", "readyToApprove", "waitingApproval", "bankToMatch", "journalsToPost"];
const MONEY_IDS: TileId[] = ["billsDueSoon", "billsOverdue", "invoicesOverdue"];

export function dashboardView(summary: HomeSummary, role: TodayRole): DashboardView {
  const tiles = todayTiles(summary, role);
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const pick = (ids: TileId[]) => ids.map((id) => byId.get(id)).filter((tile): tile is TodayTileView => !!tile);
  const attention = pick(WORK_IDS).filter((tile) => tile.tone === "attention" || tile.tone === "neutral");
  const overdue = pick(["billsOverdue", "invoicesOverdue"]).filter((tile) => tile.tone === "attention").length;
  const things = attention.length + overdue;
  const headline = things === 0
    ? "You are all caught up. New work appears here as documents and bank lines arrive."
    : `${things} ${things === 1 ? "thing needs" : "things need"} you today. Start at the top of "Attention needed".`;
  return { kpis: pick(KPI_IDS[role]), attention, money: pick(MONEY_IDS), headline };
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

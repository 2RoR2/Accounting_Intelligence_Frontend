/**
 * Today page (plan v2, task B3): the backend `GET /api/home/summary` contract and the pure mapping from it to tiles.
 *
 * Every tile opens the list it counts: the backend sends the page and query (`link`), and the list pages filter
 * with the same rule. A figure the backend cannot give arrives as `{ available: false, reason }` and is shown as
 * "Not available yet" with the reason under Details, never as a number.
 */
import { ruleSentence, ruleTitle } from "./glossary";

export type TodayRole = "ACCOUNTANT" | "LOCAL_ADMIN";
export interface TodayLink { page: string; query: string | null }
export interface Unavailable { available: false; reason: string; link: TodayLink | null }
interface Counted { available: true; scope: "yours" | "company"; count: number; link: TodayLink | null }
export type CountTile = Counted;
export interface ReasonTile extends Counted { topReasons: Array<{ code: string; documents: number }> }
export interface BankTile extends Counted { moneyIn: number; moneyOut: number }
export interface MoneyTile extends Counted { amount: string; currency: string; otherCurrencyCount: number; noDueDate: number; days?: number }
export interface JournalTile extends Counted { draftJournals: number }
export type MonthEndKey = "reviewed" | "matched" | "posted" | "reconciled";
export type MonthEndStep =
  | { key: MonthEndKey; available: true; done: number; total: number; basis: string; link: TodayLink | null }
  | ({ key: MonthEndKey } & Unavailable);
export interface MonthEnd {
  available: true;
  scope: "company";
  period: { code: string; startsOn: string; endsOn: string; status: string | null; source: "accounting_period" | "calendar_month" };
  steps: MonthEndStep[];
}
export interface HomeSummary {
  asOf: string;
  currency: string;
  role: string;
  tiles: {
    toReview: CountTile | Unavailable;
    readyToApprove: CountTile | Unavailable;
    needsFixing: ReasonTile | Unavailable;
    waitingApproval: CountTile | Unavailable;
    bankToMatch: BankTile | Unavailable;
    billsDueSoon: MoneyTile | Unavailable;
    billsOverdue: MoneyTile | Unavailable;
    invoicesOverdue: MoneyTile | Unavailable;
    journalsToPost: JournalTile | Unavailable;
    /** Matched bank lines whose payment is not posted yet (absent from an older backend). */
    paymentsToPost?: CountTile | Unavailable;
  };
  monthEnd: MonthEnd | Unavailable;
}
export type TileId = keyof HomeSummary["tiles"];

export type TileTone = "attention" | "neutral" | "clear" | "unavailable";
export interface TodayTileView {
  id: TileId;
  title: string;
  /** The big figure: a count, an RM amount, or "Not available yet". */
  value: string;
  caption: string;
  /** Where the tile opens: the list it counts. */
  href: string | null;
  tone: TileTone;
  /** Shown instead of the caption when there is nothing to do: says what to do next. */
  nextStep: string | null;
  nextHref: string | null;
  /** Lines under the "Details" toggle (reasons, exclusions, why a figure is missing). */
  details: string[];
}

export const NOT_AVAILABLE = "Not available yet";

/** Lists a Today tile can open, as the backend names them (documents ?lane=, records ?due= / ?posting=). */
export const DOCUMENT_LANES = { "to-review": "Documents to check", ready: "Ready to approve", "needs-fixing": "Needs fixing", "waiting-approval": "Sent for approval" } as const;
export type DocumentLane = keyof typeof DOCUMENT_LANES;
export const isDocumentLane = (value: string | null | undefined): value is DocumentLane => !!value && value in DOCUMENT_LANES;
export const DUE_WINDOWS = { "next-7-days": "due in the next 7 days", overdue: "overdue" } as const;
export type DueWindow = keyof typeof DUE_WINDOWS;
export const isDueWindow = (value: string | null | undefined): value is DueWindow => !!value && value in DUE_WINDOWS;

/**
 * A bank line still waiting for a person, the same rule as the backend's "Bank lines to match" tile: not matched,
 * not ignored, and not classified to an account (a fee or interest; its latest coding decision is not "cleared").
 */
export function bankLineToMatch(row: { status: string; codingDecision?: string | null }) {
  const classified = !!row.codingDecision && row.codingDecision !== "cleared";
  return row.status !== "matched" && row.status !== "ignored" && !classified;
}

/**
 * The category the records list is fixed to by its link (?category=, sent to the server with the Today
 * filter), or null. While it is set, the Categories selector must not filter locally: the server only
 * returned that category, so picking the other one would show an empty table.
 */
export function lockedCategory(category: string | null | undefined) {
  return category === "ACCOUNTS_PAYABLE" || category === "ACCOUNTS_RECEIVABLE" ? category : null;
}

/** The sentence a list shows when it was opened from Today, e.g. "Unpaid supplier bills overdue". */
export function recordFilterLabel(category: string | null, due: string | null, posting: string | null) {
  if (posting === "to-post") return "Approved records not posted yet";
  if (!isDueWindow(due)) return null;
  const side = category === "ACCOUNTS_RECEIVABLE" ? "Unpaid customer invoices" : "Unpaid supplier bills";
  return `${side} ${DUE_WINDOWS[due]}`;
}
const ORDER: TileId[] = ["toReview", "needsFixing", "readyToApprove", "waitingApproval", "bankToMatch",
  "billsDueSoon", "billsOverdue", "invoicesOverdue", "journalsToPost", "paymentsToPost"];

export const areaFor = (role: TodayRole) => (role === "LOCAL_ADMIN" ? "company" : "workspace");
export function linkHref(role: TodayRole, link: TodayLink | null | undefined) {
  if (!link) return null;
  return `/${areaFor(role)}/${link.page}${link.query ? `?${link.query}` : ""}`;
}

/** "RM 1,250.50" from a decimal string. The backend sends exact decimals; this only formats them. */
export function formatRm(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(value);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type AnyTile = CountTile & Partial<ReasonTile & BankTile & MoneyTile & JournalTile>;
interface TileCopy {
  title: (role: TodayRole) => string;
  caption: (tile: AnyTile, role: TodayRole) => string;
  empty: (role: TodayRole) => { text: string; page?: string; query?: string };
  details?: (tile: AnyTile) => string[];
  money?: boolean;
}

function openItemNotes(tile: AnyTile, noun: string) {
  const notes = ["Amount still unpaid: the amount due printed on the document (or its total), less payments already matched."];
  if (tile.otherCurrencyCount) notes.push(`${plural(tile.otherCurrencyCount, noun)} in another currency counted but not included in the RM total.`);
  if (tile.noDueDate) notes.push(`${plural(tile.noDueDate, `unpaid ${noun}`)} without a due date not counted here.`);
  return notes;
}

const COPY: Record<TileId, TileCopy> = {
  toReview: {
    title: () => "Documents to check",
    caption: (t) => `${plural(t.count, "document")} waiting for your check`,
    empty: () => ({ text: "All caught up. Upload new bills, receipts or invoices when they arrive.", page: "upload" }),
  },
  needsFixing: {
    title: () => "Needs fixing",
    caption: (t) => (t.topReasons?.length
      ? `Mostly: ${t.topReasons.map((r) => `${ruleTitle(r.code)} (${r.documents})`).join(", ")}`
      : `${plural(t.count, "document")} with a problem to fix`),
    empty: () => ({ text: "No problems to fix. New problems appear here after documents are read." }),
    details: (t) => (t.topReasons ?? []).map((r) => `${ruleSentence(r.code)} (${plural(r.documents, "document")})`),
  },
  readyToApprove: {
    title: () => "Ready to approve",
    caption: (t, role) => (role === "LOCAL_ADMIN"
      ? `${plural(t.count, "document")} passed every check`
      : `${plural(t.count, "document")} passed every check: send for approval`),
    empty: () => ({ text: "Nothing ready yet. Check the documents in To review first.", page: "documents", query: "lane=to-review" }),
  },
  waitingApproval: {
    title: (role) => (role === "LOCAL_ADMIN" ? "Waiting for your approval" : "Sent for approval"),
    caption: (t, role) => (role === "LOCAL_ADMIN"
      ? `${plural(t.count, "document")} submitted by accountants`
      : `${plural(t.count, "document")} with your admin`),
    empty: (role) => ({ text: role === "LOCAL_ADMIN" ? "Nothing is waiting for your approval." : "Nothing is waiting with your admin." }),
  },
  bankToMatch: {
    title: () => "Bank lines to match",
    caption: (t) => `${plural(t.moneyIn ?? 0, "line")} money in, ${plural(t.moneyOut ?? 0, "line")} money out`,
    empty: () => ({ text: "Every imported bank line is matched. Import the next bank statement on Reconcile.", page: "reconciliation" }),
  },
  billsDueSoon: {
    title: () => "Bills due in 7 days",
    caption: (t) => `${plural(t.count, "bill")} to pay`,
    empty: () => ({ text: "No bills are due in the next 7 days." }),
    details: (t) => openItemNotes(t, "bill"),
    money: true,
  },
  billsOverdue: {
    title: () => "Overdue bills",
    caption: (t) => `${plural(t.count, "bill")} past the due date`,
    empty: () => ({ text: "No bill is overdue." }),
    details: (t) => openItemNotes(t, "bill"),
    money: true,
  },
  invoicesOverdue: {
    title: () => "Customers overdue",
    caption: (t) => `${plural(t.count, "invoice")} not yet paid by customers`,
    empty: () => ({ text: "No customer invoice is overdue." }),
    details: (t) => openItemNotes(t, "invoice"),
    money: true,
  },
  journalsToPost: {
    title: () => "Approved, not posted yet",
    caption: (t) => `${plural(t.count, "approved record")} waiting for a journal`,
    empty: () => ({ text: "Everything approved is posted to the ledger." }),
    details: (t) => (t.draftJournals ? [`${plural(t.draftJournals, "draft journal")} not yet posted.`] : []),
  },
  paymentsToPost: {
    title: () => "Bank payments to post",
    caption: (t, role) => (role === "LOCAL_ADMIN"
      ? `${plural(t.count, "matched bank line")} with the payment not in the ledger yet`
      : `${plural(t.count, "matched bank line")} waiting for an admin to post`),
    empty: () => ({ text: "Every matched bank payment is posted to the ledger." }),
  },
};

/** One tile, in accounting words. */
export function tileView(id: TileId, tile: NonNullable<HomeSummary["tiles"][TileId]>, role: TodayRole): TodayTileView {
  const copy = COPY[id];
  const href = linkHref(role, tile.link);
  if (!tile.available) {
    return { id, title: copy.title(role), value: NOT_AVAILABLE, caption: "", href, tone: "unavailable",
      nextStep: null, nextHref: null, details: [tile.reason] };
  }
  const counted = tile as AnyTile;
  const empty = counted.count === 0;
  const next = empty ? copy.empty(role) : null;
  const value = copy.money ? formatRm(counted.amount ?? "") : String(counted.count);
  const details = copy.details ? copy.details(counted) : [];
  const waiting = id === "waitingApproval" || id === "readyToApprove";
  return {
    id, title: copy.title(role), value, caption: empty ? "" : copy.caption(counted, role), href,
    tone: empty ? "clear" : waiting ? "neutral" : "attention",
    nextStep: next?.text ?? null,
    nextHref: next?.page ? linkHref(role, { page: next.page, query: next.query ?? null }) : null,
    // With nothing counted, only the notes about what was left out still matter.
    details: empty ? details.filter((line) => !line.startsWith("Amount still unpaid")) : details,
  };
}

/** All tiles in the order of the daily routine: check, fix, approve, bank, pay, collect, post. */
export function todayTiles(summary: HomeSummary, role: TodayRole): TodayTileView[] {
  return ORDER.flatMap((id) => {
    const tile = summary.tiles[id];
    return tile ? [tileView(id, tile, role)] : [];
  });
}

export interface MonthEndStepView {
  key: MonthEndKey;
  label: string;
  value: string;
  /** 0-100, or null when the step has nothing to count or is not available. */
  percent: number | null;
  complete: boolean;
  href: string | null;
  details: string[];
}
export interface MonthEndView { title: string; available: boolean; steps: MonthEndStepView[]; details: string[] }

const STEP_LABELS: Record<MonthEndKey, string> = {
  reviewed: "Documents checked",
  matched: "Bank lines matched",
  posted: "Approved records posted",
  reconciled: "Bank reconciled",
};

export function monthLabel(startsOn: string) {
  const [year, month] = startsOn.split("-").map(Number);
  if (!year || !month) return startsOn;
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(year, month - 1, 1));
}

export function monthEndView(summary: HomeSummary, role: TodayRole): MonthEndView {
  const month = summary.monthEnd;
  if (!month.available) return { title: "Month-end", available: false, steps: [], details: [month.reason] };
  const { period } = month;
  const title = period.source === "accounting_period"
    ? `Month-end: ${monthLabel(period.startsOn)} (${period.code})`
    : `Month-end: ${monthLabel(period.startsOn)}`;
  const steps = month.steps.map((step): MonthEndStepView => {
    const href = linkHref(role, step.link);
    const label = STEP_LABELS[step.key];
    if (!step.available) return { key: step.key, label, value: NOT_AVAILABLE, percent: null, complete: false, href, details: [step.reason] };
    if (step.total === 0) return { key: step.key, label, value: "Nothing this month yet", percent: null, complete: false, href, details: [step.basis] };
    return { key: step.key, label, value: `${step.done} of ${step.total}`, percent: Math.round((step.done / step.total) * 100),
      complete: step.done === step.total, href, details: [step.basis] };
  });
  return { title, available: true, steps, details: [] };
}

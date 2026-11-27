/**
 * AI Inbox and Fraud Shield: the response shapes (BE-B's contract, docs/api/insights-fraud-inbox.md in the backend)
 * and the rules that do not need a browser. Everything here is pure so the confirm-before-accept flow and the
 * approve-anyway rule can be tested directly.
 */

// ---------------------------------------------------------------- AI Inbox

export type InboxKind = "fraud" | "supplier-email" | "exceptions" | "bank-match" | "close-blocker" | "other";
export type Severity = "high" | "medium" | "low";

/** One API call an accept runs, as the signed-in user. */
export interface ApiCall { method: string; path: string; body?: unknown }
/**
 * What the backend lists for one proposal. POST/PATCH/PUT call an existing endpoint (then `then`, in order); LINK
 * opens a page; COPY and MAILTO belong to a drafted email (this app only offers Copy, see InboxDraft).
 */
export interface InboxAction {
  label: string;
  method: string;
  path: string;
  body?: unknown;
  then: ApiCall[];
  /** The backend's own sentence for the confirm step. */
  confirm?: string;
}
export interface Evidence { label: string; value: string; href?: string }
/** A drafted email. It can only be copied: nothing in this app sends it, and no mail program is opened. */
export interface InboxDraft { to?: string; subject?: string; body: string; wording?: string }
export interface InboxItem {
  id: string;
  kind: InboxKind;
  /** The kind as the backend wrote it. */
  rawKind: string;
  severity: Severity;
  title: string;
  why: string;
  evidence: Evidence[];
  actions: InboxAction[];
  /** Why a bank match was proposed: any of Rule, Match, Memory, Similar. */
  basis: string[];
  draft?: InboxDraft;
}

export const KIND_ORDER: readonly InboxKind[] = ["fraud", "supplier-email", "exceptions", "bank-match", "close-blocker", "other"];
export const KIND_LABEL: Record<InboxKind, { title: string; hint: string }> = {
  fraud: { title: "Fraud warnings", hint: "High-risk warnings on documents that are not approved yet. Open the document to look." },
  "supplier-email": { title: "Drafted supplier emails", hint: "Written for you to copy. Nothing is sent from here." },
  exceptions: { title: "Grouped exceptions", hint: "One cause behind several documents: fix it once." },
  "bank-match": { title: "Bank-match proposals", hint: "A bank line and the document that probably settles it." },
  "close-blocker": { title: "Close blockers", hint: "What stops this month from being closed." },
  other: { title: "Other proposals", hint: "Suggestions from the assistant." },
};

export function normaliseKind(raw: unknown): InboxKind {
  const kind = String(raw ?? "").toUpperCase();
  if (kind === "FRAUD_SHIELD") return "fraud";
  if (kind === "SUPPLIER_QUERY_DRAFT") return "supplier-email";
  if (kind === "EXCEPTION_GROUP") return "exceptions";
  if (kind === "BANK_MATCH") return "bank-match";
  if (kind === "CLOSE_BLOCKER") return "close-blocker";
  return "other";
}

const text = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

export function normaliseSeverity(raw: unknown): Severity {
  const value = String(raw ?? "").toLowerCase();
  if (/high|critical|severe/.test(value)) return "high";
  if (/low|info|minor/.test(value)) return "low";
  return "medium";
}

export function normaliseEvidence(raw: unknown): Evidence[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === "string") return { label: entry, value: "" };
    const item = record(entry);
    return { label: text(item.label), value: text(item.value), href: text(item.href) || undefined };
  }).filter((entry) => entry.label || entry.value);
}

const normaliseCall = (raw: unknown): ApiCall | null => {
  const call = record(raw);
  return text(call.path) ? { method: (text(call.method) || "POST").toUpperCase(), path: text(call.path), body: call.body ?? undefined } : null;
};

export function normaliseInbox(raw: unknown): InboxItem[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(record(raw).items) ? record(raw).items as unknown[] : [];
  return list.map((entry): InboxItem | null => {
    const item = record(entry);
    const id = text(item.id);
    if (!id) return null;
    const draftSource = item.draft && typeof item.draft === "object" ? record(item.draft) : null;
    const draft = draftSource && text(draftSource.body)
      ? { to: text(draftSource.to) || undefined, subject: text(draftSource.subject) || undefined, body: text(draftSource.body), wording: text(draftSource.wording) || undefined } : undefined;
    const actions = (Array.isArray(item.actions) ? item.actions : []).map((action): InboxAction | null => {
      const a = record(action);
      const method = (text(a.method) || "POST").toUpperCase();
      // COPY and MAILTO have no path; they are kept so the page can tell what the backend offered.
      if (!text(a.path) && method !== "COPY" && method !== "MAILTO") return null;
      return { label: text(a.label) || "Accept", method, path: text(a.path), body: a.body ?? undefined,
        then: (Array.isArray(a.then) ? a.then : []).map(normaliseCall).filter((call): call is ApiCall => call !== null),
        confirm: text(a.confirm) || undefined };
    }).filter((action): action is InboxAction => action !== null);
    const rawKind = text(item.kind);
    return { id, kind: draft ? "supplier-email" : normaliseKind(rawKind), rawKind, severity: normaliseSeverity(item.severity), title: text(item.title), why: text(item.why),
      evidence: normaliseEvidence(item.evidence), actions, draft,
      basis: Array.isArray(item.basis) ? item.basis.map(text).filter(Boolean) : [] };
  }).filter((item): item is InboxItem => item !== null);
}

export function groupByKind(items: readonly InboxItem[]): { kind: InboxKind; items: InboxItem[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, items: items.filter((item) => item.kind === kind) })).filter((group) => group.items.length > 0);
}

/**
 * The only calls Accept may run: a write to this app's own API. The list comes from the server, but a path that
 * leaves the API (another host, a `..` climb) is refused here rather than trusted.
 */
export const ACCEPT_METHODS = ["POST", "PUT", "PATCH"] as const;
export const callIsRunnable = (call: ApiCall): boolean =>
  (ACCEPT_METHODS as readonly string[]).includes(call.method.toUpperCase())
  && /^\/api\/[A-Za-z0-9_\-./{}~%?=&:,]*$/.test(call.path) && !call.path.includes("..") && !call.path.includes("//");
/** An accept is runnable only when the main call and every follow-up are. */
export const actionIsRunnable = (action: InboxAction): boolean => callIsRunnable(action) && action.then.every(callIsRunnable);
export const isLink = (action: InboxAction) => action.method === "LINK";

/** The calls an accept makes, in order: the main call, then each follow-up. */
export const callsOf = (action: InboxAction): ApiCall[] => [{ method: action.method, path: action.path, body: action.body }, ...action.then];

/** The words of the confirm step: exactly which calls run, in what order, with what, and as whom. Nothing else runs. */
export function describeAction(action: InboxAction): { headline: string; confirm?: string; calls: string[]; details: string[]; followUps: number } {
  const body = record(action.body);
  const details = Object.entries(body).filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return { headline: action.label, confirm: action.confirm, calls: callsOf(action).map((call) => `${call.method.toUpperCase()} ${call.path}`), details, followUps: action.then.length };
}

/**
 * Evidence and LINK targets are in-app page segments such as `documents/<id>` or `reconciliation?status=unmatched`.
 * They get the area prefix; anything that names another site is dropped.
 */
export function resolveEvidenceHref(href: string | null | undefined, prefix: string): string | undefined {
  if (!href) return undefined;
  if (/^\/(workspace|company)(\/|$)/.test(href)) return href;
  if (href.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(href.split("/")[0])) return undefined;
  return `/${prefix}/${href.replace(/^\/+/, "")}`;
}

/** What Copy puts on the clipboard for a draft: the subject, a blank line, then the body. */
export function draftClipboardText(draft: InboxDraft): string {
  return draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body;
}

// ---------------------------------------------------------------- Fraud Shield

export type FraudSeverity = Severity;
export interface FraudFlag { code: string; severity: FraudSeverity; title: string; message: string; evidence: Evidence[]; action: string }
export interface FraudAcknowledgement { codes: string[]; reason: string; by: string; at: string }
export interface FraudResult { flags: FraudFlag[]; acknowledgements: FraudAcknowledgement[] }

export function normaliseFlags(raw: unknown): FraudFlag[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(record(raw).flags) ? record(raw).flags as unknown[] : [];
  return list.map((entry) => {
    const flag = record(entry);
    return { code: text(flag.code), severity: normaliseSeverity(flag.severity), title: text(flag.title), message: text(flag.message), evidence: normaliseEvidence(flag.evidence), action: text(flag.action) };
  }).filter((flag) => flag.code || flag.message);
}

export function normaliseFraud(raw: unknown): FraudResult {
  const acknowledgements = (Array.isArray(record(raw).acknowledgements) ? record(raw).acknowledgements as unknown[] : []).map((entry) => {
    const a = record(entry);
    return { codes: (Array.isArray(a.codes) ? a.codes : []).map(text), reason: text(a.reason), by: text(a.by), at: text(a.at) };
  });
  return { flags: normaliseFlags(raw), acknowledgements };
}

export type ShieldTone = "clear" | "amber" | "red";
/** Green with no flags; red when any flag is high; otherwise amber. */
export function shieldTone(flags: readonly FraudFlag[]): ShieldTone {
  if (flags.length === 0) return "clear";
  return flags.some((flag) => flag.severity === "high") ? "red" : "amber";
}
export function shieldLabel(flags: readonly FraudFlag[]): string {
  return flags.length === 0 ? "No warnings" : `${flags.length} ${flags.length === 1 ? "warning" : "warnings"}`;
}

/**
 * Fraud flags advise; they never block. Approving past one needs a reason, which the backend keeps as an audited
 * acknowledgement (POST /api/insights/fraud/{id}/acknowledge) made before the normal approval call.
 */
export const APPROVE_ANYWAY_MIN = 10;
export const APPROVE_ANYWAY_MAX = 1000;
export const approveAnywayReady = (reason: string) => reason.trim().length >= APPROVE_ANYWAY_MIN;
/** The codes to acknowledge: each flag currently shown, once (the backend takes 1 to 5). */
export const approveAnywayCodes = (flags: readonly FraudFlag[]): string[] => [...new Set(flags.map((flag) => flag.code).filter(Boolean))].slice(0, 5);

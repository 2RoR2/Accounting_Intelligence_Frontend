import { get } from "./client";

/** One step a record was reached by: the later record's relation to an earlier one in the chain (backend `GET /api/trace`). */
export type TraceVia = {
  text: string;
  key: string;
  number: string;
  type: string;
  amount: string | null;
  status: string | null;
};

export type TraceKind = "erp" | "record" | "upload" | "bank" | "settlement" | "journal";

export type TraceNode = {
  key: string;
  kind: TraceKind;
  id: string;
  /** A typed document type (`invoice`, `payment`, …), a scanned kind (`bill`, …), `bank-transaction`, `settlement`, `journal` or `reversal`. */
  type: string;
  number: string;
  status: string;
  party: string | null;
  date: string | null;
  amount: string | null;
  currency: string | null;
  detail: string | null;
  isSubject: boolean;
  via: TraceVia[];
};

export type TraceResult = { subject: string; nodes: TraceNode[]; truncated: boolean };

/** The chain around one record, oldest step first. `type` is a typed document type or `record`, `upload`, `bank-transaction`, `settlement`, `journal`. */
export const getTrace = (type: string, id: string) =>
  get<TraceResult>(`/api/trace/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);

export type SearchItem = {
  kind: "erp" | "record" | "upload" | "bank" | "journal" | "contact";
  id: string;
  type: string;
  number: string;
  title: string | null;
  status: string | null;
  date: string | null;
  amount: string | null;
  currency: string | null;
};
export type SearchGroup = { group: string; label: string; items: SearchItem[] };
export type SearchResult = { query: string; limit: number; groups: SearchGroup[] };

/** Top-bar search (backend `GET /api/search`): two characters or more, at most `limit` matches per type. */
export const globalSearch = (query: string, limit = 5) =>
  get<SearchResult>(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);

"use client";
/**
 * The list of documents the accountant is working through (task B4b): the review lane that holds the open document,
 * from GET /api/review/lanes (backend #12) when the backend has it, else the "to review" document list. Read when
 * the page opens and again after a submit, so the next document is one that still waits. The lane is remembered by
 * name when the page opens: after a submit the open document has left it, and "next" must stay in that lane.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { get } from "@/lib/api/client";
import { findLane, laneEntry, laneIds, toReviewIds, type LaneEntry, type LanesResponse } from "./review-logic";

/** Where the queue came from: a named lane of the lanes API, or the "to review" document list. */
export type QueueSource = { kind: "lanes"; lane: string } | { kind: "to-review" };

const toReviewList = async () => toReviewIds(await get<Array<{ id: string }>>("/api/documents?lane=to-review"));

/** The queue for the open document, and where it came from. */
export async function loadReviewQueue(currentId: string): Promise<{ source: QueueSource; ids: string[]; entry?: LaneEntry | null }> {
  try {
    const response = await get<LanesResponse>("/api/review/lanes");
    const found = findLane(response, currentId);
    // The entry carries the document's risk and spot-check pick (roadmap P1-lite).
    if (found) return { source: { kind: "lanes", lane: found.lane }, ids: found.ids, entry: laneEntry(response, currentId) };
  } catch {
    // Not deployed yet (404) or not allowed for this role: use the document list below.
  }
  return { source: { kind: "to-review" }, ids: await toReviewList() };
}

/** The same source read again; the submitted document is no longer in it. */
export async function reloadReviewQueue(source: QueueSource): Promise<string[]> {
  if (source.kind === "lanes") return laneIds(await get<LanesResponse>("/api/review/lanes"), source.lane);
  return toReviewList();
}

export function useReviewQueue(documentId: string) {
  const [queue, setQueue] = useState<string[]>([]);
  const [entry, setEntry] = useState<{ doc: string; value: LaneEntry | null }>();
  const source = useRef<QueueSource>({ kind: "to-review" });
  useEffect(() => {
    let cancelled = false;
    loadReviewQueue(documentId).then(result => {
      if (cancelled) return;
      source.current = result.source;
      setQueue(result.ids);
      setEntry({ doc: documentId, value: result.entry ?? null });
    }).catch(() => { if (!cancelled) setQueue([]); });
    return () => { cancelled = true; };
  }, [documentId]);
  /** The lane this page opened in, read again now. */
  const reload = useCallback(() => reloadReviewQueue(source.current).catch(() => [] as string[]), []);
  // Only the open document's entry: the previous document's stays hidden while the next one loads.
  return { queue, reload, entry: entry?.doc === documentId ? entry.value : null };
}

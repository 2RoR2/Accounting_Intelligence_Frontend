"use client";
/**
 * The list of documents the accountant is working through (task B4b): the review lane that holds the open document,
 * from GET /api/review/lanes (backend #12) when the backend has it, else the "to review" document list. Read when
 * the page opens and again after a submit, so the next document is one that still waits.
 */
import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api/client";
import { laneQueue, toReviewIds, type LanesResponse } from "./review-logic";

export async function loadReviewQueue(currentId: string): Promise<string[]> {
  try {
    const queue = laneQueue(await get<LanesResponse>("/api/review/lanes"), currentId);
    if (queue.length) return queue;
  } catch {
    // Not deployed yet (404) or not allowed for this role: use the document list below.
  }
  return toReviewIds(await get<Array<{ id: string }>>("/api/documents?lane=to-review"));
}

export function useReviewQueue(documentId: string) {
  const [queue, setQueue] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadReviewQueue(documentId).then(ids => { if (!cancelled) setQueue(ids); }).catch(() => { if (!cancelled) setQueue([]); });
    return () => { cancelled = true; };
  }, [documentId]);
  /** The lane read again now (after a submit the open document has left it). */
  const reload = useCallback(() => loadReviewQueue(documentId).catch(() => [] as string[]), [documentId]);
  return { queue, reload };
}

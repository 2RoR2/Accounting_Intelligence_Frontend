"use client";

import { useEffect } from "react";
import { recordReviewSession } from "@/lib/api/workload";
import { reviewSessionPayload } from "@/lib/workload";

const IDLE_AFTER_SECONDS = 30;

/**
 * Optional workload instrumentation for a review page: counts active seconds (tab visible and input within the last
 * 30 s) while `documentId` is open, and records one anonymous review session when it closes (unmount, another document,
 * or the page is hidden for good). Not wired in yet: the review page calls `useReviewTimer(documentId)` once its
 * current changes are merged. A failed recording is ignored; review time then reads "Not measured" in the report.
 */
export function useReviewTimer(documentId: string | undefined) {
  useEffect(() => {
    if (!documentId) return;
    const openedAt = new Date();
    let lastInput = Date.now();
    let active = 0;
    let idle = 0;
    let sent = false;
    const touch = () => { lastInput = Date.now(); };
    const events = ["keydown", "input", "pointerdown", "wheel", "scroll"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      const quiet = document.visibilityState !== "visible" || (Date.now() - lastInput) / 1000 > IDLE_AFTER_SECONDS;
      if (quiet) idle += 1; else active += 1;
    }, 1000);
    const send = () => {
      if (sent) return;
      sent = true;
      const payload = reviewSessionPayload(documentId, active, idle, openedAt, new Date());
      if (payload) void recordReviewSession(payload).catch(() => undefined);
    };
    window.addEventListener("pagehide", send);
    return () => {
      window.clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, touch, { capture: true }));
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [documentId]);
}

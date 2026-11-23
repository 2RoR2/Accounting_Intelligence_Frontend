"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ORDER, browserStorage, isDefaultOrder, loadLayout, resetLayout, saveLayout, type DashboardWidgetId,
} from "@/lib/dashboard-layout";

/**
 * The Dashboard's panel order for this user. It starts as the default, takes the saved order as soon as the page
 * is in the browser (storage is read nowhere else, so the first render matches the server), and saves every change.
 * If storage is blocked the order still changes for this visit.
 */
export function useDashboardLayout(userId: string) {
  const [order, setOrder] = useState<DashboardWidgetId[]>(DEFAULT_ORDER);

  useEffect(() => {
    setOrder(loadLayout(browserStorage(), userId));
  }, [userId]);

  const update = useCallback((next: DashboardWidgetId[]) => {
    setOrder(next);
    saveLayout(browserStorage(), userId, next);
  }, [userId]);

  const reset = useCallback(() => {
    setOrder([...DEFAULT_ORDER]);
    resetLayout(browserStorage(), userId);
  }, [userId]);

  return { order, update, reset, isDefault: isDefaultOrder(order) };
}

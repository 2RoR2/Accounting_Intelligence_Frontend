"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  dropPlacement, moveWidget, shiftWidget, widgetLabel, widgetSpans, type DashboardWidgetId, type DropPlacement,
} from "@/lib/dashboard-layout";

type Control = "grip" | "earlier" | "later";

/**
 * The Dashboard's panels in the user's order, each with a handle. Drag the handle onto another panel, or use the
 * arrow keys on the handle or the earlier/later buttons. Native drag and drop (no library); touch screens use the
 * buttons. Everything is announced for screen readers, and focus stays on the control that was used.
 */
export function DashboardWidgets({ order, widgets, onOrderChange }: {
  order: DashboardWidgetId[];
  widgets: Record<DashboardWidgetId, ReactNode>;
  onOrderChange: (next: DashboardWidgetId[]) => void;
}) {
  const spans = useMemo(() => widgetSpans(order), [order]);
  const [dragging, setDragging] = useState<DashboardWidgetId | null>(null);
  const [over, setOver] = useState<{ id: DashboardWidgetId; placement: DropPlacement } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const refocus = useRef<{ id: DashboardWidgetId; control: Control } | null>(null);

  // React moves the panel's element when the order changes, which drops keyboard focus: put it back.
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    root.current?.querySelector<HTMLElement>(`[data-widget="${target.id}"] [data-control="${target.control}"]`)?.focus();
  }, [order]);

  const commit = (next: DashboardWidgetId[], id: DashboardWidgetId) => {
    if (next.every((item, index) => item === order[index])) return false;
    setAnnouncement(`${widgetLabel(id)} moved to position ${next.indexOf(id) + 1} of ${next.length}.`);
    onOrderChange(next);
    return true;
  };

  const shift = (id: DashboardWidgetId, delta: -1 | 1, control: Control) => {
    if (!commit(shiftWidget(order, id, delta), id)) {
      setAnnouncement(`${widgetLabel(id)} is already ${delta < 0 ? "first" : "last"}.`);
      return;
    }
    refocus.current = { id, control };
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: DashboardWidgetId) => {
    const delta = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    shift(id, delta, "grip");
  };

  const startDrag = (event: DragEvent<HTMLButtonElement>, id: DashboardWidgetId) => {
    const panel = event.currentTarget.closest<HTMLElement>("[data-widget]");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", widgetLabel(id)); // Firefox only starts a drag that carries data
    if (panel) event.dataTransfer.setDragImage(panel, 24, 16);
    setDragging(id);
  };
  const endDrag = () => { setDragging(null); setOver(null); };

  // Judged by the width the panel is drawn at, so a stacked (narrow) page decides by top/bottom, not left/right.
  const placementOn = (event: DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rowWidth = root.current?.getBoundingClientRect().width ?? rect.width;
    return dropPlacement(rect, { x: event.clientX, y: event.clientY }, rect.width < rowWidth * 0.75 ? "half" : "full");
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>, id: DashboardWidgetId) => {
    if (!dragging || dragging === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const placement = placementOn(event);
    setOver((previous) => (previous?.id === id && previous.placement === placement ? previous : { id, placement }));
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>, id: DashboardWidgetId) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOver((previous) => (previous?.id === id ? null : previous));
  };
  const onDrop = (event: DragEvent<HTMLDivElement>, id: DashboardWidgetId) => {
    if (!dragging || dragging === id) return;
    event.preventDefault();
    commit(moveWidget(order, dragging, id, placementOn(event)), dragging);
    endDrag();
  };

  return (
    <div className="dash-widgets" ref={root}>
      {order.map((id, index) => {
        const label = widgetLabel(id);
        const classes = ["dash-widget", dragging === id ? "is-dragging" : "", over?.id === id ? `drop-${over.placement}` : ""].filter(Boolean).join(" ");
        return (
          <div key={id} className={classes} data-widget={id} data-span={spans[id]}
            onDragOver={(event) => onDragOver(event, id)} onDragLeave={(event) => onDragLeave(event, id)} onDrop={(event) => onDrop(event, id)}>
            <div className="dash-widget-tools" role="group" aria-label={`Move ${label}`}>
              <button type="button" className="dash-widget-grip" data-control="grip" draggable
                aria-label={`Move ${label}: drag it, or use the arrow keys`} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                title="Drag to rearrange, or press the arrow keys"
                onDragStart={(event) => startDrag(event, id)} onDragEnd={endDrag} onKeyDown={(event) => onKeyDown(event, id)}>
                <span className="dash-grip-dots" aria-hidden><i /><i /><i /><i /><i /><i /></span>
              </button>
              <button type="button" className="dash-widget-step" data-control="earlier" aria-disabled={index === 0}
                aria-label={`Move ${label} earlier`} title="Move earlier" onClick={() => shift(id, -1, "earlier")}>
                <ChevronUp size={15} aria-hidden />
              </button>
              <button type="button" className="dash-widget-step" data-control="later" aria-disabled={index === order.length - 1}
                aria-label={`Move ${label} later`} title="Move later" onClick={() => shift(id, 1, "later")}>
                <ChevronDown size={15} aria-hidden />
              </button>
            </div>
            {widgets[id]}
          </div>
        );
      })}
      <p className="dash-sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}

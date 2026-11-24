"use client";
/** The one-line status strip above the fields and the inline "Change type" popover (25 Nov review redesign). */
import { Fragment, useEffect, useId, useRef, type KeyboardEvent } from "react";
import { ChooseTypeControl } from "../choose-type";
import { TYPE_CHANGE_EXPLAINER, typeButton, type StatusPart, type StatusPartId, type TypePopoverEvent, type TypePopoverState } from "./review-status";

/** "2 to check · 11 read · 0 not found · Checks: 6 passed, 1 failed". Each part filters or jumps to what it counts. */
export function ReviewStatusStrip({ parts, detailsId, onPick }: {
  parts: readonly StatusPart[]; detailsId: string; onPick: (part: StatusPartId | "details") => void;
}) {
  if (!parts.length) return null;
  return <div className="review-status-strip" role="group" aria-label="Review status">
    {parts.map((part, index) => <Fragment key={part.id}>
      {index > 0 && <span className="review-status-sep" aria-hidden="true">·</span>}
      <button type="button" className={`review-status-part is-${part.tone}`} title={part.title} aria-label={`${part.text}. ${part.title}`}
        onClick={() => onPick(part.id)}>{part.text}</button>
    </Fragment>)}
    <button type="button" className="text-link review-status-more" aria-controls={detailsId} onClick={() => onPick("details")}>Details</button>
  </div>;
}

/**
 * "Change type" (or "Choose type" while the type is not certain) opens the type picker right beside the button, with
 * one line on what a new type changes. Focus moves into it; Escape or "Keep this type" closes it and returns focus.
 */
export function TypePicker({ canChoose, needsType, state, onEvent, current, busy, onChoose }: {
  canChoose: boolean; needsType: boolean; state: TypePopoverState; onEvent: (event: TypePopoverEvent) => void;
  current?: string; busy: boolean; onChoose: (kind: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.open) popover.current?.querySelector<HTMLSelectElement>("select")?.focus();
    else if (state.restoreFocus) trigger.current?.focus();
  }, [state.open, state.restoreFocus]);
  const button = typeButton({ canChoose, needsType });
  if (!button) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); onEvent("escape");
  };
  return <span className="review-type-picker">
    <button ref={trigger} type="button" className={`text-link${needsType ? " is-needed" : ""}`} aria-expanded={state.open} aria-controls={id}
      onClick={() => onEvent("toggle")}>{button.label}</button>
    {state.open && <div ref={popover} id={id} className="review-type-popover" role="dialog" aria-label={button.heading} onKeyDown={onKeyDown}>
      <strong>{button.heading}</strong>
      <p>{TYPE_CHANGE_EXPLAINER}</p>
      <ChooseTypeControl current={current} busy={busy} onChoose={onChoose} />
      <button type="button" className="btn small" onClick={() => onEvent("keep")}>{button.close}</button>
    </div>}
  </span>;
}

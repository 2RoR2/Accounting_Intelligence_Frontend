"use client";

/**
 * A "type or pick" field: type to filter (code, name, SKU, TIN ...), arrows to move, Enter or Tab to pick, Esc to close.
 * Two modes:
 * - pick (default): the value is one option's id. Text that matches nothing is dropped when the field loses focus, so
 *   the field always shows the chosen option. Optional fields can be cleared by deleting the text.
 * - free text (`text` + `onTextChange`): the value is the typed text and the options are suggestions; picking one calls
 *   onChange. Nothing is highlighted until an arrow key is pressed, so Enter keeps what was typed.
 * `onCreate` adds an "Add new ... '<typed text>'" row. Field (components/common/ui) passes id and aria-describedby.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { exactOption, filterOptions, type ComboOption } from "./assisted-entry";
import "@/styles/assisted-entry.css";

type Props<T extends ComboOption> = {
  id?: string;
  "aria-describedby"?: string;
  /** The chosen option's id (pick mode). */
  value?: string;
  options: readonly T[];
  onChange: (id: string, option: T | undefined) => void;
  /** Shown when the value is not among the options (a saved choice, or one still loading). */
  fallbackLabel?: string | null;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  /** Free-text mode. */
  text?: string;
  onTextChange?: (text: string) => void;
  /** Adds an "Add new" row for the typed text. */
  onCreate?: (text: string) => void;
  createLabel?: string;
  /** Shown when nothing matches. */
  emptyMessage?: string;
  /** The options are still loading. */
  loading?: boolean;
};

export function Combobox<T extends ComboOption>({
  id, "aria-describedby": describedBy, value = "", options, onChange, fallbackLabel, placeholder, required, disabled,
  autoFocus, maxLength = 500, text, onTextChange, onCreate, createLabel = "Add new", emptyMessage = "No matches", loading = false,
}: Props<T>) {
  const freeText = onTextChange !== undefined;
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.id === value);
  const selectedLabel = selected?.label ?? (value ? fallbackLabel || "Saved selection" : "");
  /** What the user typed while the list is open (pick mode); null when showing the chosen option. */
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shown = freeText ? text ?? "" : query ?? selectedLabel;
  const typed = freeText ? text ?? "" : query ?? "";
  const matches = useMemo(() => filterOptions(options, typed, 60), [options, typed]);
  const canCreate = !!onCreate && typed.trim().length > 0 && !exactOption(options, typed);
  const rows = matches.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (active < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    setOpen(false);
    setActive(-1);
    setQuery(null);
  }

  function pick(option: T) {
    onChange(option.id, option);
    close();
  }

  function create() {
    const name = typed.trim();
    close();
    onCreate?.(name);
  }

  function choose(index: number) {
    if (index >= 0 && index < matches.length) pick(matches[index]);
    else if (canCreate && index === matches.length) create();
  }

  /** Leaving the field: keep the chosen option, or clear an optional one whose text was deleted. */
  function commit() {
    if (!freeText && query !== null) {
      const exact = exactOption(options, query);
      if (exact && exact.id !== value) onChange(exact.id, exact);
      else if (!query.trim() && value) onChange("", undefined);
    }
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setOpen(true); setActive(freeText ? 0 : Math.max(0, matches.findIndex(({ id }) => id === value))); return; }
      if (!rows) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + rows) % rows);
    } else if (event.key === "Enter") {
      if (open && active >= 0 && active < rows) {
        // Picked from the list: handled here, so the form does not save and the line does not move on.
        event.preventDefault();
        event.stopPropagation();
        choose(active);
      } else {
        // Closed list: never submit the form from here; the lines panel may move to the next field.
        event.preventDefault();
        if (open) commit();
      }
    } else if (event.key === "Tab") {
      // Typed text and a highlighted match: Tab takes it, like picking it.
      if (open && typed.trim() && active >= 0 && active < matches.length && !freeText) pick(matches[active]);
      else commit();
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }
  }

  const activeId = open && active >= 0 && active < rows ? `${listId}-${active}` : undefined;
  return <div className="combo">
    <input ref={input} id={inputId} type="text" role="combobox" autoComplete="off" spellCheck={false}
      aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={activeId}
      aria-describedby={describedBy} value={shown} placeholder={placeholder} required={required} disabled={disabled}
      autoFocus={autoFocus} maxLength={maxLength}
      onFocus={(event) => { if (!freeText) event.currentTarget.select(); }}
      onMouseDown={() => { if (!open && !disabled) { setOpen(true); setActive(-1); } }}
      onChange={(event) => {
        const next = event.target.value;
        if (freeText) onTextChange?.(next);
        else setQuery(next);
        setOpen(true);
        // Pick mode highlights the best match so Enter or Tab takes it; free text keeps what was typed.
        setActive(freeText || !next.trim() ? -1 : 0);
      }}
      onBlur={commit} onKeyDown={onKeyDown} />
    {open && !disabled && <ul ref={list} id={listId} role="listbox" className="combo-list"
      aria-label={placeholder ?? "Choices"} onMouseDown={(event) => event.preventDefault()}>
      {matches.map((option, index) => <li key={option.id} id={`${listId}-${index}`} data-index={index} role="option"
        aria-selected={index === active} className={option.id === value ? "is-chosen" : undefined}
        onMouseEnter={() => setActive(index)} onClick={() => pick(option)}>
        <span className="combo-label">{option.label}</span>
        {option.detail && <span className="combo-detail">{option.detail}</span>}
      </li>)}
      {canCreate && <li id={`${listId}-${matches.length}`} data-index={matches.length} role="option"
        aria-selected={active === matches.length} className="combo-create"
        onMouseEnter={() => setActive(matches.length)} onClick={create}>
        <span className="combo-label">+ {createLabel} “{typed.trim()}”</span>
      </li>}
      {!rows && <li className="combo-empty" role="presentation">{loading ? "Loading…" : options.length ? emptyMessage : "Nothing to choose yet"}</li>}
    </ul>}
  </div>;
}

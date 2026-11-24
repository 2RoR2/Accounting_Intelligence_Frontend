"use client";
/** Review page pieces from the 24 Nov demo audit: blocking checks, adding a field, and a due date from terms. */
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { useResource } from "@/features/common/hooks/use-resource";
import { contactTermDays } from "@/features/common/erp/line-defaults";
import { listContacts } from "@/lib/api/erp.service";
import { checkSentence, duplicateState, ruleCode, sentenceIsMessage } from "@/lib/glossary";
import type { ValidationResult } from "@/types";
import { ADDED_FIELD_LABELS, addedValueProblem, dueSuggestion } from "./key-fields";

/** The shortcut beside one finding in the review box: a jump to the field to fill, the other document, or Set aside. */
export function checkShortcut(item: ValidationResult): "fill" | "open-duplicate" | "set-aside" | null {
  const duplicate = duplicateState(item);
  if (duplicate === "not-run" && item.field) return "fill";
  if (duplicate === "found" && item.duplicate_of) return "open-duplicate";
  if (ruleCode(item.rule) === "BUYER-NOT-COMPANY" && item.result === "FAIL") return "set-aside";
  return null;
}

/** Every check that still blocks approval, listed on the Review tab so nothing says "all clear" while one is open. */
export function BlockingChecksNotice({ items, labelFor, onOpenChecks, onFill, documentHref, onSetAside }: {
  items: readonly ValidationResult[]; labelFor: (field: string) => string; onOpenChecks: () => void;
  /** Jump to (and focus) a field the duplicate check needs. */
  onFill?: (field: string) => void;
  /** The review page of another document, for "Open the other document". */
  documentHref?: (id: string) => string;
  /** Opens this page's Set aside control; absent when this person cannot set it aside. */
  onSetAside?: () => void;
}) {
  if (!items.length) return null;
  return <div className="review-blocking-notice" role="status" aria-label="Checks that block approval">
    <strong>{items.length} {items.length === 1 ? "check blocks" : "checks block"} approval</strong>
    <ul>{items.map((item, index) => {
      const shortcut = checkShortcut(item);
      // EX-007 and BUYER-NOT-COMPANY say it all in their own message; the others add it in small print.
      const own = sentenceIsMessage(item) || duplicateState(item) === "not-run";
      return <li key={`${item.rule}:${item.field ?? ""}:${index}`}>
        {checkSentence(item)}{!own && item.field ? ` (${labelFor(item.field)})` : ""}
        {!own && item.message ? <small> {item.message}</small> : null}
        {shortcut === "fill" && onFill && <> <button type="button" className="btn small" onClick={() => onFill(item.field!)}>Fill {labelFor(item.field!).toLowerCase()}</button></>}
        {shortcut === "open-duplicate" && documentHref && <> <Link className="btn small" href={documentHref(item.duplicate_of!)}>Open the other document</Link></>}
        {shortcut === "set-aside" && onSetAside && <> <button type="button" className="btn small" onClick={onSetAside}>Set aside…</button></>}
      </li>;
    })}</ul>
    <button type="button" className="text-link" onClick={onOpenChecks}>Open the Checks tab</button>
  </div>;
}

/** "terms, PO number, …": the first fields the menu offers, for its label. */
export function addableHint(keys: readonly string[]): string {
  const short = (key: string) => SHORT_NAMES[key] ?? (ADDED_FIELD_LABELS[key] ?? key).toLowerCase();
  return keys.length ? `${keys.slice(0, 2).map(short).join(", ")}, …` : "";
}
const SHORT_NAMES: Record<string, string> = { payment_terms: "terms", purchase_order_number: "PO number", received_date: "received date", due: "due date" };

/**
 * One entry point for what reading missed (25 Nov review findings): "Add missing information" opens a small menu,
 * "A field (terms, PO number, …)" or "A line item", and then only that form. The two used to sit open, stacked with
 * the reading notes, and looked like overlapping tools.
 */
export function AddMissingInfo({ fieldKeys, busy, onAddField, lineForm }: {
  fieldKeys: readonly string[]; busy: boolean; onAddField: (key: string, value: string) => Promise<unknown>;
  /** The "add a printed line" form, or null when lines cannot be added here. */
  lineForm: ReactNode | null;
}) {
  const menuId = useId();
  const [menu, setMenu] = useState(false);
  const [choice, setChoice] = useState<"field" | "line" | null>(null);
  if (!fieldKeys.length && !lineForm) return null;
  const pick = (next: "field" | "line") => { setChoice(next); setMenu(false); };
  return <section className="review-field-group review-add-missing" aria-label="Add missing information">
    <div className="review-add-missing-head">
      <span>Printed on the document but not read?</span>
      <button type="button" className="btn small" aria-haspopup="menu" aria-expanded={menu} aria-controls={menuId} disabled={busy}
        onClick={() => setMenu((open) => !open)}>Add missing information</button>
    </div>
    {menu && <div className="review-add-missing-menu" role="menu" id={menuId} aria-label="What to add">
      {fieldKeys.length > 0 && <button type="button" role="menuitem" onClick={() => pick("field")}>A field <small>({addableHint(fieldKeys)})</small></button>}
      {lineForm && <button type="button" role="menuitem" onClick={() => pick("line")}>A line item <small>(a printed row that was not read)</small></button>}
    </div>}
    {choice === "field" && fieldKeys.length > 0 && <AddFieldControl keys={fieldKeys} busy={busy} onAdd={onAddField} onClose={() => setChoice(null)} />}
    {choice === "line" && lineForm && <div className="review-add-missing-form">{lineForm}
      <button type="button" className="text-link" onClick={() => setChoice(null)}>Cancel</button></div>}
  </section>;
}

/** A field reading did not store (terms, due date, PO number...). Saved like a correction, with the reviewer's name. */
export function AddFieldControl({ keys, busy, onAdd, onClose }: {
  keys: readonly string[]; busy: boolean; onAdd: (key: string, value: string) => Promise<unknown>; onClose?: () => void;
}) {
  const id = useId();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState("");
  if (!keys.length) return null;
  const date = key === "due" || key === "received_date";
  const submit = async () => {
    const issue = addedValueProblem(key, value);
    if (issue) { setProblem(issue); return; }
    setProblem("");
    try { await onAdd(key, value.trim()); setKey(""); setValue(""); onClose?.(); }
    catch (error) { setProblem((error as Error).message); }
  };
  return <div className="review-add-field review-add-missing-form">
    <div className="review-add-field-row">
      <label htmlFor={`${id}-key`}>Field</label>
      <select id={`${id}-key`} value={key} disabled={busy} onChange={(event) => { setKey(event.target.value); setValue(""); setProblem(""); }}>
        <option value="">Choose a field</option>
        {keys.map((item) => <option key={item} value={item}>{ADDED_FIELD_LABELS[item] ?? item}</option>)}
      </select>
      {key && <>
        <label htmlFor={`${id}-value`}>Value</label>
        <input id={`${id}-value`} type={date ? "date" : "text"} value={value} disabled={busy}
          placeholder={key === "payment_terms" ? "e.g. NET 30" : undefined} onChange={(event) => setValue(event.target.value)} />
        <button type="button" className="btn small primary" disabled={busy || !value.trim()} onClick={() => void submit()}>Add field</button>
      </>}
      {onClose && <button type="button" className="text-link" onClick={onClose}>Cancel</button>}
    </div>
    {problem && <p className="notice danger" role="alert">{problem}</p>}
  </div>;
}

/**
 * Offers a due date from the printed payment terms, or else from the supplier's (customer's) terms in Contacts.
 * Nothing is saved until the reviewer presses "Use this due date".
 */
export function DueDateHelper({ party, partyKind, documentDate, due, printedTerms, busy, onUse }: {
  party?: string | null; partyKind: "supplier" | "customer"; documentDate?: string | null; due?: string | null;
  printedTerms?: string | null; busy: boolean; onUse: (due: string) => void;
}) {
  const name = (party ?? "").trim();
  const { data } = useResource(async () => name ? listContacts({ kind: partyKind, search: name }) : [], `due-terms:${partyKind}:${name}`);
  const contact = (data ?? []).find((row) => row.legalName.trim().toLowerCase() === name.toLowerCase()) ?? (data?.length === 1 ? data[0] : undefined);
  const suggestion = dueSuggestion({ documentDate, due, printedTerms, contactDays: contactTermDays(contact), contactKind: partyKind });
  if (!suggestion) return null;
  return <div className="shoebox-field-candidates review-due-helper" role="status">
    <small>{due ? `The due date ${due} does not match the printed terms. ` : "No due date is stored. "}
      From the {suggestion.source} ({suggestion.days} days after {documentDate}): <strong>{suggestion.due}</strong>.</small>{" "}
    <button type="button" className="btn small" disabled={busy} onClick={() => onUse(suggestion.due)}>Use this due date</button>
  </div>;
}

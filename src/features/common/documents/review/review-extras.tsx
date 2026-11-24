"use client";
/** Review page pieces from the 24 Nov demo audit: blocking checks, adding a field, and a due date from terms. */
import { useId, useState } from "react";
import { useResource } from "@/features/common/hooks/use-resource";
import { contactTermDays } from "@/features/common/erp/line-defaults";
import { listContacts } from "@/lib/api/erp.service";
import { ruleSentence } from "@/lib/glossary";
import type { ValidationResult } from "@/types";
import { ADDED_FIELD_LABELS, addedValueProblem, dueSuggestion } from "./key-fields";

/** Every check that still blocks approval, listed on the Review tab so nothing says "all clear" while one is open. */
export function BlockingChecksNotice({ items, labelFor, onOpenChecks }: {
  items: readonly ValidationResult[]; labelFor: (field: string) => string; onOpenChecks: () => void;
}) {
  if (!items.length) return null;
  return <div className="review-blocking-notice" role="status" aria-label="Checks that block approval">
    <strong>{items.length} {items.length === 1 ? "check blocks" : "checks block"} approval</strong>
    <ul>{items.map((item, index) => <li key={`${item.rule}:${item.field ?? ""}:${index}`}>
      {ruleSentence(item.rule, item.field)}{item.field ? ` (${labelFor(item.field)})` : ""}
      {item.message ? <small> {item.message}</small> : null}
    </li>)}</ul>
    <button type="button" className="text-link" onClick={onOpenChecks}>Open the Checks tab</button>
  </div>;
}

/** A field reading did not store (terms, due date, PO number...). Saved like a correction, with the reviewer's name. */
export function AddFieldControl({ keys, busy, onAdd }: {
  keys: readonly string[]; busy: boolean; onAdd: (key: string, value: string) => Promise<unknown>;
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
    try { await onAdd(key, value.trim()); setKey(""); setValue(""); }
    catch (error) { setProblem((error as Error).message); }
  };
  return <details className="review-field-group review-add-field">
    <summary><span>Add a field</span><small>Printed on the document but not read: terms, due date, PO number…</small></summary>
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
    </div>
    {problem && <p className="notice danger" role="alert">{problem}</p>}
  </details>;
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

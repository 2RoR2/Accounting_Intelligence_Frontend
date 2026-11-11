"use client";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
export function LineItemCorrectionField({ label, value, displayValue, readonly, busy, onSave }: {
  label: string; value: string | number | null; displayValue?: string; readonly: boolean; busy: boolean;
  onSave: (value: string) => Promise<string>;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  useEffect(() => { if (!dirty) setDraft(value == null ? "" : String(value)); }, [value, dirty]);
  if (readonly && !dirty) return <span>{displayValue ?? value ?? "Not provided"}</span>;
  return <div className="shoebox-field line-correction-field">
    <label htmlFor={label}>{label}</label>
    <input id={label} aria-label={label} value={draft} disabled={readonly || saving || busy} onChange={event => {
      setDraft(event.target.value); setDirty(true); setConflict(false); setError("");
    }} />
    <small>Saved: {value ?? "Not provided"}</small>
    <button className="btn small" type="button" aria-label={"Save " + label} disabled={readonly || busy || saving || !dirty || conflict} onClick={async () => {
      setSaving(true); setError("");
      try { const confirmed = await onSave(draft); setDraft(confirmed); setDirty(false); }
      catch (error) { setError(error instanceof Error ? error.message : "Line correction was not confirmed."); setConflict(error instanceof ApiError && error.status === 409); }
      finally { setSaving(false); }
    }}>{saving ? "Saving..." : "Save line field"}</button>
    {error && <p role="alert">{error}{conflict ? " A refresh was requested; your unsaved draft is retained. Review authoritative saved values before editing again." : ""}</p>}
    {readonly && dirty && <p>Your unsaved draft is retained. This document is no longer editable.</p>}
  </div>;
}

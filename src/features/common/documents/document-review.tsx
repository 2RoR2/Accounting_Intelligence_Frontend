"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleX, FileCheck2, RefreshCw } from "lucide-react";
import type { CurrencyReview, EvidenceStatus, ExtractedField, SourceEvidence, User } from "@/types";
import { AiAssistPanel } from "./ai-assist-panel";
import { MissingLineForm } from "./missing-line-form";
import { CURRENCY_SUPPORT, sourceCheckReason, aiAssistOutcomeLabel, alternativeCandidates, candidateText, dateReadings, dollarCurrencyChoices, processingSteps, validationRank, type ProcessingTrace } from "@/lib/api/document-contract";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  acceptValidationReview,
  addExtractedLineItem,
  retryDocumentProcessing,
  getDocument,
  getExceptions,
  getExtraction,
  getValidationReport,
  revalidateDocument,
  updateExtractedField,
  updateExtractedLineItem,
} from "@/lib/api/document.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import {
  getStandardisedRecords,
  standardiseDocument,
} from "@/lib/api/record.service";
import {
  Badge,
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  Toast,
  formatDate,
} from "@/components/common/ui";
import { evidenceLabel, extractionStateLabel, reviewSignalLabel, ruleCode, ruleSentence } from "@/lib/glossary";
import { ApiError } from "@/lib/api/client";
import { canEditDocument, canDecideReview } from "@/lib/permissions/document-review";
import { decimalDisplay as money, fieldLabel, reviewableFinding, sourceKind, standardisationAvailable, validationState, validationSummary } from "@/lib/api/document-contract";
import { TransactionAnomalyVisual } from "@/features/common/documents/transaction-anomaly-visual";
import { SourceEvidenceList } from "@/components/common/documents/document-viewer";
import { DocumentDetailPreview } from "@/features/common/documents/invoice-detail-preview";
import { RecordDetail } from "@/features/common/records/records";
import {
  addDocumentComment,
  createCustomer,
  createSupplier,
  decideDocumentReview,
  getDocumentKindWorkflow,
  getDocumentReviews,
  getDocumentComments,
  saveDocumentDraft,
  submitDocumentReview,
  type DocumentComment,
} from "@/lib/api/workflow.service";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ReviewSource } from "./review/source-pages";
import { useReviewQueue } from "./review/use-review-queue";
import { SIGNAL_TEXT, enterAction, failedCheckNames, isToCheck, neighbourDocument, notFoundEntries, nextAfterSubmit, reviewOrder, reviewShortcut, revisionToSubmit, settleDraft, stableOrder, stepField, suggestedValue, unsavedOutside, visibleEntries, type ReviewSignal, type SavedDraft } from "./review/review-logic";
import "@/styles/review.css";


/** What the reviewer sees under a field: the backend's review signal when present, else the evidence status, in plain words. */
const fieldStateText = (field: Pick<ExtractedField, "reviewSignal" | "evidenceStatus" | "state">) =>
  field.reviewSignal ? reviewSignalLabel(field.reviewSignal)
    : field.evidenceStatus ? evidenceLabel(field.evidenceStatus satisfies EvidenceStatus)
      : extractionStateLabel(field.state);

/** A reason is required and goes on the audit log. It applies to this revision only, and local-admin approval still follows. */
function ValidationReviewForm({ rule, busy, onSubmit }: { rule: string; busy: boolean; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  const inputId = useId();
  const enough = note.trim().length >= 10;
  return <div className="validation-review-form">
    <label htmlFor={inputId}>{rule === "EX-010" ? "Why is this amount acceptable?" : "How do you know the tax treatment is right?"}</label>
    <textarea id={inputId} rows={2} value={note} disabled={busy} onChange={e => setNote(e.target.value)} />
    <button type="button" className="btn small" disabled={busy || !enough} onClick={() => onSubmit(note.trim())}>Record review</button>
    <small>Recorded with your name. A later correction reopens it, and a local admin must still approve.</small>
  </div>;
}

function ProcessingPanel({ trace, type, status, labelFor }: { trace?: ProcessingTrace; type?: string; status?: string; labelFor: (key: string) => string }) {
  const steps = processingSteps(trace);
  if (!steps.length) return null;
  return <details className="review-field-group processing-panel"><summary><span>Details</span><small>How this document was read</small></summary>
    <ul>
      <li>Detected type: {type ?? "not recorded"}{status && status !== "classified" ? " (needs review)" : ""}</li>
      {steps.map(step => <li key={step}>{step}</li>)}
      {trace?.qwen?.fields?.map(item => <li key={item.field}>{labelFor(item.field)}: {item.outcome ? aiAssistOutcomeLabel(item.outcome) : "no outcome recorded"}{sourceCheckReason(item.source_check) ? ` (${sourceCheckReason(item.source_check)})` : ""}</li>)}
    </ul>
  </details>;
}

/** A suggestion to confirm, never evidence. Saving is the reviewer's explicit decision and is audited on the server. */
function CurrencyReviewPanel({ review, readonly, saving, onConfirm }: { review: CurrencyReview; readonly: boolean; saving: boolean; onConfirm: (code: string) => void }) {
  const confirm = (code: string) => !readonly && <button type="button" className="btn small" disabled={saving} aria-label={`Confirm ${code} as this document's currency`} onClick={() => onConfirm(code)}>Confirm {code}</button>;
  if (!review.needed) {
    if (!review.decision) return null;
    const { decision } = review;
    return <div className="shoebox-field-candidates" aria-label="Currency decision">
      <small><strong>Confirmed as {decision.value}</strong>{decision.by ? ` by ${decision.by}` : ""}{decision.at ? ` on ${decision.at.slice(0, 10)}` : ""}. This is a person&apos;s decision, not a value read from the document.</small>
      {!!decision.selectedBasis?.length && <ul>{decision.selectedBasis.map((clue, index) => <li key={index}>{clue.text}</li>)}</ul>}
    </div>;
  }
  return <div className="shoebox-field-candidates" aria-label="Currency review">
    {review.printedSymbol && <p><small>The document prints only &quot;{review.printedSymbol.symbol}&quot;{review.printedSymbol.text ? ` (${review.printedSymbol.text})` : ""}, which does not name a currency.</small></p>}
    {review.proposals.map(proposal => <div key={proposal.currency} data-currency-proposal={proposal.currency}>
      <p><strong>{proposal.rank === 1 ? "Proposed" : "Also possible"}: {proposal.currency}</strong> <small>Not verified. {CURRENCY_SUPPORT[proposal.support]}.</small></p>
      <ul>{proposal.clues.map((clue, index) => <li key={index}>{clue.name}: &quot;{clue.text}&quot; ({clue.why}{clue.page ? `, page ${clue.page}` : ""})</li>)}</ul>
      {confirm(proposal.currency)}
    </div>)}
    {review.proposals.length === 0 && <p><small>Nothing on the document or in your contact records points to one currency.</small></p>}
    {review.disagreement && <p role="status"><small>These clues point to different currencies. Check the document before choosing.</small></p>}
    {review.conflicts.map((item, index) => <p key={index}><small>{item.currency} is not proposed: {item.name} (&quot;{item.text}&quot;) points to it, but the document prints {review.printedSymbol?.symbol}.</small></p>)}
    {review.alternatives.length > 0 && !readonly && <p><small>If the document or supplier shows another dollar currency: </small>{review.alternatives.map(code => <span key={code}>{confirm(code)} </span>)}</p>}
    <p><small>{review.statement}</small></p>
  </div>;
}

/** Another document may have added this contact since this result was stored: then only revalidation is needed. */
const addedOrExisting = (request: Promise<unknown>) => request.catch(e => { if (!(e instanceof ApiError && e.status === 409)) throw e; });

/** Focus target after the last field: the "Save and submit" button. */
const SUBMIT_TARGET = "__submit__";

/** What the review page's keyboard handler can do inside one field (task B4b). */
interface FieldKeyActions { value: string; dirty: boolean; suggestion: string | null; save: (value: string) => Promise<boolean> }

function FormField({ field, fieldKey, onSave, onFocus, readonly, selected, onDirtyChange, currencyReview, signal, inputRef, onInputKey, onPendingChange, savedDraft, locked }: {
  field: ExtractedField; fieldKey?: string; onSave: (value: string) => Promise<void>; onFocus?: () => void; readonly: boolean; selected?: boolean;
  onDirtyChange?: (label: string, dirty: boolean) => void; currencyReview?: CurrencyReview | null;
  /** Review signal in plain words; header fields only. */
  signal?: ReviewSignal; inputRef?: (element: HTMLInputElement | null) => void;
  onInputKey?: (event: KeyboardEvent<HTMLInputElement>, actions: FieldKeyActions) => void;
  /** Reports the unsaved value (null when saved) so Ctrl+Enter can save it. */
  onPendingChange?: (value: string | null) => void;
  /** The page's note that it saved this field's draft itself (Ctrl+Enter), passed once the saved values were read back. */
  savedDraft?: SavedDraft;
  /** True while the page saves and submits: no edit may start after its snapshot of the drafts. */
  locked?: boolean;
}) {
  const inputId = useId();
  const [value, setValue] = useState(field.value ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const candidates = alternativeCandidates(field);
  const readings = !field.correctedBy && field.value == null && (fieldKey === "date" || fieldKey === "due")
    ? candidates.source.flatMap(item => dateReadings(item.value ?? item.raw_text)).slice(0, 2) : [];
  const currencies = !field.correctedBy && !currencyReview ? dollarCurrencyChoices(fieldKey ?? "", field) : [];
  const currencyOptions = Object.keys(CURRENCY_SUPPORT);
  useEffect(() => { if (!dirty) setValue(field.value ?? ""); }, [field.value, dirty]);
  useEffect(() => {
    onDirtyChange?.(field.label, dirty);
    return () => onDirtyChange?.(field.label, false);
  }, [dirty, field.label, onDirtyChange]);
  useEffect(() => { onPendingChange?.(dirty ? value : null); }, [dirty, value, onPendingChange]);
  // A draft is settled once the stored value equals it, or the page's save note carries exactly this draft (the backend
  // may normalise it). Each note is used once (settleDraft), so a later edit repeating an old saved value stays unsaved.
  const usedNote = useRef<number | undefined>(undefined);
  useEffect(() => {
    const result = settleDraft(value, field.value, savedDraft, usedNote.current);
    usedNote.current = result.usedId;
    if (dirty && result.settled) setDirty(false);
  }, [dirty, value, field.value, savedDraft]);
  /** Fills the input only. Nothing is stored until the reviewer presses Save. */
  const fillFromCandidate = (candidate: string) => { setValue(candidate); setDirty(true); setConflict(false); setError(""); };
  const save = async (next: string) => {
    setSaving(true); setError("");
    try { await onSave(next); setDirty(false); return true; }
    catch (e) { setError((e as Error).message); setConflict(e instanceof ApiError && e.status === 409); return false; }
    finally { setSaving(false); }
  };
  // Enter accepts a printed or suggested value, except an unclear day/month order, which the reviewer must choose, and
  // never over a person's correction or a filled value (enterAction). The hint shows only when Enter would use it.
  const candidate = readonly || readings.length ? null : suggestedValue(candidates, field.value);
  const enterPlan = enterAction({ dirty: false, value: field.value ?? "", suggestion: candidate, signal, corrected: !!field.correctedBy });
  const suggestion = enterPlan !== "move" && enterPlan.save === candidate ? candidate : null;
  return <div className={`shoebox-field${selected ? " selected" : ""}${signal ? ` review-signal-${signal}` : ""}`} onFocusCapture={onFocus} data-field={fieldKey}>
    <div className="shoebox-field-heading"><label className="shoebox-label" htmlFor={inputId}>{field.label}</label>
      {onFocus && <button type="button" className="text-link" aria-label={`View source for ${field.label}`} aria-pressed={!!selected} onClick={onFocus}>View source</button>}
    </div>
    <span className={`shoebox-field-state${signal ? ` review-signal is-${signal}` : ""}`}>{currencyReview?.decision && field.correctedBy ? "Confirmed by a person, not read from the document" : field.correctedBy ? "Corrected by a reviewer" : signal ? SIGNAL_TEXT[signal] : fieldStateText(field)}</span>
    <input id={inputId} ref={inputRef} list={fieldKey === "currency" ? `${inputId}-currency-options` : undefined} aria-label={field.label} value={value} disabled={readonly || saving || locked}
      aria-describedby={suggestion && onInputKey ? `${inputId}-enter` : undefined}
      onKeyDown={onInputKey ? event => onInputKey(event, { value, dirty, suggestion, save }) : undefined}
      onFocus={onFocus} onChange={e => { setValue(e.target.value); setDirty(true); setConflict(false); setError(""); }} />
    {suggestion && onInputKey && <small className="review-enter-hint" id={`${inputId}-enter`}>Press Enter to use {suggestion}</small>}
    {fieldKey === "currency" && <datalist id={`${inputId}-currency-options`}>{currencyOptions.map(code => <option key={code} value={code} />)}</datalist>}
    {selected && <div className="shoebox-mobile-evidence"><strong>Selected source evidence</strong>
      {field.evidence?.length ? field.evidence.map((item, index) => <div key={index}><strong>Source page {item.page ?? "not provided"}</strong><p>{item.text ?? "Source text not provided"}</p></div>) : <p>Source evidence not available.</p>}
    </div>}
    <details className="shoebox-field-metadata"><summary>Details</summary>
      <dl><dt>Raw source value</dt><dd>{field.rawValue ?? "Not provided"}</dd>
        <dt>Extracted value</dt><dd>{field.original ?? "Not provided"}</dd>
        <dt>Saved current value</dt><dd>{field.value ?? "Not provided"}</dd>
        <dt>Method</dt><dd>{field.method ?? "Not provided"}</dd>
        <dt>Confidence</dt><dd>{field.confidence == null ? "Not measured" : String(field.confidence)}</dd>
        {field.ocrEngineScore && <><dt>OCR engine score</dt><dd>{field.ocrEngineScore.min === field.ocrEngineScore.max ? field.ocrEngineScore.min.toFixed(3) : `${field.ocrEngineScore.min.toFixed(3)} to ${field.ocrEngineScore.max.toFixed(3)}`} (text recognition only, not field correctness)</dd></>}
        {field.correctedBy && <><dt>Corrected by</dt><dd>{field.correctedBy}</dd><dt>Corrected at</dt><dd>{field.correctedAt ?? "Not provided"}</dd></>}
      </dl>
    </details>
    {!field.correctedBy && candidates.source.length > 0 && <div className="shoebox-field-candidates"><small>Printed in source, not selected:</small>
      <ul>{candidates.source.map((item, index) => <li key={index}>{candidateText(item)}
        {!readonly && item.value != null && readings.length === 0 && <button type="button" className="text-link" onClick={() => fillFromCandidate(item.value!)}>Use this value</button>}</li>)}</ul></div>}
    {!field.correctedBy && candidates.model.length > 0 && <div className="shoebox-field-candidates"><small>Model suggestion, not verified as an accounting fact. Not applied:</small>
      <ul>{candidates.model.map((item, index) => <li key={index}>{candidateText(item)}
        {!readonly && item.value != null && <button type="button" className="text-link" onClick={() => fillFromCandidate(item.value!)}>Use this value</button>}</li>)}</ul>
      {field.value != null && <small>Parser value: {field.value}. The parser value is kept unless you change it.</small>}</div>}
    {!readonly && readings.length > 0 && <div className="shoebox-field-candidates"><small>Day and month order is not clear. Check the document, then choose:</small>
      <ul>{readings.map(item => <li key={item.value}>{item.label}: {item.value} <button type="button" className="text-link" onClick={() => fillFromCandidate(item.value)}>Use this reading</button></li>)}</ul></div>}
    {currencyReview && <CurrencyReviewPanel review={currencyReview} readonly={readonly} saving={saving} onConfirm={code => void save(code)} />}
    {!readonly && currencies.length > 0 && <div className="shoebox-field-candidates"><small>&quot;$&quot; does not name a currency. If the document or supplier shows which one, choose:</small>
      <ul>{currencies.map(code => <li key={code}><button type="button" className="text-link" onClick={() => fillFromCandidate(code)}>{code}</button></li>)}</ul></div>}
    {field.confirmationRequired && field.evidenceStatus !== "source_backed" && <small>Accountant confirmation required</small>}
    {field.warnings?.map((warning, index) => <p role="status" key={warning.code + index}>
      {warning.reviewed ? "Reviewed" : "Please check"}: {warning.message}
    </p>)}
    {!readonly && <button type="button" className="btn small" aria-label={"Save " + field.label} disabled={!dirty || saving || conflict || locked} onClick={() => void save(value)}>{saving ? "Saving..." : "Save field"}</button>}
    {error && <p role="alert">{error}{conflict ? " Latest data refreshed; your draft is retained. Edit again after reviewing the saved value." : ""}</p>}
  </div>;
}

/**
 * One review page per document: moving to the next document (Alt+Right, or after a submit) starts from a clean page,
 * so the previous document's values are never on screen, or editable, under the next document's id.
 */
export function DocumentReview({ user, documentId }: { user: User; documentId: string }) {
  return <DocumentReviewPage key={documentId} user={user} documentId={documentId} />;
}

function DocumentReviewPage({
  user,
  documentId,
}: {
  user: User;
  documentId: string;
}) {
  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const { data, error, loading, refresh } = useResource(
    async () => {
      const [doc, extraction] = await Promise.all([
        getDocument(user, documentId),
        getExtraction(user, documentId),
      ]);
      const validationReport = ["UPLOADED","QUEUED","PROCESSING","FAILED"].includes(doc.status) ? null : await getValidationReport(user, documentId);
      const optional = async <T,>(request: Promise<T>, fallback: T) => {
        try {
          return await Promise.race([
            request,
            new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), 4000)),
          ]);
        } catch {
          return fallback;
        }
      };
      // This document's rows only. The tenant-wide lists took about a second each and the audit
      // list stops at the newest 500 entries, which dropped an older document's history.
      const recordsRequest = getStandardisedRecords(user);
      const [exceptions, records, audit, comments, workflow, reviews] = await Promise.all([
        optional(getExceptions(user, documentId).then((items) => items.filter((e) => e.documentId === documentId)), []),
        optional(recordsRequest, []),
        optional(recordsRequest.catch(() => []).then((items) =>
          getAuditLogs(user, [documentId, doc.name, items.find((r) => r.documentId === documentId)?.id ?? ""])), []),
        optional(getDocumentComments(documentId), []),
        optional(getDocumentKindWorkflow(documentId), { kind: "", fields: {}, overdue: false, duplicates: [], relatedNotes: [] }),
        optional(getDocumentReviews(documentId), null),
      ]);
      return { doc, extraction, validation: validationReport?.results ?? [], validationReport, exceptions, records, audit, comments, workflow, reviews };
    },
    `${user.id}:${documentId}`,
  );
  const [panel, setPanel] = useState<"review" | "validation" | "record" | "activity">("review");
  // "Only fields to check" (task B4b): on by default, hides fields read from the document.
  const [onlyToCheck, setOnlyToCheck] = useState(true);
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const [assistSource, setAssistSource] = useState<{ label: string; evidence: SourceEvidence[] } | undefined>();
  // `unsavedNow` mirrors `unsaved` as it changes, so save-and-submit can re-check it after its awaits (the state it closed over is stale).
  const unsavedNow = useRef<string[]>([]);
  const markDirty = useCallback((label: string, isDirty: boolean) => setUnsaved(current => {
    const next = isDirty ? (current.includes(label) ? current : [...current, label]) : current.filter(item => item !== label);
    unsavedNow.current = next;
    return next;
  }), []);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [highlightedField, setHighlightedField] = useState<string | undefined>();
  const [selectedLine, setSelectedLine] = useState<{ index: number; key: string; label: string }>();
  const validationHeadingRef = useRef<HTMLDivElement>(null);

  async function run(op: () => Promise<unknown>, message: string, propagate = false) {
    setBusy(true);
    setFailure("");
    setToast(""); // An earlier success must not stay on screen beside a later failure.
    try {
      await op();
      await refresh();
      setToast(message); // Only after the saved value has been read back.
    } catch (e) {
      setFailure((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await refresh();
      if (propagate) throw e;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!data || !["UPLOADED","QUEUED","PROCESSING"].includes(data.doc.status)) return;
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [data, refresh]);

  /* ---------- Keyboard review (task B4b) ---------- */
  const router = useRouter();
  const { queue, reload: reloadQueue } = useReviewQueue(documentId);
  // Fields that needed a check when this document opened. They stay on screen after a correction, so the list does not jump.
  // `order` is the field order at opening: the keyboard keeps it, so corrected fields do not move.
  const [openingChecks, setOpeningChecks] = useState<{ doc: string; keys: Set<string>; order: string[] }>();
  const [focusRequest, setFocusRequest] = useState<string>();
  // Save notes for the drafts save-and-submit sent, set after the saved values were read back (see FormField `savedDraft`).
  // Each note has a new id, so a field uses it once and an old note never clears a later edit.
  const [savedDrafts, setSavedDrafts] = useState<ReadonlyMap<string, SavedDraft>>(new Map());
  const noteId = useRef(0);
  const acknowledge = (sent: ReadonlyMap<string, string>) =>
    setSavedDrafts(new Map([...sent].map(([key, value]) => [key, { value, id: ++noteId.current }])));
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const pendingValues = useRef(new Map<string, string>());
  const submitButton = useRef<HTMLButtonElement>(null);
  const keyHandler = useRef<(event: globalThis.KeyboardEvent) => void>(() => undefined);
  // useResource keeps the previous document on screen while the next one loads: act only on the one asked for.
  const current = data && String(data.doc.id) === documentId ? data : undefined;
  const openingDoc = openingChecks?.doc;
  useEffect(() => {
    if (!current || openingDoc === documentId) return;
    const failed = (current.validation ?? []).filter(item => item.result === "FAIL" && item.field).map(item => item.field as string);
    const order = reviewOrder(current.extraction?.fields ?? {}, failed);
    setOpeningChecks({ doc: documentId, keys: new Set(order.filter(entry => isToCheck(entry.signal)).map(entry => entry.key)), order: order.map(entry => entry.key) });
    pendingValues.current.clear();
    const first = order.find(entry => isToCheck(entry.signal))?.key;
    if (first) setFocusRequest(first);
  }, [current, documentId, openingDoc]);
  // Move focus once the target exists and is enabled (a save disables the inputs while it runs).
  useEffect(() => {
    if (!focusRequest || busy) return;
    const element = focusRequest === SUBMIT_TARGET ? submitButton.current : inputs.current.get(focusRequest);
    if (element && !element.disabled) element.focus();
    setFocusRequest(undefined);
  }, [focusRequest, busy]);
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  keyHandler.current = () => undefined;
  if (loading) return <LoadingState variant="review" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const extraction = data.extraction ?? { documentId, fields: {}, lineItems: [] };
  const kind = sourceKind(extraction, data.doc.type);
  const sourceReadonly = ["COMPLETED","STANDARDISED"].includes(data.doc.status) || !extraction.contentRevision || kind === "UNKNOWN";
  const canStandardise = standardisationAvailable(data.doc.status, kind, data.validationReport);
  const workflow = data.workflow ?? { overdue: false, duplicates: [], relatedNotes: [] };
  const validation = data.validation ?? [];
  const summary = validationSummary(validation);
  const failedFields = validation.filter(item => item.result === "FAIL" && item.field).map(item => item.field as string);
  const allFieldCount = Object.keys(extraction.fields).length;
  // Review order and the "Only fields to check" filter (task B4b).
  const order = reviewOrder(extraction.fields, failedFields);
  const signalOf = new Map(order.map(entry => [entry.key, entry.signal]));
  const opened = openingChecks?.doc === documentId ? openingChecks : undefined;
  const keepKeys = opened?.keys;
  const visible = stableOrder(visibleEntries(order, onlyToCheck, keepKeys), opened?.order ?? []);
  const notFound = notFoundEntries(order, onlyToCheck, keepKeys);
  const visibleKeys = visible.map(entry => entry.key);
  const signalCount = (signal: ReviewSignal) => order.filter(entry => entry.signal === signal).length;
  const toCheckCount = order.filter(entry => isToCheck(entry.signal)).length;
  const fieldForCheck = (name: string) => Object.keys(extraction.fields).find(key => failedCheckNames(key, [name]));
  const focusField = (key: string) => {
    setPanel("review");
    if (!visibleKeys.includes(key)) setOnlyToCheck(false);
    setFocusRequest(key);
  };
  /** Tab / Shift+Tab move between the fields on screen; Enter saves a change, accepts a suggestion, or confirms and moves on. */
  const fieldKeys = (key: string) => (event: KeyboardEvent<HTMLInputElement>, actions: FieldKeyActions) => {
    const shortcut = reviewShortcut(event, true);
    if (shortcut === "next-field" || shortcut === "previous-field") {
      const target = stepField(visibleKeys, key, shortcut === "next-field" ? 1 : -1);
      if (target) { event.preventDefault(); setFocusRequest(target); }
      else if (shortcut === "next-field" && submitButton.current && !submitButton.current.disabled) { event.preventDefault(); setFocusRequest(SUBMIT_TARGET); }
      return;
    }
    if (shortcut !== "accept") return;
    event.preventDefault();
    const next = stepField(visibleKeys, key, 1) ?? SUBMIT_TARGET;
    const action = enterAction({ dirty: actions.dirty, value: actions.value, suggestion: actions.suggestion,
      signal: signalOf.get(key), corrected: !!extraction.fields[key]?.correctedBy });
    if (action === "move") { setFocusRequest(next); return; }
    void actions.save(action.save).then(saved => { if (saved) setFocusRequest(next); });
  };
  const renderField = ([key, field]: [string, ExtractedField]) => (
    <FormField
      key={key}
      fieldKey={key}
      field={{ ...field, label: fieldLabel(kind, key, field.label) }}
      readonly={readonly}
      currencyReview={key === "currency" ? extraction.currencyReview : undefined}
      selected={!selectedLine && highlightedField === key}
      onDirtyChange={markDirty}
      signal={signalOf.get(key)}
      savedDraft={savedDrafts.get(key)}
      locked={busy}
      inputRef={element => { if (element) inputs.current.set(key, element); else inputs.current.delete(key); }}
      onInputKey={fieldKeys(key)}
      onPendingChange={value => { if (value == null) pendingValues.current.delete(key); else pendingValues.current.set(key, value); }}
      onFocus={() => { setAssistSource(undefined); setSelectedLine(undefined); setHighlightedField(key); }}
      onSave={(value) =>
        run(
          () => updateExtractedField(user, documentId, key, value, data.extraction.contentRevision!),
          "Correction saved with a new revision.", true,
        )
      }
    />
  );
  // A receivable's counterparty is the customer, even before the company has a customer list.
  const receivable = data.doc.category?.toUpperCase() === "ACCOUNTS_RECEIVABLE";
  const newSupplier = extraction.fields.supplier?.value ?? extraction.fields.merchant?.value ?? extraction.fields.issuer?.value;
  // Revalidating resets status to extracted/exception, which would silently undo a submission or approval.
  const canRevalidate = !["IN_REVIEW", "VALIDATED"].includes(data.doc.status);
  const blockingFindings = summary.blocking;
  const validationStatus = data.validationReport?.validationStatus;
  const viewIssues = () => {
    setPanel("validation");
    window.setTimeout(() => validationHeadingRef.current?.focus(), 0);
  };
  const records = data.records ?? [];
  const comments = data.comments ?? [];
  const audit = data.audit ?? [];
  const record = records.find((r) => r.documentId === documentId);
  const readonly = sourceReadonly || !canEditDocument(user, data.doc, !!record);
  const failed = data.doc.status === "FAILED";
  const pending = ["UPLOADED", "QUEUED", "PROCESSING"].includes(data.doc.status);
  const extracting = data.doc.status === "PROCESSING";

  /* ---------- Next document and Ctrl+Enter (task B4b) ---------- */
  const queueIndex = queue.indexOf(documentId);
  const previousId = neighbourDocument(queue, documentId, -1);
  const nextId = neighbourDocument(queue, documentId, 1);
  const openDocument = (id: string) => {
    if (unsaved.length && !window.confirm(`Leave this document without saving ${unsaved.length} change${unsaved.length === 1 ? "" : "s"}?`)) return;
    router.push(`${base}/documents/${encodeURIComponent(id)}`);
  };
  const canSubmit = user.role === "ACCOUNTANT" && canRevalidate && !readonly;
  /** Saves every unsaved field, runs the checks again, submits when nothing must be fixed, then opens the next document in the lane. */
  async function saveAndSubmit() {
    if (busy || !current) return;
    if (readonly || !canRevalidate) { setFailure(data!.doc.status === "IN_REVIEW" ? "This document is already submitted for approval." : "This document cannot be changed here."); return; }
    const changes = [...pendingValues.current.entries()];
    if (unsaved.length > changes.length) { setFailure("Save the line item changes first, then press Ctrl+Enter."); return; }
    // The revision on screen: what the accountant reviewed. Only their own saves below move it on, so if anyone else
    // changed the document meanwhile, a save or the submit is refused (409) instead of submitting unseen content.
    const reviewed = extraction.contentRevision ?? data!.doc.contentRevision;
    if (!reviewed) { setFailure("Refresh the document to obtain its current revision."); return; }
    setBusy(true); setFailure(""); setToast(""); // busy locks the fields: nothing typed after this snapshot is lost.
    const sent = new Map<string, string>();
    const savedRevisions: number[] = [];
    try {
      for (const [key, value] of changes) {
        savedRevisions.push((await updateExtractedField(user, documentId, key, value, revisionToSubmit(reviewed, savedRevisions))).contentRevision);
        sent.set(key, value);
      }
      // Read the saved values back before the drafts are cleared, so the inputs never show the old values.
      if (sent.size) { await refresh(); acknowledge(sent); }
      // Always check the revision being submitted: an earlier PASS may belong to the revision before a field was confirmed.
      await revalidateDocument(user, documentId);
      const report = await getValidationReport(user, documentId);
      const results = report?.results ?? [];
      const blocking = validationSummary(results).blocking;
      if (user.role !== "ACCOUNTANT") {
        await refresh();
        setToast(sent.size ? "Changes saved and checked. An accountant submits documents for approval." : "Checked. An accountant submits documents for approval.");
        return;
      }
      if (report?.validationStatus !== "PASS" || blocking > 0) {
        await refresh();
        setFailure(`${blocking || "Some"} ${blocking === 1 ? "check needs" : "checks need"} fixing before this document can be submitted.${sent.size ? " Your changes are saved." : ""}`);
        const target = results.map(item => item.result === "FAIL" && item.field ? fieldForCheck(item.field) : undefined).find(Boolean);
        if (target) focusField(target);
        return;
      }
      // Every field is locked while this runs; still, never submit past a change that was not saved (a line item, say).
      const sentLabels = new Set([...sent.keys()].map(key => fieldLabel(kind, key, extraction.fields[key]?.label)));
      const left = unsavedOutside(unsavedNow.current, sentLabels);
      if (left.length) {
        await refresh();
        setFailure(`Not submitted: ${left.join(", ")} ${left.length === 1 ? "has" : "have"} unsaved changes. Save, then press Ctrl+Enter again.`);
        return;
      }
      await submitDocumentReview(documentId, "submitted", note || "Ready for approval", revisionToSubmit(reviewed, savedRevisions));
      const following = nextAfterSubmit(queue, await reloadQueue(), documentId);
      if (following) { router.push(`${base}/documents/${encodeURIComponent(following)}`); return; }
      await refresh();
      setToast("Submitted for approval. No other document waits in this list.");
    } catch (e) {
      setFailure((e as Error).message + (sent.size ? ` Saved before this: ${sent.size} field${sent.size === 1 ? "" : "s"}.` : ""));
      // Show what is stored now: the fields saved before the failure, or someone else's newer version after a 409.
      if (sent.size || (e instanceof ApiError && e.status === 409)) { await refresh(); acknowledge(sent); }
    } finally {
      setBusy(false);
    }
  }
  keyHandler.current = event => {
    if (!current || failed || pending || event.defaultPrevented) return;
    const shortcut = reviewShortcut(event);
    if (shortcut === "submit") { event.preventDefault(); void saveAndSubmit(); }
    if (shortcut === "next-document" || shortcut === "previous-document") {
      const target = shortcut === "next-document" ? nextId : previousId;
      if (target) { event.preventDefault(); openDocument(target); }
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="DOCUMENT REVIEW"
        title={data.doc.name}
        description={`${data.doc.id} · Uploaded ${formatDate(data.doc.createdAt)}`}
        actions={
          <>
            <StatusBadge status={data.doc.status} />
            {queue.length > 1 && <span className="review-queue-nav" role="group" aria-label="Documents in this list">
              <button type="button" className="btn small" disabled={!previousId} aria-keyshortcuts="Alt+ArrowLeft" title="Previous document (Alt+Left)" onClick={() => previousId && openDocument(previousId)}>Previous</button>
              <span className="review-queue-position">{queueIndex >= 0 ? `${queueIndex + 1} of ${queue.length}` : `${queue.length} to review`}</span>
              <button type="button" className="btn small" disabled={!nextId} aria-keyshortcuts="Alt+ArrowRight" title="Next document (Alt+Right)" onClick={() => nextId && openDocument(nextId)}>Next</button>
            </span>}
            <Link href={`${base}/documents`} className="btn">
              All documents
            </Link>
          </>
        }
      />

      {failure && <ErrorState message={failure} />}

      {!failed && !pending && (
        <DocumentDetailPreview doc={data.doc} extraction={extraction} />
      )}

      {failed || pending ? (
        <section className={`document-processing-card ${failed ? "is-failed" : "is-pending"}`}>
          <div className="document-processing-head">
            <div><span className="document-processing-kicker">DOCUMENT</span><h2>{failed ? "We could not read this document" : extracting ? "Reading your document" : "Waiting to be read"}</h2><p>{failed ? "Check the file is a clear invoice, bill or receipt, then try again." : extracting ? "The details are being read and prepared for your review." : "Your document is saved. Reading starts shortly."}</p></div><StatusBadge status={data.doc.status} />
          </div>
          <div className="document-processing-steps"><div className="is-complete"><CheckCircle2 size={18} /><span>Uploaded</span></div><div className={extracting ? "is-current" : ""}><RefreshCw size={18} /><span>{failed ? "Could not read" : extracting ? "Reading details" : "Waiting to be read"}</span></div><div><FileCheck2 size={18} /><span>Ready for review</span></div></div>
          <div className="document-processing-footer"><span>{failed ? "Try again, or upload a clearer copy." : "You can leave this page and come back later."}</span><button className="btn primary" disabled={busy || pending} onClick={() => run(() => retryDocumentProcessing(user, documentId), "The document will be read again.")}><RefreshCw size={16} /> {failed ? "Read again" : extracting ? "Reading…" : "Waiting to be read"}</button></div>
        </section>
      ) : (
        <>
          <div className="review-toolbar">
            <button className={panel === "review" ? "active" : ""} onClick={() => setPanel("review")}>Review</button>
            <button className={panel === "validation" ? "active" : ""} onClick={() => setPanel("validation")}>Checks</button>
            <button className={panel === "record" ? "active" : ""} onClick={() => setPanel("record")}>Saved record</button>
            <button className={panel === "activity" ? "active" : ""} onClick={() => setPanel("activity")}>Activity</button>
          </div>

          {panel === "review" && (
            <div className="shoebox-split">
              <div className="shoebox-doc">
                <ReviewSource documentId={documentId} name={data.doc.name} extraction={extraction} onSelectField={focusField}
                  fields={visibleKeys.map(key => ({ key, label: fieldLabel(kind, key, extraction.fields[key]?.label), evidence: extraction.fields[key]?.evidence ?? [] }))}
                  selected={assistSource ? assistSource : selectedLine ? { label: selectedLine.label, evidence: extraction.lineItems[selectedLine.index]?.evidence?.[selectedLine.key] ?? [] }
                    : highlightedField ? { key: highlightedField, label: fieldLabel(kind, highlightedField, extraction.fields[highlightedField]?.label), evidence: extraction.fields[highlightedField]?.evidence ?? [] } : undefined} />
              </div>
              <div className="shoebox-form">
                <div className="shoebox-form-head">
                  <div className="review-form-title-row"><span>{kind === "UNKNOWN" ? "Unknown / Needs Review" : kind[0] + kind.slice(1).toLowerCase() + " fields"}</span><small>{allFieldCount} fields · revision {extraction.contentRevision ?? "—"}</small></div>
                  <div className="review-filter-bar" role="toolbar" aria-label="Field filters">
                    <label className="review-only-toggle"><input type="checkbox" role="switch" checked={onlyToCheck} onChange={event => setOnlyToCheck(event.target.checked)} />
                      Only fields to check <b>{toCheckCount}</b></label>
                    <small className="review-key-hint">Tab next field · Enter accept · Ctrl+Enter save and submit · Alt+→ next document</small>
                  </div>
                </div>
                {kind === "UNKNOWN" && (Object.keys(extraction.fields).length > 0 || extraction.lineItems.length > 0) &&
                  <p role="status">Provisional source reads are shown below. Document type and field roles remain unresolved; these candidates are not approved accounting values.</p>}
                {(workflow.overdue || workflow.duplicates.length > 0 || workflow.relatedNotes.length > 0) && (
                  <div className="panel-body">
                    {workflow.overdue && <Badge>Overdue</Badge>}
                    {workflow.duplicates.length > 0 && <p>Possible duplicate document: {workflow.duplicates.map((d) => d.code).join(", ")}</p>}
                    {workflow.relatedNotes.length > 0 && <p>Related notes: {workflow.relatedNotes.map((d) => d.code).join(", ")}</p>}
                  </div>
                )}
                <ProcessingPanel trace={extraction.raw?.processing_trace as ProcessingTrace | undefined} type={extraction.classification?.value} status={extraction.classification?.status}
                  labelFor={(key) => fieldLabel(kind, key, extraction.fields[key]?.label)} />
                <AiAssistPanel user={user} documentId={documentId} contentRevision={extraction.contentRevision} readonly={readonly}
                  labelFor={(key) => fieldLabel(kind, key, extraction.fields[key]?.label)}
                  onShowSource={(label, evidence) => { setSelectedLine(undefined); setAssistSource({ label, evidence }); }}
                  onSaved={refresh} />
                {Object.keys(extraction.fields).length === 0 && <p>No accounting fields available. Review the original source.</p>}
                {Object.keys(extraction.fields).length > 0 && <div role="status" className="review-focus-summary">
                  <strong className="review-summary-title">Review status</strong>
                  <ul className="review-summary-list">
                    <li className="is-warning"><b>{signalCount("check")}</b><span>{signalCount("check") === 1 ? "field says" : "fields say"} &quot;Please check&quot;</span></li>
                    <li className="is-info"><b>{signalCount("verified")}</b><span>read from the document or corrected by a person</span></li>
                    <li className="is-danger"><b>{signalCount("missing")}</b><span>not found on the document</span></li>
                    <li className="is-neutral"><b>{signalCount("suggestion")}</b><span>{signalCount("suggestion") === 1 ? "field has" : "fields have"} a suggested value; nothing is applied until you accept it</span></li>
                    {data.validationReport && <li className="is-validation"><b>Validation</b><span>{summary.passed} passed · {summary.failed} failed · {summary.notChecked} not checked</span></li>}
                  </ul>
                </div>}
                {visible.length > 0 && <div className="shoebox-fields review-field-list" aria-label={onlyToCheck ? "Fields to check" : "All fields"}>
                  {visible.map(entry => renderField([entry.key, extraction.fields[entry.key]]))}</div>}
                {allFieldCount > 0 && visible.length === 0 && <p className="review-all-read" role="status">Nothing to check: every field was read from the document. Compare the totals with the original, then press Ctrl+Enter to submit, or turn off &quot;Only fields to check&quot; to see them all.</p>}
                {notFound.length > 0 && <details className="review-field-group review-not-found"><summary><span>Not found on the document</span><b>{notFound.length}</b></summary>
                  <p className="review-section-help">No check needs these. Fill one only if it is printed on the original.</p>
                  <div className="shoebox-fields">{notFound.map(entry => renderField([entry.key, extraction.fields[entry.key]]))}</div></details>}
                {!!extraction.warnings?.length && <div aria-label="Reading notes"><strong>Please check</strong>
                  <p>Notes about how the document was read. They are separate from the accounting checks.</p>
                  {extraction.warnings.map((warning, index) => <p role="status" key={warning.code + index}>{warning.message}</p>)}
                </div>}
                {extraction.lineItems.length > 0 && (
                  <div className="shoebox-lines">
                    <strong>{kind === "BILL" ? "Charges / line items" : kind === "RECEIPT" ? "Receipt items" : "Line items"}</strong>
                    <DataTable
                      rows={extraction.lineItems}
                      rowKey={(r) => r.id ?? r.description ?? "line"}
                      columns={[
                        { label: "Description", render: (r) => r.description ?? "Not provided" },
                        { label: "Qty", render: (r) => r.quantity ?? "Not provided" },
                        { label: "Unit", render: (r) => money(r.unitPrice, extraction.fields.currency?.value) },
                        { label: "Amount", render: (r) => money(r.amount, extraction.fields.currency?.value) },
                      ]}
                    />
                    <details open={kind === "UNKNOWN" || undefined}><summary>{kind === "UNKNOWN" ? "Provisional line candidates" : "Correct line items"}</summary>
                      <p>{kind === "UNKNOWN" ? "Source candidates are retained for inspection. No line value has been selected while the document type is unresolved." : "Save only values supported by the original document. Missing cells stay empty until confirmed."}</p>
                      {extraction.lineItems.map((line, index) => <div className="shoebox-fields" key={line.id ?? index}>
                        {([['description', 'description', 'Description'], ['quantity', 'quantity', 'Quantity'], ['unit_price', 'unitPrice', 'Unit price'], ['amount', 'amount', 'Amount']] as const).map(([key, property, label]) => {
                          const originalRows = extraction.raw?.line_items as Array<Record<string, {value?: string | null}>> | undefined;
                          const original = originalRows?.[index]?.[key]?.value ?? null;
                          const correction = extraction.lineCorrections?.find(item => item.line_item_id === line.id && item.field_key === key);
                          const guidance = line.guidance?.[key];
                          return <FormField key={key} readonly={readonly || !line.id} locked={busy}
                            selected={selectedLine?.index === index && selectedLine.key === key}
                            onFocus={() => { setHighlightedField(undefined); setSelectedLine({ index, key, label: `Line ${index + 1} ${label}` }); }}
                            field={{label: `Line ${index + 1} ${label}`, value: line[property] == null ? null : String(line[property]),
                              original, rawValue: line.evidence?.[key]?.map(e => e.text).filter(Boolean).join(" | ") || null,
                              confidence: null, state: line.fieldStates?.[key], evidence: line.evidence?.[key],
                              candidates: line.candidates?.[key],
                              method: line.methods?.[key] ?? "Method not provided",
                              correctedBy: correction?.corrected_by, correctedAt: correction?.corrected_at,
                              confirmationRequired: !correction, warnings: guidance?.warnings?.map(w => ({...w, reviewed: !!correction}))}}
                            onDirtyChange={markDirty}
                            onSave={value => run(() => updateExtractedLineItem(user, documentId, line.id!, key, value, extraction.contentRevision!), "Line correction saved with a new revision.", true)} />;
                        })}
                      </div>)}
                      {!!extraction.lineCorrections?.length && <details><summary>Line correction history</summary>
                        {extraction.lineCorrections.map((item, index) => <p key={index}>{item.field_key}: {item.old_value ?? "Not provided"} → {item.new_value ?? "Not provided"} | {item.corrected_by} | {item.corrected_at}</p>)}
                      </details>}
                    </details>
                    <details><summary>Line item source evidence</summary>{extraction.lineItems.map((line, i) => <div key={line.id ?? i}><strong>Line {i + 1}</strong>{Object.entries(line.evidence ?? {}).map(([key, evidence]) => <div key={key}><p>{key}</p><SourceEvidenceList evidence={evidence} documentId={documentId} /></div>)}</div>)}</details>
                  </div>
                )}
                {!readonly && canRevalidate && <MissingLineForm revision={data.doc.contentRevision ?? 1} disabled={busy || unsaved.length !== 0}
                  onSave={input => run(() => addExtractedLineItem(documentId, input), "Printed item saved and revalidated.", true)} />}
                {(
                  <details open className="shoebox-actions review-action-drawer">
                    <summary><span>Review actions</span><small>{unsaved.length ? `${unsaved.length} unsaved change${unsaved.length === 1 ? "" : "s"}` : "Save or submit this review"}</small></summary>
                    <Field label="Review note · Optional">
                        <textarea disabled={readonly}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add context for the approver or explain a correction…"
                      />
                    </Field>
                    <div className="review-action-bar">
                      <div className={`review-save-state ${unsaved.length ? "is-dirty" : "is-saved"}`} role="status">
                        <span aria-hidden="true" />{unsaved.length ? `Unsaved changes: ${unsaved.length}` : "All changes saved"}
                      </div>
                      {unsaved.length > 0 && <p className="review-unsaved-hint">Revalidation uses saved values only. Save changes before revalidating.</p>}
                      <div className="review-action-buttons">
                        <button className="btn" disabled={readonly || busy} onClick={() => run(() => saveDocumentDraft(documentId), "Draft saved.")}>Save draft</button>
                        {canRevalidate && <button className="btn primary" disabled={readonly || busy || unsaved.length > 0} onClick={() => run(() => revalidateDocument(user, documentId), "Review saved and revalidated.")}><CheckCircle2 size={16} /> Save & revalidate</button>}
                        {user.role === "ACCOUNTANT" && canRevalidate && <button className={`btn ${validationStatus === "PASS" && blockingFindings === 0 ? "primary" : "secondary"}`} disabled={readonly || busy || validationStatus !== "PASS" || blockingFindings > 0 || unsaved.length > 0} onClick={() => run(() => submitDocumentReview(documentId, "submitted", note || "Ready for approval", data.doc.contentRevision ?? 1), "Submitted for approval.")}>Submit for approval</button>}
                        {canSubmit && <button ref={submitButton} type="button" className="btn primary review-save-submit" disabled={busy} aria-keyshortcuts="Control+Enter" onClick={() => void saveAndSubmit()}>
                          Save, check and submit <kbd>Ctrl+Enter</kbd></button>}
                      </div>
                    </div>
                    {user.role === "ACCOUNTANT" && canRevalidate && blockingFindings > 0 && <div className="review-blocking-notice" role="status"><strong>{blockingFindings} {blockingFindings === 1 ? "issue blocks" : "issues block"} submission</strong><span>Review the validation findings to continue.</span><button type="button" className="text-link" onClick={viewIssues}>View issues</button></div>}
                    {user.role === "LOCAL_ADMIN" && canRevalidate && <p role="status">An Accountant must submit this document for approval. A different Local Admin can then approve it.</p>}
                    {data.doc.status === "IN_REVIEW" && <p role="status">Submitted for independent Local Admin approval. Corrections require a new submission.</p>}
                    {canDecideReview(user, data.doc, data.reviews) && data.validationReport?.validationStatus === "PASS" && data.validationReport.coverageComplete !== false && (
                      <button className="btn primary" disabled={busy} onClick={() => run(() => decideDocumentReview(documentId, "approved", note || "Approved", data.doc.contentRevision ?? 1), "Document approved.")}>
                        Approve document
                      </button>
                    )}
                  </details>
                )}
              </div>
            </div>
          )}

          {panel === "validation" && (
            <Panel title="Checks" subtitle="What to fix before this document can be approved.">
              {data.validationReport && <div className="validation-overview">
                <div className={`validation-score ${summary.failed ? "has-fail" : ""}`}><StatusBadge status={data.validationReport.validationStatus} /><strong>{summary.blocking}</strong><span>must be fixed</span></div>
                <div className="validation-overview-copy"><strong>A person approves every document</strong><p>Compare each value with the document. Passing checks does not approve anything by itself.</p></div>
                <div className="validation-stat is-pass"><strong>{summary.passed}</strong><span>Passed</span></div>
                <div className="validation-stat is-fail"><strong>{summary.failed}</strong><span>Failed</span></div>
                <div className="validation-stat is-pending"><strong>{summary.notChecked}</strong><span>Not checked</span></div>
                <div className="validation-stat"><strong>{summary.notApplicable}</strong><span>Not applicable</span></div>
              </div>}
              {data.validationReport?.transactionAnomaly && <TransactionAnomalyVisual result={data.validationReport.transactionAnomaly} />}
              <div className="validation-results-head" ref={validationHeadingRef} tabIndex={-1}><div><strong>All checks</strong><span>{validation.length} checks on this version</span></div><StatusBadge status={data.doc.status} /></div>
              <DataTable
                rows={[...validation].sort((a, b) => validationRank(a) - validationRank(b))}
                rowKey={(v) => JSON.stringify([v.rule, v.field ?? null, validation.indexOf(v)])}
                columns={[
                  { label: "Check", render: (v) => <div className="validation-rule"><span className={`validation-icon ${v.result.toLowerCase()}`}>{v.result === "PASS" ? <CheckCircle2 size={16} /> : v.result === "WARNING" ? <AlertTriangle size={16} /> : <CircleX size={16} />}</span><strong>{ruleSentence(v.rule, v.field)}</strong></div> },
                  { label: "Result", render: (v) => <><StatusBadge status={validationState(v)} />{v.preventsApproval && <small> Must be fixed before approval</small>}</> },
                  { label: "Field", render: (v) => v.field ? fieldLabel(kind, v.field, extraction.fields[v.field]?.label) : "Whole document" },
                  { label: "Priority", render: (v) => v.severity ? v.severity[0].toUpperCase() + v.severity.slice(1).toLowerCase() : "Normal" },
                  { label: "What to do", render: (v) => <div><span className={v.result === "FAIL" ? "validation-message fail-text" : "validation-message"}>{v.message}</span>
                    <details className="validation-details"><summary>Details</summary><small>Rule {ruleCode(v.rule)}{v.causeLabel ? ` · ${v.causeLabel}` : ""}</small></details>
                    {v.rule === "EX-008" && (v.field === "customer" || receivable) && !readonly && user.role === "LOCAL_ADMIN" && extraction.fields.customer?.value && <p><button type="button" className="btn small" disabled={busy} onClick={() => run(async () => { await addedOrExisting(createCustomer(extraction.fields.customer!.value!)); await revalidateDocument(user, documentId); }, "Customer added and document revalidated.")}>Add {extraction.fields.customer.value} as a customer</button></p>}
                    {reviewableFinding(v) && !readonly && canRevalidate && extraction.contentRevision && <ValidationReviewForm rule={v.rule} busy={busy} onSubmit={note => run(() => acceptValidationReview(user, documentId, v.rule, note, extraction.contentRevision!), "Review recorded and document revalidated.")} />}
                    {v.rule === "EX-008" && v.field !== "customer" && !receivable && !readonly && user.role === "LOCAL_ADMIN" && newSupplier && <p><button type="button" className="btn small" disabled={busy} onClick={() => run(async () => { await addedOrExisting(createSupplier(newSupplier)); await revalidateDocument(user, documentId); }, "Supplier added and document revalidated.")}>Add {newSupplier} as a supplier</button></p>}
                    {v.rule === "EX-008" && !readonly && user.role !== "LOCAL_ADMIN" && <p className="validation-hint">Only a local admin can add this name to the {v.field === "customer" || receivable ? "customer" : "supplier"} list. Ask them to add it from this document; it is then revalidated. Approval also needs a local admin.</p>}
                    {v.duplicate_of && <p><Link href={`${base}/documents/${encodeURIComponent(v.duplicate_of)}`}>Related document: {v.duplicate_of}</Link></p>}
                    {v.vendor_candidate && <p>Did you mean: {v.vendor_candidate.vendor_name ?? "Not provided"}?</p>}
                    {v.vendor_candidate && <details className="validation-details"><summary>Details</summary><small>Name similarity {v.vendor_candidate.similarity ?? "not provided"} (name matching, not extraction confidence) · method {v.vendor_candidate.score_method ?? "not provided"}</small></details>}
                  </div> },
                  // Task B4b: jump from a failed check to the field it concerns, on the Review tab with its source highlighted.
                  { label: "Fix", render: (v) => { const key = v.result === "FAIL" && v.field ? fieldForCheck(v.field) : undefined;
                    return key ? <button type="button" className="btn small" onClick={() => focusField(key)} aria-label={`Fix ${fieldLabel(kind, key, extraction.fields[key]?.label)}`}>Fix</button> : null; } },
                ]}
              />
              <div className="panel-body actions validation-actions">
                {!readonly && canRevalidate && (
                  <button
                    disabled={busy || unsaved.length > 0}
                    className="btn"
                    onClick={() => run(() => revalidateDocument(user, documentId), "Checks run again.")}
                  >
                    <RefreshCw size={15} /> Run checks again
                  </button>
                )}
                <button
                  disabled={busy || !canStandardise}
                  className="btn primary"
                  onClick={() => run(async () => { await standardiseDocument(user, documentId); setPanel("record"); }, "Saved to records.")}
                >
                  <FileCheck2 size={16} /> Save to records
                </button>
              </div>
            </Panel>
          )}

          {panel === "record" && (
            record ? <RecordDetail record={record} /> : <Panel title="Saved record" subtitle="The record is saved only after the checks pass and you confirm the document.">
              <div className="panel-body record-empty-state">
                <FileCheck2 size={28} aria-hidden="true" />
                <strong>Not saved to records yet</strong>
                <p>Correct any values that are wrong, then run the checks again. When nothing must be fixed, save it to records here.</p>
                <button type="button" className="btn primary" disabled={busy || !canStandardise} onClick={() => run(async () => { await standardiseDocument(user, documentId); setPanel("record"); }, "Saved to records.")}>
                  <FileCheck2 size={16} /> Save to records
                </button>
                {!canStandardise && <small>Fix the problems on the Checks tab first.</small>}
              </div>
            </Panel>
          )}

          {panel === "activity" && (
            <>
            <Panel title="Document activity">
              <div className="panel-body">
                <Field label="Correction comment">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add context for the next reviewer…"
                  />
                </Field>
                <button
                  className="btn primary"
                  disabled={busy || !comment.trim()}
                  onClick={() =>
                    run(
                      async () => {
                        await addDocumentComment(documentId, comment.trim());
                        setComment("");
                      },
                      "Comment added.",
                    )
                  }
                >
                  Add comment
                </button>
              </div>
              {comments.length > 0 && (
                <DataTable
                  rows={comments as DocumentComment[]}
                  rowKey={(c) => c.id}
                  columns={[
                    { label: "Comment", render: (c) => c.comment },
                    { label: "Author", render: (c) => c.author },
                    { label: "Created", render: (c) => new Date(c.createdAt).toLocaleString("en-MY") },
                  ]}
                />
              )}
              <DataTable
                rows={audit.filter(
                  (a) => a.resource === data.doc.name || a.resource === documentId || a.resource === record?.id,
                )}
                rowKey={(a) => a.id}
                columns={[
                  { label: "Timestamp", render: (a) => new Date(a.timestamp).toLocaleString("en-MY") },
                  { label: "User", render: (a) => a.user },
                  { label: "Action", render: (a) => a.action.replaceAll("_", " ") },
                  { label: "Details", render: (a) => a.details },
                ]}
              />
            </Panel>
            </>
          )}
        </>
      )}
      <Toast message={toast} />
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import {
  DataTable, EmptyState, Field, LoadingState, Modal, PageHeader, Panel, StatusBadge, formatDate, money,
} from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  ALLOCATES_TO, AMOUNT_ONLY_TYPES, DOCUMENT_LABELS, NOTE_TARGETS, POSTING_TYPES, PRINTED_TYPES, createDocument, deleteDocument,
  documentFileUrl, documentPostingPreview, markDelivered, previewUnsavedPdf,
  documentHistory, documentPreviewUrl, duplicateDocument, getDocument, listCatalog, listContacts, listDocuments, listProducts,
  transferDocument, transitionDocument, updateDocument,
  type Contact, type DocumentAllocation, type DocumentFile, type DocumentHistory, type DocumentInput, type DocumentLine,
  type DocumentType, type ErpDocument, type PostingPreview, type Product, type TypedDocument,
} from "@/lib/api/erp.service";
import { download, fetchBlob, openInNewTab } from "@/lib/api/client";
import { getLedgerAccounts } from "@/lib/api/ledger.service";
import { statusLabel } from "@/lib/glossary";
import type { User } from "@/types";
import {
  acceptsScannedAllocations, allocationCandidates, amountInCents, decimalAmount, documentActions, documentGroup, documentHref,
  documentStatusLabel, fileReasonLabel, formatFileSize, hasOutstanding, latestFile, noteTargetCandidates,
  QUOTATION_VALID_DAYS, deliveryRecord, draftExplainer, issueChecklist, issueLabel, lastPrices, liveDuplicates,
  type DocumentAction, type DocumentGroup, type LastPrice,
} from "./document-logic";
import {
  addDays, changeDocumentDate, chooseContactTerms, chooseTerms, copiedLines, editDueDate, lastDocumentWithLines,
  type TermsState,
} from "./line-defaults";
import {
  accountOptions, bankOptions, blankLine, contactCurrency, contactOptions, contactSummary, descriptionOptions, formatAmount,
  isBlankLine, lineAmount, lineFromSuggestion, lineSums, productLine, productOptions, recentLines, taxOptions, termOptions,
  type ComboOption, type Suggestion,
} from "./assisted-entry";
import { Combobox } from "./combobox";
import { QuickAddContact, QuickAddProduct } from "./quick-add";
import { formActions, transfersFrom } from "./form-actions";
import { ShareLinksPanel } from "./share-links";
import { TracePanel } from "@/features/common/trace/trace-panel";

type FormProps = { base: string; group: DocumentGroup; type: DocumentType; role: User["role"] };
type DraftLine = { key: number; value: DocumentLine };
type Draft = {
  number: string; contactId: string; documentDate: string; dueDate: string; currency: string; referenceNo: string;
  description: string; bankAccountId: string; toBankAccountId: string; amount: string; relatedDocumentId: string;
  lines: DraftLine[]; allocations: DocumentAllocation[];
  /** Payment terms text (saved with the document and printed), the days behind it, and whether the due date follows them. */
  paymentTerms: string; termDays: number | null; dueDateAuto: boolean;
  /** Printed with the contact block (fields.attention, fields.deliveryAddress) and as the terms (fields.terms). */
  attention: string; deliveryAddress: string; terms: string;
};

// A quotation needs its customer to be sent (the API refuses "Send" without one).
const REQUIRES_CONTACT = new Set<DocumentType>([
  "quotation", "invoice", "credit-note", "debit-note", "payment", "refund", "bill", "purchase-credit-note", "purchase-debit-note",
  "purchase-payment", "purchase-refund",
]);
const USES_BANK = new Set<DocumentType>([
  "payment", "refund", "purchase-payment", "purchase-refund", "money-in", "money-out", "bank-transfer",
]);

function today() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
}

const text = (value: unknown) => typeof value === "string" ? value : "";

/** A new document with lines starts with one empty line to type into (dropped on save if left empty). A new quotation
 * is valid for QUOTATION_VALID_DAYS from its date until the user changes it. */
function makeDraft(document: TypedDocument | null, startLine = false, type?: DocumentType): Draft {
  const toBankAccountId = document?.fields.toBankAccountId;
  const lines = document?.lines.map((value, key) => ({ key, value })) ?? (startLine ? [{ key: 0, value: blankLine() }] : []);
  return {
    number: document?.number ?? "",
    contactId: document?.contactId ?? "",
    documentDate: document?.documentDate ?? today(),
    dueDate: document?.dueDate ?? (type === "quotation" ? addDays(today(), QUOTATION_VALID_DAYS) : ""),
    currency: document?.currency ?? "MYR",
    referenceNo: document?.referenceNo ?? "",
    description: document?.description ?? "",
    bankAccountId: document?.bankAccountId ?? "",
    toBankAccountId: typeof toBankAccountId === "string" ? toBankAccountId : "",
    amount: document?.amount ?? "",
    relatedDocumentId: document?.relatedDocumentId ?? "",
    lines,
    allocations: document?.allocations ?? [],
    paymentTerms: typeof document?.fields.paymentTerms === "string" ? document.fields.paymentTerms : "",
    termDays: null,
    dueDateAuto: !document?.dueDate,
    attention: text(document?.fields.attention),
    deliveryAddress: text(document?.fields.deliveryAddress),
    terms: text(document?.fields.terms),
  };
}

const termsOf = ({ documentDate, dueDate, paymentTerms, termDays, dueDateAuto }: Draft): TermsState =>
  ({ documentDate, dueDate, paymentTerms, termDays, auto: dueDateAuto });
const withTerms = (draft: Draft, { documentDate, dueDate, paymentTerms, termDays, auto }: TermsState): Draft =>
  ({ ...draft, documentDate, dueDate, paymentTerms, termDays, dueDateAuto: auto });

function documentInput(type: DocumentType, draft: Draft, document: TypedDocument | null): DocumentInput {
  const input: DocumentInput = {
    contactId: draft.contactId || null,
    documentDate: draft.documentDate,
    dueDate: draft.dueDate || null,
    currency: draft.currency,
    referenceNo: draft.referenceNo || null,
    description: draft.description || null,
    bankAccountId: draft.bankAccountId || null,
  };
  if (!document) input.number = draft.number.trim() || null;
  if (AMOUNT_ONLY_TYPES.has(type)) input.amount = draft.amount || null;
  else {
    input.lines = draft.lines.filter(({ value }) => !isBlankLine(value))
      .map(({ value }) => ({ ...value, discount: value.discount || "0", tax: value.tax || "0" }));
    // Without lines the API falls back to the stored amount unless the patch clears it.
    if (!input.lines.length) input.amount = "0";
  }
  if (NOTE_TARGETS[type]) input.relatedDocumentId = draft.relatedDocumentId || null;
  if (ALLOCATES_TO[type]) input.allocations =draft.allocations.filter(({ amount }) => amount && Number(amount) !== 0);
  // Only the fields this form edits change; the other saved fields are kept as they are.
  const fields: Record<string, unknown> = { ...document?.fields };
  let edited = false;
  const put = (key: string, value: string) => {
    edited = true;
    if (value.trim()) fields[key] = value.trim();
    else delete fields[key];
  };
  if (type === "bank-transfer") put("toBankAccountId", draft.toBankAccountId);
  if (hasOutstanding(type)) put("paymentTerms", draft.paymentTerms);  // printed as "Terms"
  if (PRINTED_TYPES.has(type)) {
    put("attention", draft.attention);
    put("deliveryAddress", draft.deliveryAddress);
    put("terms", draft.terms);
  }
  if (edited) input.fields = fields;
  return input;
}

function changedInput(input: DocumentInput, saved: DocumentInput): DocumentInput {
  const keys = Object.keys(input) as (keyof DocumentInput)[];
  return Object.fromEntries(keys.filter((key) => JSON.stringify(input[key]) !== JSON.stringify(saved[key]))
    .map((key) => [key, input[key]]));
}

function RequestError({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice danger error-state" role="alert">
    {message}
    {retry && <div className="mt-2"><button type="button" className="btn small" onClick={retry}>Try again</button></div>}
  </div>;
}

export function DocumentForm({ id, ...props }: FormProps & { id: string }) {
  if (id === "new") return <DocumentEditor {...props} initialDocument={null} />;
  return <ExistingDocument {...props} id={id} />;
}

function ExistingDocument({ id, ...props }: FormProps & { id: string }) {
  const { data, error, loading, refresh } = useResource(() => getDocument(props.type, id), `${props.type}:${id}`);
  if (loading) return <LoadingState variant="form" />;
  if (!data) return <RequestError message={error || "Unable to load this document."} retry={refresh} />;
  return <DocumentEditor {...props} initialDocument={data} />;
}

function DocumentEditor({ base, group, type, role, initialDocument }: FormProps & { initialDocument: TypedDocument | null }) {
  const router = useRouter();
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [document, setDocument] = useState(initialDocument);
  const [draft, setDraft] = useState(() => makeDraft(initialDocument, !AMOUNT_ONLY_TYPES.has(type), type));
  const nextLine = useRef(draft.lines.length);
  /** The line whose first field takes the focus when it appears (a line added from the keyboard). */
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ kind: "contact"; name: string } | { kind: "product"; name: string; lineKey: number } | null>(null);
  // Records added from the form show at once, before the lists reload.
  const [addedContacts, setAddedContacts] = useState<Contact[]>([]);
  const [addedProducts, setAddedProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyNote, setCopyNote] = useState("");
  const [confirmation, setConfirmation] = useState<"delete" | "void" | null>(null);
  const [voidReason, setVoidReason] = useState("");
  // The A4 preview beside the form (below it on narrow screens), the Send / Issue confirm step, and Mark delivered.
  const [showPreview, setShowPreview] = useState(true);
  const [sheet, setSheet] = useState<{ action: DocumentAction; posting: PostingPreview | null; postingError: string } | null>(null);
  const [delivering, setDelivering] = useState(false);
  // Duplicate matches the user has already seen; issuing stops once when a save reveals a new one (Codex review P2).
  const seenDuplicates = useRef(new Set((initialDocument?.possibleDuplicates ?? []).map(({ id }) => id)));

  const label = DOCUMENT_LABELS[type];
  const status = document?.status ?? "draft";
  // A quotation's invoice (not void): "Convert to invoice" again would be refused, so it is replaced by a link to it.
  const quotationLinks = useResource(async () => {
    if (!document || type !== "quotation" || (status !== "sent" && status !== "accepted")) return [];
    const links = transfersFrom(document.id, await documentHistory(type, document.id));
    const targets = await Promise.all(links.map((link) => getDocument(link.targetType, link.targetId).catch(() => null)));
    return links.filter((_, index) => targets[index] && targets[index].status !== "void");
  }, `converted:${document?.id ?? "new"}:${document?.updatedAt ?? ""}`);
  const converted = quotationLinks.data ?? [];
  const actions = formActions(documentActions(status, type, role), {
    outstanding: hasOutstanding(type) ? document?.outstanding : undefined,
    convertedTo: converted.map(({ targetType }) => targetType),
  }).filter((action) => document || action.kind === "save");
  const editable = actions.some((action) => action.kind === "save");
  const amountOnly = AMOUNT_ONLY_TYPES.has(type);
  const transfer = type === "bank-transfer";
  const contactKind = group === "sales" ? "customer" : group === "purchases" ? "supplier" : undefined;
  const contactLabel = contactKind === "customer" ? "Customer" : "Supplier";
  const listHref = documentHref(base, group, type);
  const locked = busy || navigating;
  const sums = lineSums(type, draft.lines.map(({ value }) => value), draft.amount);
  // A saved document that can no longer be edited shows the stored totals; gross and discount come from its lines.
  const totals = !editable && document
    ? { ...sums, subtotal: document.subtotal, tax: document.taxAmount, total: document.amount }
    : sums;
  const contacts = useResource(async () => contactKind ? listContacts({ kind: contactKind }) : [], `contacts:${type}`);
  const products = useResource(async () => amountOnly ? [] : listProducts(), `products:${type}`);
  const accounts = useResource(async () => amountOnly ? [] : getLedgerAccounts(), `accounts:${type}`);
  const banks = useResource(async () => USES_BANK.has(type) ? listCatalog("bank-account") : [], `banks:${type}`);
  const taxCodes = useResource(async () => amountOnly ? [] : listCatalog("tax-code"), `tax-codes:${type}`);
  const paymentTerms = useResource(async () => hasOutstanding(type) ? listCatalog("payment-term") : [], `payment-terms:${type}`);
  const lookups = [
    { label: "Contacts", resource: contacts }, { label: "Products", resource: products },
    { label: "Ledger accounts", resource: accounts }, { label: "Bank accounts", resource: banks },
    { label: "Tax codes", resource: taxCodes }, { label: "Payment terms", resource: paymentTerms },
  ];
  const sales = group === "sales";
  const activeTerms = (paymentTerms.data ?? []).filter((term) => term.isActive);
  const contactList = useMemo(() => merged(contacts.data, addedContacts), [contacts.data, addedContacts]);
  const productList = useMemo(() => merged(products.data, addedProducts), [products.data, addedProducts]);
  const selectedContact = contactList.find(({ id }) => id === draft.contactId);
  const contactName = selectedContact?.legalName ?? (document?.contactId === draft.contactId ? document?.contactName : null);
  const summary = contactSummary(selectedContact);
  // The contact's earlier lines (this type, and invoices or bills) feed the description typeahead.
  const contactHistory = useResource(async () => {
    if (amountOnly || !contactKind || !draft.contactId) return [];
    const types = [...new Set<DocumentType>([type, sales ? "invoice" : "bill"])];
    const pages = await Promise.all(types.map((each) => listDocuments(each, { contactId: draft.contactId, source: "typed", pageSize: 20 })));
    return pages.flatMap(({ items }) => items);
  }, `recent:${type}:${draft.contactId}`);
  const recentRows = useMemo(() => recentLines(contactHistory.data ?? [], document?.id), [contactHistory.data, document?.id]);
  // What this customer was last charged per product (sales only), and the same-type documents for the duplicate rule.
  const prices = useMemo(() => sales ? lastPrices(contactHistory.data ?? [], document?.id) : new Map<string, LastPrice>(),
    [contactHistory.data, document?.id, sales]);
  const siblings = useMemo(() => (contactHistory.data ?? []).filter((row) => row.type === type), [contactHistory.data, type]);
  const options = useMemo(() => ({
    contacts: contactOptions(contactList),
    products: productOptions(productList, sales, draft.currency || "MYR"),
    descriptions: descriptionOptions(productList, recentRows, sales, draft.currency || "MYR"),
    accounts: accountOptions(accounts.data ?? []),
    taxes: taxOptions(taxCodes.data ?? []),
    banks: bankOptions(banks.data ?? []),
    terms: termOptions(paymentTerms.data ?? []),
  }), [contactList, productList, recentRows, sales, draft.currency, accounts.data, taxCodes.data, banks.data, paymentTerms.data]);
  const printed = PRINTED_TYPES.has(type);
  const admin = role === "LOCAL_ADMIN";
  const delivery = deliveryRecord(document?.fields);
  const liveInput = useMemo(() => documentInput(type, draft, document), [type, draft, document]);
  const savedDuplicates = document?.possibleDuplicates ?? [];
  const liveDups = editable && draft.contactId
    ? liveDuplicates(siblings, { id: document?.id, referenceNo: draft.referenceNo, documentDate: draft.documentDate, total: totals.total })
      .filter(({ id }) => !savedDuplicates.some((saved) => saved.id === id))
    : [];

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  /** A customer or supplier was chosen: its terms set the due date and its currency (if it has one) the currency. */
  function chooseContact(contactId: string, picked: Contact | undefined) {
    setCopyNote("");
    setDraft((current) => {
      if (current.contactId === contactId) return current;
      const next = { ...current, contactId, allocations: [], relatedDocumentId: "" };
      const currency = contactCurrency(picked);
      if (currency) next.currency = currency;
      return hasOutstanding(type) ? withTerms(next, chooseContactTerms(termsOf(next), picked, paymentTerms.data ?? [])) : next;
    });
  }

  function changeLine(key: number, changes: Partial<DocumentLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => line.key === key ? { ...line, value: { ...line.value, ...changes } } : line),
    }));
  }

  function addLine(focus = false) {
    const key = nextLine.current++;
    setDraft((current) => ({ ...current, lines: [...current.lines, { key, value: blankLine() }] }));
    setFocusLine(focus ? key : null);
  }

  /**
   * Enter in a line field moves to the next field, and from the last field of the last line adds a line, like a
   * spreadsheet. (A combobox with its list open handles Enter itself.) The form is never saved from a line by Enter.
   */
  function onLinesKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement>("input:not([disabled]):not([readonly])")];
    const index = fields.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    if (index < fields.length - 1) fields[index + 1].focus();
    else if (draft.lines.length < 500) addLine(true);
  }

  /** Adds the lines of the contact's latest saved document of this type; the user can still change every one. */
  async function copyLastLines() {
    if (!draft.contactId || copying) return;
    setCopying(true);
    setCopyNote("");
    setError("");
    try {
      const page = await listDocuments(type, { contactId: draft.contactId, source: "typed", pageSize: 20 });
      const last = lastDocumentWithLines(page.items, document?.id);
      if (!last) {
        setCopyNote(`No earlier ${label.toLowerCase()} with lines for this ${contactKind}.`);
        return;
      }
      // Untouched empty lines are replaced by the copied ones.
      const kept = draft.lines.filter(({ value }) => !isBlankLine(value)).length;
      const room = 500 - kept;
      const added = copiedLines(last.lines).slice(0, Math.max(room, 0)).map((value) => ({ key: nextLine.current++, value }));
      setDraft((current) => ({ ...current, lines: [...current.lines.filter(({ value }) => !isBlankLine(value)), ...added] }));
      setCopyNote(added.length ? `Copied ${added.length} line${added.length === 1 ? "" : "s"} from ${last.number}.` : "A document can have at most 500 lines.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to copy the lines.");
    } finally {
      setCopying(false);
    }
  }

  function changeAllocation(allocation: DocumentAllocation) {
    setDraft((current) => {
      const matches = (row: DocumentAllocation) => row.targetId === allocation.targetId && row.source === allocation.source;
      return {
        ...current,
        allocations: current.allocations.some(matches)
          ? current.allocations.map((row) => matches(row) ? allocation : row)
          : [...current.allocations, allocation],
      };
    });
  }

  function acceptSaved(saved: TypedDocument) {
    setDocument(saved);
    const next = makeDraft(saved);
    setDraft(next);
    nextLine.current = next.lines.length;
  }

  function navigateTo(saved: TypedDocument, replace = false) {
    const target = documentGroup(saved.type);
    if (!target) return;
    const href = documentHref(base, target, saved.type, saved.id);
    startNavigation(() => {
      if (replace) router.replace(href);
      else router.push(href);
    });
  }

  async function save(input: DocumentInput): Promise<TypedDocument | null> {
    if (!document) {
      const created = await createDocument(type, input);
      acceptSaved(created);
      navigateTo(created, true);
      return created;
    }
    if (!Object.keys(input).length) return document;
    const saved = await updateDocument(type, document.id, input);
    acceptSaved(saved);
    return saved;
  }

  function newDuplicates(saved: TypedDocument | null) {
    const fresh = (saved?.possibleDuplicates ?? []).filter(({ id }) => !seenDuplicates.current.has(id));
    fresh.forEach(({ id }) => seenDuplicates.current.add(id));
    return fresh;
  }

  async function perform(action: DocumentAction, reason?: string) {
    if (locked) return;
    const input = documentInput(type, draft, document);
    const changes = document ? changedInput(input, documentInput(type, makeDraft(document), document)) : input;
    const shouldValidate = action.kind === "save" || (action.kind === "transition" && editable
      && (action.status !== "draft" || Object.keys(changes).length > 0));
    if (shouldValidate && !form.current?.reportValidity()) return;
    setError("");
    setBusy(true);
    try {
      if (action.kind === "save") {
        await save(changes);
      } else if (document && action.kind === "transition") {
        if (editable) {
          const saved = await save(changes);
          if (action.status !== "draft" && action.status !== "void" && newDuplicates(saved).length) {
            setError("This document now looks like a possible duplicate (see the warning). Check it, then choose the action again to continue.");
            return;
          }
        }
        acceptSaved(await transitionDocument(type, document.id, action.status, reason));
      } else if (document && action.kind === "delete") {
        await deleteDocument(type, document.id);
        startNavigation(() => router.replace(listHref));
      } else if (document && action.kind === "duplicate") {
        navigateTo(await duplicateDocument(type, document.id));
      } else if (document && action.kind === "transfer") {
        navigateTo(await transferDocument(type, document.id, action.target));
      }
      setConfirmation(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to complete this action.");
    } finally {
      setBusy(false);
    }
  }

  function chooseAction(action: DocumentAction) {
    if (action.kind === "delete" || (action.kind === "transition" && action.status === "void")) {
      setError("");
      setVoidReason("");
      setConfirmation(action.kind === "delete" ? "delete" : "void");
    } else if (printed && action.kind === "transition" && (action.status === "ready" || action.status === "sent")) {
      void openIssueSheet(action);
    } else {
      void perform(action);
    }
  }

  /** Saves what changed, then shows what Send / Confirm / Issue will do (and post) before it is done. */
  async function openIssueSheet(action: DocumentAction) {
    if (locked || !document) return;
    if (editable && !form.current?.reportValidity()) return;
    setError("");
    setBusy(true);
    try {
      let saved: TypedDocument = document;
      if (editable) {
        const input = documentInput(type, draft, document);
        saved = await save(changedInput(input, documentInput(type, makeDraft(document), document))) ?? document;
        newDuplicates(saved);  // listed in the confirm step, so issuing does not stop for them again
      }
      let posting: PostingPreview | null = null;
      let postingError = "";
      if (POSTING_TYPES.has(type)) {
        try {
          posting = await documentPostingPreview(type, saved.id);
        } catch (error) {
          postingError = error instanceof Error ? error.message : "Unable to show the posting.";
        }
      }
      setSheet({ action, posting, postingError });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to prepare this step.");
    } finally {
      setBusy(false);
    }
  }

  const latest = latestFile(document?.files);

  async function openPdf(path: string, fileName = document?.displayName ?? "document.pdf") {
    setError("");
    try { await openInNewTab(path, fileName); } catch (error) { setError(error instanceof Error ? error.message : "Unable to open the PDF."); }
  }

  async function savePdf(path: string, fileName: string) {
    setError("");
    try { await download(path, fileName); } catch (error) { setError(error instanceof Error ? error.message : "Unable to download the PDF."); }
  }
  const blockedHints = [...new Set(actions.flatMap((action) =>
    action.kind === "transition" && action.disabledReason ? [action.disabledReason] : []))];

  function renderAction(action: DocumentAction) {
    if (action.kind === "save") {
      return <button key={action.label} className="btn" type="submit" form={formId} disabled={locked}>{action.label}</button>;
    }
    // The preview panel beside the form replaces the "Preview PDF" button.
    if (action.kind === "preview") return null;
    if (action.kind === "transition" && (action.status === "ready" || action.status === "sent") && !action.disabledReason) {
      return <button key={action.label} className="btn primary" type="button" disabled={locked}
        onClick={() => chooseAction(action)}>{action.label}…</button>;
    }
    if (action.kind === "print" || action.kind === "download") {
      if (!document) return null;
      if (!latest) {
        // Issued before printed copies were kept: the server renders a copy marked RECONSTRUCTED COPY.
        return action.kind === "print" ? <button key={action.label} className="btn" type="button" disabled={locked}
          title="Issued before copies were stored; marked RECONSTRUCTED COPY"
          onClick={() => void openPdf(documentPreviewUrl(type, document.id))}>Print (reconstructed copy)</button> : null;
      }
      return action.kind === "print"
        ? <button key={action.label} className="btn" type="button" disabled={locked}
            onClick={() => void openPdf(documentFileUrl(type, document.id, latest.revision, true), latest.fileName)}>{action.label}</button>
        : <button key={action.label} className="btn" type="button" disabled={locked}
            onClick={() => void savePdf(documentFileUrl(type, document.id, latest.revision), latest.fileName)}>{action.label}</button>;
    }
    const blocked = action.kind === "transition" ? action.disabledReason : undefined;
    return <button key={action.label} className="btn" type="button" disabled={locked || !!blocked} title={blocked}
      onClick={() => chooseAction(action)}>{action.label}</button>;
  }

  return <>
    <PageHeader title={document ? `${label} ${document.number}` : `New ${label.toLowerCase()}`}
      description={document?.displayName ?? undefined}
      actions={<>
        <Link className="btn" href={listHref}>Back to list</Link>
        {printed && <button type="button" className="btn" aria-pressed={showPreview} onClick={() => setShowPreview((shown) => !shown)}>
          {showPreview ? "Hide preview" : "Show preview"}</button>}
        {document && type === "delivery-order" && status === "ready" && !delivery && <button type="button" className="btn primary"
          disabled={locked} onClick={() => setDelivering(true)}>Mark delivered</button>}
        {actions.map(renderAction)}
      </>} />
    {printed && editable && <p className="notice info" role="note">{draftExplainer(type, admin)}</p>}
    {blockedHints.map((hint) => <p key={hint} className="notice info" role="note">{hint}.</p>)}
    {liveDups.length > 0 && <div className="notice warning" role="status">
      Looks like{" "}
      {liveDups.map((duplicate, index) => <span key={duplicate.id}>
        {index > 0 && ", "}
        <RelatedDocument base={base} type={type} id={duplicate.id} number={duplicate.number} /> ({duplicate.reason})
      </span>)}
      . Check it before you save; this does not block saving.
    </div>}
    {converted.map((link) => <p key={link.targetId} className="notice info" role="note">
      Converted to <RelatedDocument base={base} type={link.targetType} id={link.targetId} number={link.targetNumber} />.
    </p>)}
    {error && !confirmation && <RequestError message={error} />}
    {document?.possibleDuplicates?.length ? <div className="notice warning" role="status">
      Possible duplicate of{" "}
      {document.possibleDuplicates.map((duplicate, index) => <span key={duplicate.id}>
        {index > 0 && ", "}
        <RelatedDocument base={base} type={type} id={duplicate.id} number={duplicate.number} />
        {" "}({duplicate.reason})
      </span>)}
      . Check before issuing; this does not block saving.
    </div> : null}
    {lookups.map(({ label, resource }) => resource.error && <RequestError key={label} message={`${label} · ${resource.error}`} retry={resource.refresh} />)}
    {lookups.some(({ resource }) => resource.loading) && <p role="status">Loading form choices…</p>}
    {document && <DocumentFacts base={base} document={document} />}
    <div className={printed && showPreview ? "doc-work split" : "doc-work"}>
    <div className="doc-work-main">
    <form id={formId} ref={form} aria-busy={locked} onSubmit={(event) => {
      event.preventDefault();
      if (editable) void perform({ kind: "save", label: "Save" });
    }}>
      <fieldset className="min-w-0 border-0 p-0" disabled={!editable || locked} aria-label={`${label} fields`}>
        <Panel title="Details">
          <div className="p-5 pb-0">
            <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
              {contactKind && <div>
                <Field label={`${contactLabel}${REQUIRES_CONTACT.has(type) ? " *" : ""}`}
                  hint={editable && !draft.contactId ? "Type a name, code or TIN" : undefined}>
                  <Combobox value={draft.contactId} options={options.contacts} required={REQUIRES_CONTACT.has(type)}
                    placeholder={`Choose a ${contactKind}`} fallbackLabel={contactName} autoFocus={!document && editable} loading={contacts.loading}
                    createLabel={`Add new ${contactKind}`} onCreate={editable ? (name) => setQuickAdd({ kind: "contact", name }) : undefined}
                    onChange={(contactId) => chooseContact(contactId, contactList.find(({ id }) => id === contactId))} />
                </Field>
                {summary && <ContactCard summary={summary} label={sales ? "Bill to" : "Supplier"} />}
              </div>}
              {NOTE_TARGETS[type] && editable && (draft.contactId
                ? <NoteTargetPicker key={draft.contactId} type={type} contactId={draft.contactId} value={draft.relatedDocumentId}
                    saved={document?.related?.id === draft.relatedDocumentId ? document.related.number : undefined}
                    required={!draft.allocations.some(({ source }) => source === "scanned")}
                    onChange={(relatedDocumentId) => setDraft((current) => ({
                      ...current, relatedDocumentId,
                      // A credit note is applied in full to the document it corrects: stale typed amounts would be refused.
                      allocations: relatedDocumentId ? current.allocations.filter(({ source }) => source === "scanned") : current.allocations,
                    }))} />
                : <Field label="Corrects *" hint={`Choose the ${contactKind ?? "contact"} first.`}>
                    <input disabled value="" placeholder="Choose the document this corrects" />
                  </Field>)}
              <Field label="Number" hint={editable && document ? "The number is set when the document is created." : undefined}>
                <input value={draft.number} placeholder="Automatic" readOnly={!!document} maxLength={120}
                  onChange={(event) => setField("number", event.target.value)} />
              </Field>
              <Field label="Document date *"><input type="date" required value={draft.documentDate}
                onChange={(event) => {
                  const documentDate = event.target.value;
                  setDraft((current) => type === "quotation"
                    ? { ...current, documentDate, dueDate: current.dueDateAuto && documentDate ? addDays(documentDate, QUOTATION_VALID_DAYS) : current.dueDate }
                    : withTerms(current, changeDocumentDate(termsOf(current), documentDate)));
                }} /></Field>
              {type === "quotation" && <Field label="Valid until"
                hint={draft.dueDateAuto ? `${QUOTATION_VALID_DAYS} days after the document date until you change it.` : "How long the prices hold. Printed on the quotation."}>
                <input type="date" value={draft.dueDate} min={draft.documentDate || undefined}
                  onChange={(event) => { const dueDate = event.target.value; setDraft((current) => ({ ...current, dueDate, dueDateAuto: false })); }} />
              </Field>}
              {hasOutstanding(type) && <Field label="Payment terms" hint="Choosing terms sets the due date from the document date.">
                <Combobox value={draft.paymentTerms} options={options.terms} placeholder="No payment terms" loading={paymentTerms.loading}
                  fallbackLabel={draft.paymentTerms} onChange={(name) => {
                    const term = activeTerms.find((entry) => entry.name === name) ?? null;
                    setDraft((current) => withTerms({ ...current, paymentTerms: name }, chooseTerms(termsOf(current), term)));
                  }} />
              </Field>}
              {hasOutstanding(type) && <Field label="Due date" hint={draft.dueDateAuto && draft.termDays !== null ? "Follows the payment terms until you change it." : undefined}>
                <input type="date" value={draft.dueDate}
                  onChange={(event) => { const dueDate = event.target.value; setDraft((current) => withTerms(current, editDueDate(termsOf(current), dueDate))); }} /></Field>}
              <Field label={type === "bill" ? "Supplier invoice no." : "Reference no."} hint={sales ? "The customer's PO or their reference" : undefined}>
                <input value={draft.referenceNo} maxLength={200} onChange={(event) => setField("referenceNo", event.target.value)} />
              </Field>
              {printed && sales && type !== "payment" && <Field label="Attention" hint="The person the document is for">
                <input value={draft.attention} maxLength={200} placeholder="e.g. Purchasing manager"
                  onChange={(event) => setField("attention", event.target.value)} />
              </Field>}
              <Field label="Currency *" hint={draft.currency && draft.currency !== "MYR" ? "Only MYR documents post to the ledger" : undefined}>
                <input value={draft.currency} required pattern="[A-Za-z]{3}" maxLength={3}
                  onChange={(event) => setField("currency", event.target.value.toUpperCase())} />
              </Field>
              {USES_BANK.has(type) && <Field label="Bank account">
                <Combobox value={draft.bankAccountId} options={options.banks}
                  placeholder={transfer ? "Choose a bank account" : "Use default bank account"}
                  onChange={(id) => setField("bankAccountId", id)} />
              </Field>}
              {transfer && <Field label="To bank account">
                <Combobox value={draft.toBankAccountId} options={options.banks} placeholder="Choose a bank account"
                  onChange={(id) => setField("toBankAccountId", id)} />
              </Field>}
              {amountOnly && <Field label={`Amount (${draft.currency || "MYR"})`}
                hint={ALLOCATES_TO[type] ? "The amount received or paid; allocate it below" : "The amount of this entry"}>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.amount} placeholder="0.00"
                  onChange={(event) => setField("amount", event.target.value)} /></Field>}
            </div>
            {printed && sales && type !== "payment" && <Field label="Delivery address" hint={type === "delivery-order"
              ? "Prints under Deliver to. Empty prints the billing address." : "Only when the goods go somewhere other than the billing address."}>
              <textarea rows={2} value={draft.deliveryAddress} maxLength={1000} placeholder="Site or warehouse address"
                onChange={(event) => setField("deliveryAddress", event.target.value)} /></Field>}
            <Field label={printed ? "Notes (printed)" : "Description"}><textarea rows={2} value={draft.description} maxLength={4000}
              onChange={(event) => setField("description", event.target.value)} /></Field>
            {printed && <Field label="Terms and conditions" hint="Empty prints the company's standard terms.">
              <textarea rows={2} value={draft.terms} maxLength={4000} onChange={(event) => setField("terms", event.target.value)} /></Field>}
          </div>
        </Panel>
        {!amountOnly && <Panel title="Lines" action={editable && <>
          {contactKind && <button className="btn small" type="button" disabled={!draft.contactId || copying || draft.lines.length >= 500}
            title={draft.contactId ? undefined : `Choose the ${contactKind} first`} onClick={() => void copyLastLines()}>
            Copy lines from last {label.toLowerCase()}</button>}
          <button className="btn small" type="button" disabled={draft.lines.length >= 500} onClick={() => addLine(true)}>Add line</button>
        </>}>
          {copyNote && <p className="notice info mx-5 mt-3" role="status">{copyNote}</p>}
          {draft.lines.length ? <div className="divide-y divide-slate-200" onKeyDown={onLinesKeyDown}>
            {draft.lines.map((line, index) => <LineFields key={line.key} line={line.value} index={index} editable={editable}
              currency={draft.currency || "MYR"} products={productList} options={options}
              sales={sales} requiresAccount={type === "money-in" || type === "money-out"} autoFocus={focusLine === line.key}
              lastPrice={line.value.itemId ? prices.get(line.value.itemId) : undefined}
              onChange={(changes) => changeLine(line.key, changes)}
              onCreateProduct={(name) => setQuickAdd({ kind: "product", name, lineKey: line.key })}
              onRemove={() => setDraft((current) => ({ ...current, lines: current.lines.filter(({ key }) => key !== line.key) }))} />)}
          </div> : <EmptyState message="No lines have been added." />}
          {editable && <div className="lines-footer">
            <button className="btn small" type="button" disabled={draft.lines.length >= 500} onClick={() => addLine(true)}>+ Add line</button>
            <small>Enter moves to the next field; Enter in the last field adds a line.</small>
          </div>}
        </Panel>}
        {ALLOCATES_TO[type] && NOTE_TARGETS[type] && draft.relatedDocumentId
          ? <Panel title="Allocations"><p className="p-5">Applied in full to the document it corrects when issued.</p></Panel>
          : ALLOCATES_TO[type] && (editable && draft.contactId
          ? <AllocationEditor key={draft.contactId} type={type} contact={{ id: draft.contactId, legalName: contactName ?? "" }}
              allocations={draft.allocations} total={totals.total} onChange={changeAllocation} />
          : <SavedAllocations allocations={draft.allocations} needsContact={editable} />)}
      </fieldset>
      <Panel title="Totals">
        {/* Sums only: the tax is the typed line amounts added up, never calculated from a rate. */}
        <dl className="totals-grid grid grid-cols-2 gap-4 p-5 sm:grid-cols-5" aria-live="polite">
          {!amountOnly && <>
            <div><dt>Lines</dt><dd>{money(totals.gross)}</dd></div>
            <div><dt>Discount</dt><dd>{amountInCents(totals.discount) ? `− ${money(totals.discount)}` : money(totals.discount)}</dd></div>
            <div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
            <div><dt>Tax (as typed)</dt><dd>{money(totals.tax)}</dd></div>
          </>}
          <div><dt>Total</dt><dd><strong>{money(totals.total)}</strong></dd></div>
        </dl>
      </Panel>
    </form>
    </div>
    {printed && showPreview && <LivePreview type={type} input={liveInput} documentId={document?.id} editable={editable}
      stored={document ? (latest ? documentFileUrl(type, document.id, latest.revision, true) : documentPreviewUrl(type, document.id)) : null} />}
    </div>
    {quickAdd?.kind === "contact" && contactKind && <QuickAddContact kind={contactKind} name={quickAdd.name}
      onClose={() => setQuickAdd(null)} onCreated={(contact) => {
        setQuickAdd(null);
        setAddedContacts((current) => [...current, contact]);
        chooseContact(contact.id, contact);
        void contacts.refresh();
      }} />}
    {quickAdd?.kind === "product" && <QuickAddProduct name={quickAdd.name} sales={sales} taxOptions={options.taxes}
      onClose={() => setQuickAdd(null)} onCreated={(product) => {
        const { lineKey } = quickAdd;
        setQuickAdd(null);
        setAddedProducts((current) => [...current, product]);
        changeLine(lineKey, productLine(product, sales));
        void products.refresh();
      }} />}
    {document && (document.printed || !!document.files?.length) && <PrintedCopies document={document} />}
    {document && <ShareLinksPanel user={{ role }} type={type} document={document} />}
    {document && <HistoryPanel key={`${document.id}:${document.updatedAt}`} base={base} document={document} />}
    {document && <TracePanel key={`trace:${document.id}:${document.updatedAt}`} base={base} type={document.type} id={document.id} />}
    {confirmation && <Modal title={confirmation === "delete" ? "Delete draft" : "Void document"} onClose={() => setConfirmation(null)}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (confirmation === "delete") void perform({ kind: "delete", label: "Delete" });
        else if (voidReason.trim()) void perform({ kind: "transition", status: "void", label: "Void" }, voidReason.trim());
      }}>
        {error && <RequestError message={error} />}
        {confirmation === "delete" ? <p>Delete {document?.number}?</p> : <Field label="Reason *">
          <textarea required rows={3} maxLength={1000} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
        </Field>}
        <div className="modal-actions">
          <button type="button" className="btn" disabled={locked} onClick={() => setConfirmation(null)}>Cancel</button>
          <button type="submit" className="btn danger" disabled={locked || (confirmation === "void" && !voidReason.trim())}>
            {confirmation === "delete" ? "Delete" : "Void"}
          </button>
        </div>
      </form>
    </Modal>}
    {sheet && document && <Modal title={`${sheet.action.label} ${document.number}?`} onClose={() => setSheet(null)}>
      <IssueSheet type={type} document={document} draft={draft} posting={sheet.posting} postingError={sheet.postingError} />
      <div className="modal-actions">
        <button type="button" className="btn" disabled={locked} onClick={() => setSheet(null)}>Back to editing</button>
        <button type="button" className="btn primary" disabled={locked} onClick={() => {
          const action = sheet.action;
          setSheet(null);
          void perform(action);
        }}>{sheet.action.label}{POSTING_TYPES.has(type) ? " and post" : ""}</button>
      </div>
    </Modal>}
    {delivering && document && <DeliveredDialog document={document} onClose={() => setDelivering(false)}
      onSaved={(saved) => { setDelivering(false); acceptSaved(saved); }} />}
  </>;
}

/** The PDF as it will print, beside the form: drawn by the server from what the form holds (nothing saved, no number
 * taken), or the stored copy once the document can no longer be edited. */
function LivePreview({ type, input, documentId, editable, stored }: {
  type: DocumentType; input: DocumentInput; documentId?: string; editable: boolean; stored: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const current = useRef<string | null>(null);
  const body = JSON.stringify(input);
  useEffect(() => {
    let cancelled = false;
    const timer = globalThis.setTimeout(async () => {
      if (!editable && !stored) return;
      setLoading(true);
      try {
        const blob = editable ? await previewUnsavedPdf(type, JSON.parse(body) as DocumentInput, documentId) : await fetchBlob(stored!);
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        if (current.current) URL.revokeObjectURL(current.current);
        current.current = next;
        setUrl(next);
        setError("");
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : "Unable to draw the preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, editable ? 700 : 0);
    return () => { cancelled = true; globalThis.clearTimeout(timer); };
  }, [type, body, documentId, editable, stored]);
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);
  return <aside className="doc-preview" aria-label="Document preview">
    <div className="doc-preview-bar">
      <strong>{editable ? "Live preview" : "Printed copy"}</strong>
      <span role="status">{loading ? "Updating…" : editable ? "As it will print. Nothing is saved." : ""}</span>
      {url && <a className="btn small" href={url} target="_blank" rel="noreferrer">Open full size</a>}
    </div>
    {error && <p className="notice warning" role="status">The preview updates when the form can be printed: {error}</p>}
    {url ? <iframe title="Document preview" className="doc-preview-frame" src={`${url}#view=FitH`} />
      : !error && <p className="doc-preview-empty">Drawing the preview…</p>}
  </aside>;
}

/** The confirm step: what Send / Confirm / Issue does, reminders, and the journal it posts. */
function IssueSheet({ type, document, draft, posting, postingError }: {
  type: DocumentType; document: TypedDocument; draft: Draft; posting: PostingPreview | null; postingError: string;
}) {
  const verb = issueLabel(type).toLowerCase();
  const lines = draft.lines.map(({ value }) => value).filter((line) => !isBlankLine(line));
  const checklist = issueChecklist(type, {
    contactId: draft.contactId, lines, dueDate: draft.dueDate, attention: draft.attention, deliveryAddress: draft.deliveryAddress,
  });
  const what = [
    type === "quotation" ? "It becomes Sent and can no longer be edited."
      : type === "sales-order" ? "It becomes Confirmed and can no longer be edited."
        : "It becomes Issued and can no longer be edited; a correction is made by voiding it.",
    "PDF revision 1 is stored and never changes.",
    POSTING_TYPES.has(type) ? "The journal below is posted to the ledger."
      : `Nothing is posted: a ${DOCUMENT_LABELS[type].toLowerCase()} never touches the ledger.`,
  ];
  return <div className="issue-sheet">
    <h3>What happens</h3>
    <ul>{what.map((line) => <li key={line}>{line}</li>)}</ul>
    <h3>Before you {verb}</h3>
    {checklist.length || document.possibleDuplicates?.length ? <ul className="issue-reminders">
      {checklist.map((line) => <li key={line}>{line}</li>)}
      {document.possibleDuplicates?.map((duplicate) => <li key={duplicate.id}>Possible duplicate of {duplicate.number} ({duplicate.reason}).</li>)}
    </ul> : <p>Everything usually printed is filled in.</p>}
    {POSTING_TYPES.has(type) && <>
      <h3>Posting</h3>
      {postingError && <p className="notice warning">{postingError}</p>}
      {posting?.problem && <p className="notice warning">{posting.problem}</p>}
      {posting && posting.lines.length > 0 && <div className="table-scroll"><table>
        <thead><tr><th scope="col">Account</th><th scope="col">Debit</th><th scope="col">Credit</th></tr></thead>
        <tbody>{posting.lines.map((line, index) => <tr key={`${line.accountId}:${index}`}>
          <td>{line.code} {line.name}</td>
          <td>{amountInCents(line.debit) ? money(line.debit) : ""}</td><td>{amountInCents(line.credit) ? money(line.credit) : ""}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Total</th><td>{money(posting.totalDebit)}</td><td>{money(posting.totalCredit)}</td></tr></tfoot>
      </table></div>}
      <p className="issue-note">Tax is the amount typed on each line; nothing is calculated.</p>
    </>}
  </div>;
}

function DeliveryFact({ fields }: { fields: Record<string, unknown> }) {
  const record = deliveryRecord(fields);
  return record
    ? <span><StatusBadge status="Delivered" /> Received by <strong>{record.receivedBy}</strong> on {formatDate(record.receivedOn)}
      {record.note ? ` · ${record.note}` : ""}</span>
    : <span>Out for delivery. When the signed copy comes back, choose Mark delivered and attach it under Attachments.</span>;
}

/** Records who signed for an issued delivery order. The signed copy goes in the Attachments panel below. */
function DeliveredDialog({ document, onClose, onSaved }: {
  document: TypedDocument; onClose: () => void; onSaved: (saved: TypedDocument) => void;
}) {
  const earliest = document.documentDate ?? "";
  const [receivedBy, setReceivedBy] = useState(text(document.fields.attention));
  const [receivedOn, setReceivedOn] = useState(() => (earliest && today() < earliest ? earliest : today()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title={`Mark ${document.number} delivered`} onClose={onClose} closeDisabled={busy}>
    <form onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true);
      setError("");
      try {
        onSaved(await markDelivered(document.id, { receivedBy: receivedBy.trim(), receivedOn, note: note.trim() || null }));
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Unable to record the delivery.");
      } finally {
        setBusy(false);
      }
    }}>
      <p>Record who signed for the goods. Attach the signed and chopped copy under Attachments; a delivery order never posts.</p>
      {error && <RequestError message={error} />}
      <Field label="Received by *"><input required maxLength={200} value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} /></Field>
      <Field label="Date received *"><input type="date" required min={earliest || undefined} value={receivedOn}
        onChange={(event) => setReceivedOn(event.target.value)} /></Field>
      <Field label="Note"><textarea rows={2} maxLength={1000} value={note} placeholder="e.g. 2 bags short, to follow"
        onChange={(event) => setNote(event.target.value)} /></Field>
      <div className="modal-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy || !receivedBy.trim() || !receivedOn}>Mark delivered</button>
      </div>
    </form>
  </Modal>;
}

/** The loaded list plus records just added from this form (until the list reloads with them). */
function merged<T extends { id: string }>(loaded: readonly T[] | undefined, added: readonly T[]): T[] {
  const rows = [...loaded ?? []];
  for (const row of added) if (!rows.some(({ id }) => id === row.id)) rows.push(row);
  return rows;
}

/** What prints for the chosen customer or supplier; it comes from the contact record (change it on the contact page). */
function ContactCard({ summary, label }: { summary: NonNullable<ReturnType<typeof contactSummary>>; label: string }) {
  const rows = [
    ["Address", summary.address], ["SSM", summary.registrationNumber], ["TIN", summary.tin], ["SST", summary.sstNumber],
    ["Email", summary.email], ["Phone", summary.phone],
  ].filter(([, value]) => value);
  return <div className="contact-card" role="group" aria-label={label}>
    {rows.length ? <dl>{rows.map(([name, value]) => <div key={name} className="contents"><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
      : <p>No address or tax numbers on this contact yet.</p>}
  </div>;
}

type LineChoices = { products: ComboOption[]; descriptions: Suggestion[]; accounts: ComboOption[]; taxes: ComboOption[] };

function LineFields({
  line, index, editable, currency, products, options, sales, requiresAccount, autoFocus, onChange, onCreateProduct, onRemove, lastPrice,
}: {
  line: DocumentLine; index: number; editable: boolean; currency: string; products: readonly Product[]; options: LineChoices;
  sales: boolean; requiresAccount: boolean; autoFocus: boolean; onChange: (changes: Partial<DocumentLine>) => void;
  onCreateProduct: (name: string) => void; onRemove: () => void; lastPrice?: LastPrice;
}) {
  const fields = [
    { key: "quantity", label: "Quantity *", min: "0.001", step: "0.001", required: true },
    { key: "unitPrice", label: `Unit price (${currency}) *`, min: "0", step: "0.0001", required: true },
    { key: "discount", label: "Discount", min: "0", step: "0.01", required: false },
  ] as const;
  const taxHint = options.taxes.length || line.taxCode ? "A label only; it does not calculate tax" : "No tax codes yet. Add them under Catalog › Tax codes.";
  return <section className="p-5 pb-0" aria-label={`Line ${index + 1}`}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3>Line {index + 1}</h3>
      {editable && <button className="btn small" type="button" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>Remove</button>}
    </div>
    <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Product">
        {/* Fills the description, price, account and tax-code label the product carries; each can still be changed. */}
        <Combobox value={line.itemId ?? ""} options={options.products} placeholder="Type a product name or SKU"
          fallbackLabel={line.description} autoFocus={autoFocus} createLabel="Add new product"
          onCreate={editable ? onCreateProduct : undefined}
          onChange={(id) => {
            const product = products.find((each) => each.id === id);
            onChange(product ? productLine(product, sales) : { itemId: null });
          }} />
      </Field>
      <Field label="Description" hint={options.descriptions.length ? "Type to see catalog items and lines used before" : undefined}>
        <Combobox options={options.descriptions} text={line.description} maxLength={500} placeholder="What was sold or bought"
          onTextChange={(description) => onChange({ description })}
          onChange={(_, suggestion) => { if (suggestion) onChange(lineFromSuggestion(suggestion, sales)); }} />
      </Field>
      {fields.map(({ key, label, min, step, required }) => <Field key={key} label={label}>
        <input type="number" min={min} step={step} required={required} inputMode="decimal" value={line[key] ?? ""}
          onChange={(event) => onChange({ [key]: event.target.value })} />
      </Field>)}
      {/* Tax is never calculated: the code is a label and the amount is typed as shown on the document. */}
      <Field label="Tax code" hint={taxHint}>
        <Combobox value={line.taxCode ?? ""} options={options.taxes} placeholder="No tax code"
          fallbackLabel={line.taxCode ? `${line.taxCode} (not in the catalog)` : null}
          onChange={(code) => onChange({ taxCode: code || null })} />
      </Field>
      <Field label="Tax amount" hint="Typed as recorded; not calculated">
        <input type="number" min="0" step="0.01" inputMode="decimal" value={line.tax ?? ""} onChange={(event) => onChange({ tax: event.target.value })} />
      </Field>
      <Field label={requiresAccount ? "Account *" : "Account"} hint={requiresAccount ? undefined : "Empty uses the posting rules"}>
        <Combobox value={line.accountId ?? ""} options={options.accounts} required={requiresAccount}
          placeholder={requiresAccount ? "Type an account code or name" : "Use posting rules"}
          onChange={(id) => onChange({ accountId: id || null })} />
      </Field>
      <div className="line-amount">
        <span>Amount</span>
        <output aria-label={`Line ${index + 1} amount`}>{currency} {formatAmount(lineAmount(line))}</output>
      </div>
    </div>
    {lastPrice && <p className="line-hint" role="note">
      Last charged to this customer: {currency} {formatAmount(lastPrice.unitPrice)} on {lastPrice.number}
      {lastPrice.documentDate ? ` (${formatDate(lastPrice.documentDate)})` : ""}.
      {editable && amountInCents(lastPrice.unitPrice) !== amountInCents(line.unitPrice || "0") && <>{" "}
        <button type="button" className="btn small" onClick={() => onChange({ unitPrice: lastPrice.unitPrice })}>Use this price</button></>}
    </p>}
  </section>;
}

type DocumentFilters = NonNullable<Parameters<typeof listDocuments>[1]>;

async function listAllocationTargets(type: DocumentType, filters: DocumentFilters) {
  const rows: ErpDocument[] = [];
  let page: number | null = 1;
  while (page !== null) {
    const result = await listDocuments(type, { ...filters, page, pageSize: 100 });
    rows.push(...result.items);
    page = result.nextPage;
  }
  return rows;
}

const allocationKey = ({ source, targetId }: Pick<DocumentAllocation, "source" | "targetId">) => `${source}:${targetId}`;
const sourceLabel = (source: DocumentAllocation["source"]) => source === "typed" ? "Typed" : "Scanned";

function AllocationEditor({ type, contact, allocations, total, onChange }: {
  type: DocumentType; contact: { id: string; legalName: string }; allocations: DocumentAllocation[];
  total: string; onChange: (allocation: DocumentAllocation) => void;
}) {
  const targets = ALLOCATES_TO[type];
  const { data, loading, error, refresh } = useResource(async () => {
    if (!targets) return [];
    const [scanned, ...typed] = await Promise.all([
      acceptsScannedAllocations(type) ? listAllocationTargets(targets[0], { source: "scanned" }) : [],
      ...targets.map((target) => listAllocationTargets(target, { contactId: contact.id, status: "ready", source: "typed" })),
    ]);
    return [...typed.flat(), ...scanned];
  }, `${type}:${contact.id}`);

  const candidates = allocationCandidates(type, contact, data ?? []);
  const rows = new Map(candidates.map((row) => {
    const allocation = { source: row.source, targetId: row.id };
    return [allocationKey(allocation), { ...allocation, number: row.number, outstanding: row.outstanding }];
  }));
  const amounts = new Map(allocations.map((allocation) => [allocationKey(allocation), allocation.amount]));
  for (const allocation of allocations) {
    const key = allocationKey(allocation);
    if (!rows.has(key)) rows.set(key, { ...allocation, number: allocation.targetNumber ?? `Saved target (${allocation.targetId})`, outstanding: undefined });
  }
  const allocated = allocations.reduce((sum, { amount }) => sum + amountInCents(amount), 0n);

  return <Panel title="Allocations">
    {error && <RequestError message={error} retry={refresh} />}
    {loading && <LoadingState variant="table" />}
    {rows.size > 0 && <div className="table-scroll max-h-96" role="region" tabIndex={0} aria-label="Allocation targets">
      <table>
        <thead><tr><th scope="col">Number</th><th scope="col">Source</th><th scope="col">Outstanding</th><th scope="col">Allocate amount</th></tr></thead>
        <tbody>{[...rows].map(([key, { number, outstanding, source, targetId }]) => <tr key={key}>
          <th scope="row">{number}</th><td>{sourceLabel(source)}</td><td>{outstanding == null ? "—" : money(outstanding)}</td>
          <td><div className="flex items-center gap-2">
            <input type="number" min="0" step="0.01" aria-label={`Allocate amount to ${number} (${sourceLabel(source)})`}
              value={amounts.get(key) ?? ""} onChange={(event) => onChange({ targetId, source, amount: event.target.value })} />
            {outstanding != null && amountInCents(outstanding) > 0n && <button type="button" className="btn small"
              aria-label={`Allocate the full outstanding ${money(outstanding)} to ${number}`}
              onClick={() => onChange({ targetId, source, amount: decimalAmount(amountInCents(outstanding)) })}>Full</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {!loading && !error && !rows.size && <p className="p-5">
      No open {targets?.map((target) => `${DOCUMENT_LABELS[target].toLowerCase()}s`).join(" or ")} for this contact.
    </p>}
    {NOTE_TARGETS[type] && <p className="px-5">Leave the amounts empty to apply the note in full to the document it corrects.</p>}
    <div className="p-5">
      <p>Allocated total <strong>{money(decimalAmount(allocated))}</strong></p>
      {allocated > amountInCents(total) && <p className="notice warning mt-2" role="status">The allocated total is more than the document amount.</p>}
    </div>
  </Panel>;
}

function SavedAllocations({ allocations, needsContact }: { allocations: DocumentAllocation[]; needsContact: boolean }) {
  if (!needsContact && !allocations.length) return null;
  return <Panel title="Allocations">
    <div className="p-5">
      {needsContact && <p>Choose a contact to see open documents.</p>}
      {allocations.length > 0 && <>
        <ul className="mb-3 space-y-1">
          {allocations.map((allocation) => <li key={allocationKey(allocation)}>
            {sourceLabel(allocation.source)} {allocation.targetNumber ?? allocation.targetId} · {money(allocation.amount)}
          </li>)}
        </ul>
        <p>Allocated total <strong>{money(decimalAmount(allocations.reduce((sum, row) => sum + amountInCents(row.amount), 0n)))}</strong></p>
      </>}
    </div>
  </Panel>;
}

function DocumentFacts({ base, document }: { base: string; document: TypedDocument }) {
  const ledger = `${base}/ledger?section=journals`;
  return <Panel>
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
      <StatusBadge status={documentStatusLabel(document.status, document.type)} />
      {document.related && <span>Corrects{" "}
        <RelatedDocument base={base} type={document.related.type} id={document.related.id} number={document.related.number} />
      </span>}
      {document.posted && <Link href={document.journalId ? `${ledger}&q=${encodeURIComponent(document.journalId)}` : ledger}>Posted to the ledger</Link>}
      {document.reversalJournalId && <Link href={ledger}>Reversed by journal {document.reversalJournalId}</Link>}
      {hasOutstanding(document.type) && <>
        {document.outstanding != null && <span>Outstanding <strong>{money(document.outstanding)}</strong></span>}
        {document.paymentStatus && <span>Payment status <StatusBadge status={document.paymentStatus} /></span>}
      </>}
      {document.type === "quotation" && document.dueDate && <span>Valid until <strong>{formatDate(document.dueDate)}</strong></span>}
      {document.type === "delivery-order" && document.status === "ready" && <DeliveryFact fields={document.fields} />}
    </div>
  </Panel>;
}

function NoteTargetPicker({ type, contactId, value, saved, required = true, onChange }: {
  type: DocumentType; contactId: string; value: string; saved?: string; required?: boolean; onChange: (id: string) => void;
}) {
  const targets = NOTE_TARGETS[type] ?? [];
  const { data, loading, error, refresh } = useResource(async () => {
    const lists = await Promise.all(targets.map((target) => listAllocationTargets(target, { contactId, status: "ready", source: "typed" })));
    return noteTargetCandidates(type, contactId, lists.flat());
  }, `notes:${type}:${contactId}`);
  const names = targets.map((target) => DOCUMENT_LABELS[target].toLowerCase()).join(" or ");
  // The error sits outside the Field so the label stays tied to the combobox (Field labels a single child).
  return <div>
    <Field label={required ? "Corrects *" : "Corrects"} hint={!required ? "Optional: this credit already settles a scanned bill."
        : loading ? "Loading issued documents…" : !error && !data?.length ? `No issued ${names} for this contact.` : undefined}>
      <Combobox required={required} value={value} placeholder={`Choose the ${names} this corrects`} fallbackLabel={saved}
        loading={loading} onChange={(id) => onChange(id)}
        options={(data ?? []).map((row) => ({
          id: row.id, label: row.number, keywords: [row.referenceNo],
          detail: `${formatDate(row.documentDate)} · outstanding ${money(row.outstanding ?? row.amount)}`,
        }))} />
    </Field>
    {error && <RequestError message={error} retry={refresh} />}
  </div>;
}

function PrintedCopies({ document }: { document: TypedDocument }) {
  const files: DocumentFile[] = [...document.files ?? []].sort((a, b) => b.revision - a.revision);
  return <Panel title="Printed copies">
    {files.length ? <DataTable rows={files} rowKey={(file) => String(file.revision)} columns={[
      { label: "Revision", render: (file) => file.revision },
      { label: "Reason", render: (file) => fileReasonLabel(file.reason) },
      { label: "File name", render: (file) => file.fileName },
      { label: "Size", render: (file) => formatFileSize(file.byteSize) },
      { label: "Created", render: (file) => formatTime(file.createdAt) },
      { label: "Download", render: (file) => <button type="button" className="btn small"
          onClick={() => void download(documentFileUrl(document.type, document.id, file.revision), file.fileName)}
          aria-label={`Download revision ${file.revision}`}>Download</button> },
    ]} /> : <EmptyState message="A PDF copy is stored when this document is issued. Each copy is kept and never changed." />}
  </Panel>;
}

function formatTime(value: string) {
  const time = new Date(value.replace(" ", "T"));
  const clock = Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(value)} ${clock}`.trim();
}

function RelatedDocument({ base, type, id, number }: { base: string; type: DocumentType; id: string; number: string }) {
  const group = documentGroup(type);
  const label = `${DOCUMENT_LABELS[type]} ${number}`;
  return group ? <Link href={documentHref(base, group, type, id)}>{label}</Link> : label;
}

function HistoryPanel({ base, document }: { base: string; document: TypedDocument }) {
  const { data, loading, error, refresh } = useResource(() => documentHistory(document.type, document.id), document.id);
  return <Panel title="History">
    {loading && <LoadingState variant="table" />}
    {error && <RequestError message={error} retry={refresh} />}
    {data && <DocumentHistoryContent base={base} id={document.id} history={data} />}
  </Panel>;
}

function DocumentHistoryContent({ base, id, history }: { base: string; id: string; history: DocumentHistory }) {
  return <>
    {history.events.length > 0 && <DataTable rows={history.events} rowKey={(event) => event.id} columns={[
      { label: "Time", render: (event) => formatTime(event.createdAt) },
      { label: "Who", render: (event) => event.actorName ?? "—" },
      { label: "Event", render: (event) => statusLabel(event.eventType) },
      { label: "Status change", render: (event) => event.fromStatus && event.toStatus
        ? `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`
        : event.toStatus ? statusLabel(event.toStatus) : "—" },
      { label: "Reason", render: (event) => event.reason ?? "—" },
    ]} />}
    {history.links.length > 0 && <div className="p-5">
      <h3>Related documents</h3>
      <ul className="mt-2 space-y-1">
        {history.links.map((link) => {
          const outgoing = link.sourceId === id;
          const verb = link.linkType === "duplicate" ? "Duplicated" : "Transferred";
          return <li key={`${link.linkType}:${link.sourceId}:${link.targetId}`}>
            {verb} {outgoing ? "to" : "from"}{" "}
            {outgoing
              ? <RelatedDocument base={base} type={link.targetType} id={link.targetId} number={link.targetNumber} />
              : <RelatedDocument base={base} type={link.sourceType} id={link.sourceId} number={link.sourceNumber} />}
          </li>;
        })}
      </ul>
    </div>}
    {history.allocations.length > 0 && <>
      <h3 className="p-5">Allocation history</h3>
      <div className="table-scroll" role="region" aria-label="Allocation history" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
          <tbody>{history.allocations.map((row, index) => <tr key={`${row.sourceId}:${row.targetId}:${index}`}>
            <td><RelatedDocument base={base} type={row.sourceType} id={row.sourceId} number={row.sourceNumber} /></td>
            <td><RelatedDocument base={base} type={row.targetType} id={row.targetId} number={row.targetNumber} /></td>
            <td>{money(row.amount)}</td><td><StatusBadge status={row.status} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    {!history.events.length && !history.links.length && !history.allocations.length && <EmptyState message="There is no history for this document yet." />}
  </>;
}

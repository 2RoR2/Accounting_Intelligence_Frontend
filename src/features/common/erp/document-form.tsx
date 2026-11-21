"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import {
  DataTable, EmptyState, Field, LoadingState, Modal, PageHeader, Panel, StatusBadge, formatDate, money,
} from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  ALLOCATES_TO, AMOUNT_ONLY_TYPES, DOCUMENT_LABELS, createDocument, deleteDocument, documentHistory, duplicateDocument,
  getDocument, listCatalog, listContacts, listDocuments, listProducts, transferDocument, transitionDocument, updateDocument,
  type DocumentAllocation, type DocumentHistory, type DocumentInput, type DocumentLine, type DocumentType, type ErpDocument,
  type Product, type TypedDocument,
} from "@/lib/api/erp.service";
import { getLedgerAccounts, type LedgerAccount } from "@/lib/api/ledger.service";
import { statusLabel } from "@/lib/glossary";
import type { User } from "@/types";
import {
  acceptsScannedAllocations, allocationCandidates, amountInCents, decimalAmount, documentActions, documentGroup, documentHref,
  documentTotals, hasOutstanding, type DocumentAction, type DocumentGroup,
} from "./document-logic";
import { ShareLinksPanel } from "./share-links";

type FormProps = { base: string; group: DocumentGroup; type: DocumentType; role: User["role"] };
type DraftLine = { key: number; value: DocumentLine };
type Draft = {
  number: string; contactId: string; documentDate: string; dueDate: string; currency: string; referenceNo: string;
  description: string; bankAccountId: string; toBankAccountId: string; amount: string;
  lines: DraftLine[]; allocations: DocumentAllocation[];
};

const REQUIRES_CONTACT = new Set<DocumentType>([
  "invoice", "credit-note", "payment", "refund", "bill", "purchase-credit-note", "purchase-payment", "purchase-refund",
]);
const USES_BANK = new Set<DocumentType>([
  "payment", "refund", "purchase-payment", "purchase-refund", "money-in", "money-out", "bank-transfer",
]);

function today() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
}

function makeDraft(document: TypedDocument | null): Draft {
  const toBankAccountId = document?.fields.toBankAccountId;
  return {
    number: document?.number ?? "",
    contactId: document?.contactId ?? "",
    documentDate: document?.documentDate ?? today(),
    dueDate: document?.dueDate ?? "",
    currency: document?.currency ?? "MYR",
    referenceNo: document?.referenceNo ?? "",
    description: document?.description ?? "",
    bankAccountId: document?.bankAccountId ?? "",
    toBankAccountId: typeof toBankAccountId === "string" ? toBankAccountId : "",
    amount: document?.amount ?? "",
    lines: document?.lines.map((value, key) => ({ key, value })) ?? [],
    allocations: document?.allocations ?? [],
  };
}

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
    input.lines = draft.lines.map(({ value }) => ({ ...value, discount: value.discount || "0", tax: value.tax || "0" }));
    // Without lines the API falls back to the stored amount unless the patch clears it.
    if (!input.lines.length) input.amount = "0";
  }
  if (ALLOCATES_TO[type]) input.allocations = draft.allocations.filter(({ amount }) => amount && Number(amount) !== 0);
  if (type === "bank-transfer") {
    const fields = { ...document?.fields };
    if (draft.toBankAccountId) fields.toBankAccountId = draft.toBankAccountId;
    else delete fields.toBankAccountId;
    input.fields = fields;
  }
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
  const [draft, setDraft] = useState(() => makeDraft(initialDocument));
  const nextLine = useRef(draft.lines.length);
  const [busy, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<"delete" | "void" | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const label = DOCUMENT_LABELS[type];
  const status = document?.status ?? "draft";
  const actions = documentActions(status, type, role).filter((action) => document || action.kind === "save");
  const editable = actions.some((action) => action.kind === "save");
  const amountOnly = AMOUNT_ONLY_TYPES.has(type);
  const transfer = type === "bank-transfer";
  const contactKind = group === "sales" ? "customer" : group === "purchases" ? "supplier" : undefined;
  const contactLabel = contactKind === "customer" ? "Customer" : "Supplier";
  const listHref = documentHref(base, group, type);
  const locked = busy || navigating;
  const totals = !editable && document
    ? { subtotal: document.subtotal, tax: document.taxAmount, total: document.amount }
    : documentTotals(type, draft.lines.map(({ value }) => value), draft.amount);
  const contacts = useResource(async () => contactKind ? listContacts({ kind: contactKind }) : [], `contacts:${type}`);
  const products = useResource(async () => amountOnly ? [] : listProducts(), `products:${type}`);
  const accounts = useResource(async () => amountOnly ? [] : getLedgerAccounts(), `accounts:${type}`);
  const banks = useResource(async () => USES_BANK.has(type) ? listCatalog("bank-account") : [], `banks:${type}`);
  const lookups = [
    { label: "Contacts", resource: contacts }, { label: "Products", resource: products },
    { label: "Ledger accounts", resource: accounts }, { label: "Bank accounts", resource: banks },
  ];
  const selectedContact = contacts.data?.find(({ id }) => id === draft.contactId);
  const contactName = selectedContact?.legalName ?? (document?.contactId === draft.contactId ? document?.contactName : null);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeLine(key: number, changes: Partial<DocumentLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => line.key === key ? { ...line, value: { ...line.value, ...changes } } : line),
    }));
  }

  function addLine() {
    const key = nextLine.current++;
    setDraft((current) => ({
      ...current, lines: [...current.lines, { key, value: { description: "", quantity: "1", unitPrice: "0" } }],
    }));
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

  async function save(input: DocumentInput) {
    if (!document) {
      const created = await createDocument(type, input);
      acceptSaved(created);
      navigateTo(created, true);
      return;
    }
    if (Object.keys(input).length) acceptSaved(await updateDocument(type, document.id, input));
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
        if (editable) await save(changes);
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
    } else {
      void perform(action);
    }
  }

  return <>
    <PageHeader title={document ? `${label} ${document.number}` : `New ${label.toLowerCase()}`}
      actions={<>
        <Link className="btn" href={listHref}>Back to list</Link>
        {actions.map((action) => action.kind === "save"
          ? <button key={action.label} className="btn primary" type="submit" form={formId} disabled={locked}>Save</button>
          : <button key={action.label} className="btn" type="button" disabled={locked}
              onClick={() => chooseAction(action)}>{action.label}</button>)}
      </>} />
    {error && !confirmation && <RequestError message={error} />}
    {lookups.map(({ label, resource }) => resource.error && <RequestError key={label} message={`${label} · ${resource.error}`} retry={resource.refresh} />)}
    {lookups.some(({ resource }) => resource.loading) && <p role="status">Loading form choices…</p>}
    {document && <DocumentFacts base={base} document={document} />}
    <form id={formId} ref={form} aria-busy={locked} onSubmit={(event) => {
      event.preventDefault();
      if (editable) void perform({ kind: "save", label: "Save" });
    }}>
      <fieldset className="min-w-0 border-0 p-0" disabled={!editable || locked} aria-label={`${label} fields`}>
        <Panel title="Details">
          <div className="p-5 pb-0">
            <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
              {contactKind && <Field label={`${contactLabel}${REQUIRES_CONTACT.has(type) ? " *" : ""}`}>
                <select value={draft.contactId} required={REQUIRES_CONTACT.has(type)} onChange={(event) => {
                  const contactId = event.target.value;
                  setDraft((current) => ({ ...current, contactId, allocations: [] }));
                }}>
                  <SelectOptions value={draft.contactId} placeholder={`Choose a ${contactKind}`} fallback={contactName}
                    options={contacts.data?.map(({ id, legalName }) => ({ id, label: legalName }))} />
                </select>
              </Field>}
              <Field label="Number" hint={editable && document ? "The number is set when the document is created." : undefined}>
                <input value={draft.number} placeholder="Automatic" readOnly={!!document} maxLength={120}
                  onChange={(event) => setField("number", event.target.value)} />
              </Field>
              <Field label="Document date *"><input type="date" required value={draft.documentDate}
                onChange={(event) => setField("documentDate", event.target.value)} /></Field>
              {hasOutstanding(type) && <Field label="Due date"><input type="date" value={draft.dueDate}
                onChange={(event) => setField("dueDate", event.target.value)} /></Field>}
              <Field label={type === "bill" ? "Supplier invoice no." : "Reference no."}>
                <input value={draft.referenceNo} maxLength={200} onChange={(event) => setField("referenceNo", event.target.value)} />
              </Field>
              <Field label="Currency *" hint={draft.currency && draft.currency !== "MYR" ? "Only MYR documents post to the ledger" : undefined}>
                <input value={draft.currency} required pattern="[A-Za-z]{3}" maxLength={3}
                  onChange={(event) => setField("currency", event.target.value.toUpperCase())} />
              </Field>
              {USES_BANK.has(type) && <Field label="Bank account">
                <select value={draft.bankAccountId} onChange={(event) => setField("bankAccountId", event.target.value)}>
                  <SelectOptions value={draft.bankAccountId} placeholder={transfer ? "Choose a bank account" : "Use default bank account"}
                    options={banks.data?.map(({ id, name }) => ({ id, label: name }))} />
                </select>
              </Field>}
              {transfer && <Field label="To bank account">
                <select value={draft.toBankAccountId} onChange={(event) => setField("toBankAccountId", event.target.value)}>
                  <SelectOptions value={draft.toBankAccountId} placeholder="Choose a bank account"
                    options={banks.data?.map(({ id, name }) => ({ id, label: name }))} />
                </select>
              </Field>}
              {amountOnly && <Field label="Amount"><input type="number" min="0" step="0.01" value={draft.amount}
                onChange={(event) => setField("amount", event.target.value)} /></Field>}
            </div>
            <Field label="Description"><textarea rows={2} value={draft.description} maxLength={4000}
              onChange={(event) => setField("description", event.target.value)} /></Field>
          </div>
        </Panel>
        {!amountOnly && <Panel title="Lines" action={editable && <button className="btn small" type="button"
          disabled={draft.lines.length >= 500} onClick={addLine}>Add line</button>}>
          {draft.lines.length ? <div className="divide-y divide-slate-200">
            {draft.lines.map((line, index) => <LineFields key={line.key} line={line.value} index={index} editable={editable}
              products={products.data ?? []} accounts={accounts.data ?? []}
              sales={group === "sales"} requiresAccount={type === "money-in" || type === "money-out"}
              onChange={(changes) => changeLine(line.key, changes)}
              onRemove={() => setDraft((current) => ({ ...current, lines: current.lines.filter(({ key }) => key !== line.key) }))} />)}
          </div> : <EmptyState message="No lines have been added." />}
        </Panel>}
        {ALLOCATES_TO[type] && (editable && draft.contactId
          ? <AllocationEditor key={draft.contactId} type={type} contact={{ id: draft.contactId, legalName: contactName ?? "" }}
              allocations={draft.allocations} total={totals.total} onChange={changeAllocation} />
          : <SavedAllocations allocations={draft.allocations} needsContact={editable} />)}
      </fieldset>
      <Panel title="Totals">
        <dl className="grid gap-4 p-5 sm:grid-cols-3">
          <div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
          <div><dt>Tax</dt><dd>{money(totals.tax)}</dd></div>
          <div><dt>Total</dt><dd><strong>{money(totals.total)}</strong></dd></div>
        </dl>
      </Panel>
    </form>
    {document && <ShareLinksPanel user={{ role }} type={type} document={document} />}
    {document && <HistoryPanel key={`${document.id}:${document.updatedAt}`} base={base} document={document} />}
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
  </>;
}

function SelectOptions({ value, placeholder, fallback, options = [] }: {
  value: string; placeholder: string; fallback?: string | null; options?: { id: string; label: string }[];
}) {
  return <>
    <option value="">{placeholder}</option>
    {value && !options.some(({ id }) => id === value) && <option value={value}>{fallback || `Saved selection (${value})`}</option>}
    {options.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
  </>;
}

function LineFields({ line, index, editable, products, accounts, sales, requiresAccount, onChange, onRemove }: {
  line: DocumentLine; index: number; editable: boolean; products: Product[]; accounts: LedgerAccount[];
  sales: boolean; requiresAccount: boolean; onChange: (changes: Partial<DocumentLine>) => void; onRemove: () => void;
}) {
  const fields = [
    { key: "quantity", label: "Quantity *", min: "0.001", step: "0.001", required: true },
    { key: "unitPrice", label: "Unit price *", min: "0", step: "0.0001", required: true },
    { key: "discount", label: "Discount", min: "0", step: "0.01", required: false },
    { key: "tax", label: "SST amount", min: "0", step: "0.01", required: false },
  ] as const;
  return <section className="p-5 pb-0" aria-label={`Line ${index + 1}`}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3>Line {index + 1}</h3>
      {editable && <button className="btn small" type="button" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>Remove</button>}
    </div>
    <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Product">
        <select value={line.itemId ?? ""} onChange={(event) => {
          const product = products.find(({ id }) => id === event.target.value);
          onChange(product
            ? { itemId: product.id, description: product.name, unitPrice: sales ? product.salePrice : product.purchasePrice }
            : { itemId: null });
        }}>
          <SelectOptions value={line.itemId ?? ""} placeholder="No product" fallback={line.description}
            options={products.map(({ id, name, sku }) => ({ id, label: sku ? `${sku} · ${name}` : name }))} />
        </select>
      </Field>
      <Field label="Description"><input value={line.description} maxLength={500} onChange={(event) => onChange({ description: event.target.value })} /></Field>
      {fields.map(({ key, label, min, step, required }) => <Field key={key} label={label}>
        <input type="number" min={min} step={step} required={required} value={line[key] ?? ""}
          onChange={(event) => onChange({ [key]: event.target.value })} />
      </Field>)}
      <Field label={requiresAccount ? "Account *" : "Account"}>
        <select value={line.accountId ?? ""} required={requiresAccount} onChange={(event) => onChange({ accountId: event.target.value || null })}>
          <SelectOptions value={line.accountId ?? ""} placeholder={requiresAccount ? "Choose an account" : "Use posting rules"}
            options={accounts.map(({ id, code, name }) => ({ id, label: `${code} · ${name}` }))} />
        </select>
      </Field>
    </div>
  </section>;
}

type DocumentFilters = NonNullable<Parameters<typeof listDocuments>[1]>;

async function listAllocationTargets(type: "invoice" | "bill", filters: DocumentFilters) {
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
  const target = ALLOCATES_TO[type];
  const { data, loading, error, refresh } = useResource(async () => {
    if (!target) return [];
    const [typed, scanned] = await Promise.all([
      listAllocationTargets(target, { contactId: contact.id, status: "ready", source: "typed" }),
      acceptsScannedAllocations(type) ? listAllocationTargets(target, { source: "scanned" }) : [],
    ]);
    return [...typed, ...scanned];
  }, `${type}:${contact.id}`);

  const candidates = allocationCandidates(type, contact, data ?? []);
  const rows = new Map(candidates.map((row) => {
    const allocation = { source: row.source, targetId: row.id };
    return [allocationKey(allocation), { ...allocation, number: row.number, outstanding: row.outstanding }];
  }));
  const amounts = new Map(allocations.map((allocation) => [allocationKey(allocation), allocation.amount]));
  for (const allocation of allocations) {
    const key = allocationKey(allocation);
    if (!rows.has(key)) rows.set(key, { ...allocation, number: `Saved target (${allocation.targetId})`, outstanding: undefined });
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
          <td><input type="number" min="0" step="0.01" aria-label={`Allocate amount to ${number} (${sourceLabel(source)})`}
            value={amounts.get(key) ?? ""} onChange={(event) => onChange({ targetId, source, amount: event.target.value })} /></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {!loading && !error && !rows.size && <p className="p-5">No open {target === "invoice" ? "invoices" : "bills"} for this contact.</p>}
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
            {sourceLabel(allocation.source)} target {allocation.targetId} · {money(allocation.amount)}
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
      <StatusBadge status={document.status} />
      {document.posted && <Link href={ledger}>Posted to the ledger</Link>}
      {document.reversalJournalId && <Link href={ledger}>Reversed by journal {document.reversalJournalId}</Link>}
      {hasOutstanding(document.type) && <>
        {document.outstanding != null && <span>Outstanding <strong>{money(document.outstanding)}</strong></span>}
        {document.paymentStatus && <span>Payment status <StatusBadge status={document.paymentStatus} /></span>}
      </>}
    </div>
  </Panel>;
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
      { label: "Time", render: (event) => {
        const time = new Date(event.createdAt.replace(" ", "T"));
        const clock = Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
        return `${formatDate(event.createdAt)} ${clock}`.trim();
      } },
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

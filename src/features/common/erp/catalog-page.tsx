"use client";
import { useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { User } from "@/types";
import { Badge, DataTable, ErrorState, Field, LoadingState, Modal, PageHeader, Panel, type Column } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  DOCUMENT_LABELS, createCatalogEntry, listCatalog, removeCatalogEntry, updateCatalogEntry,
  type CatalogEntry, type DocumentType,
} from "@/lib/api/erp.service";
import { getLedgerAccounts, type LedgerAccount } from "@/lib/api/ledger.service";
import {
  CATALOG_LABELS, CATALOG_SINGULAR, CATALOG_TABS, COMPANY_CURRENCY, CUSTOM_FIELD_LABELS, CUSTOM_FIELD_TYPES, PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_TYPES, accountLabel, accountsOfType, documentTypeLabel, entryToForm, errorMessage, formToInput, isCompanyAdmin,
  numberPreview, parseCatalogTab, removesPermanently, validateCatalogForm, type CatalogForm, type VisibleCatalogKind,
} from "./catalog-logic";
import { effectiveRate, MAX_RATE_PERIODS, normaliseRate, readRatePeriods, validateRatePeriods, type RatePeriod } from "./currency-rates";
import { ProductsPanel } from "./products-panel";
import { PostingAccountsPanel } from "./posting-accounts-panel";

const tabStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex", padding: "14px 0", flexShrink: 0, whiteSpace: "nowrap", fontSize: 12, textDecoration: "none",
  borderBottom: `2px solid ${active ? "var(--color-0)" : "transparent"}`, color: active ? "var(--color-0)" : "#4f6385",
  fontWeight: active ? 600 : undefined,
});

const KIND_HELP: Partial<Record<VisibleCatalogKind, string>> = {
  currency: "MYR is the company currency. Rates are for reference; only MYR documents post to the ledger.",
  tag: "Tags are shared with scanned documents. Deleting a tag removes it.",
  "custom-field": "Custom fields add extra boxes to contacts, products and documents. Deleting a field removes it.",
};

/** Control Panel › Catalog: lists used by sales and purchases, products and services, and default posting accounts. */
export function CatalogPage({ user }: { user: User }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab = parseCatalogTab(params.get("kind"));
  const admin = isCompanyAdmin(user.role);
  return <>
    <PageHeader eyebrow="Control Panel" title="Catalog"
      description="Lists used on sales and purchase documents, your products and services, and where documents post in the ledger." />
    <nav className="tabs" aria-label="Catalog lists">
      {CATALOG_TABS.map((item) => (
        <Link key={item} href={`${pathname}?kind=${item}`} style={tabStyle(item === tab)} aria-current={item === tab ? "page" : undefined}>
          {CATALOG_LABELS[item]}
        </Link>
      ))}
    </nav>
    {tab === "products" ? <ProductsPanel userId={user.id} />
      : tab === "posting-accounts" ? <PostingAccountsPanel canEdit={admin} />
        : <CatalogListPanel key={tab} kind={tab} canEdit={admin} userId={user.id} />}
  </>;
}

function CatalogListPanel({ kind, canEdit, userId }: { kind: VisibleCatalogKind; canEdit: boolean; userId: string }) {
  const permanent = removesPermanently(kind);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<CatalogEntry | "new" | null>(null);
  const [actionError, setActionError] = useState("");
  const { data, error, loading, refresh } = useResource(async () => {
    const [entries, accounts] = await Promise.all([
      listCatalog(kind, showInactive && !permanent),
      kind === "bank-account" ? getLedgerAccounts() : Promise.resolve([] as LedgerAccount[]),
    ]);
    return { entries, accounts };
  }, `erp-catalog:${userId}:${kind}:${showInactive}`);

  const remove = async (entry: CatalogEntry) => {
    const question = permanent
      ? `Delete “${entry.name}”? This cannot be undone.`
      : `Deactivate “${entry.name}”? It will no longer be offered on new documents.`;
    if (!window.confirm(question)) return;
    setActionError("");
    try {
      await removeCatalogEntry(kind, entry.id);
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const columns: Column<CatalogEntry>[] = [...kindColumns(kind), {
    label: "Status", render: (row) => <Badge>{row.isActive ? "ACTIVE" : "INACTIVE"}</Badge>,
  }];
  if (permanent) columns.pop();
  if (canEdit) columns.push({
    label: "Actions", render: (row) => <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button type="button" className="btn small" onClick={() => setEditing(row)}>Edit</button>
      {row.isActive && <button type="button" className="btn small" onClick={() => void remove(row)}>{permanent ? "Delete" : "Deactivate"}</button>}
    </div>,
  });

  return <Panel title={CATALOG_LABELS[kind]}
    subtitle={canEdit ? undefined : "Only a company admin can change these lists."}
    action={<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {!permanent && <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
      </label>}
      {canEdit && <button type="button" className="btn primary" onClick={() => setEditing("new")}>New {CATALOG_SINGULAR[kind]}</button>}
    </div>}>
    <div className="panel-body">
      {KIND_HELP[kind] && <p style={{ marginTop: 0 }}>{KIND_HELP[kind]}</p>}
      {actionError && <div className="notice danger">{actionError}</div>}
    </div>
    <DataTable rows={data.entries} rowKey={(row) => row.id} columns={columns} />
    {editing && <CatalogEntryModal kind={kind} entry={editing === "new" ? null : editing} accounts={data.accounts}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
  </Panel>;
}

const dash = (value: unknown) => (value === undefined || value === null || value === "" ? "—" : String(value));

function kindColumns(kind: VisibleCatalogKind): Column<CatalogEntry>[] {
  const name: Column<CatalogEntry> = { label: "Name", render: (row) => <strong>{row.name}</strong> };
  const code: Column<CatalogEntry> = { label: "Code", render: (row) => dash(row.code) };
  switch (kind) {
    case "payment-term": return [name, code, { label: "Days", render: (row) => dash(row.data.days) }];
    case "payment-method": return [name, {
      label: "Type", render: (row) => PAYMENT_METHOD_LABELS[row.data.type as keyof typeof PAYMENT_METHOD_LABELS] ?? dash(row.data.type),
    }];
    case "currency": {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
      return [
        { label: "Code", render: (row) => <strong>{dash(row.code)}</strong> }, { label: "Name", render: (row) => row.name },
        { label: "Symbol", render: (row) => dash(row.data.symbol) },
        { label: "Default rate (MYR per unit)", render: (row) => dash(row.data.rate) },
        { label: "Rate date", render: (row) => dash(row.data.rateDate) },
        { label: "Rate today", render: (row) => row.code?.toUpperCase() === COMPANY_CURRENCY ? "1" : dash(effectiveRate(row.data, today)) },
      ];
    }
    case "bank-account": return [name, code, { label: "Ledger account", render: (row) => dash(row.ledgerAccountCode) },
      { label: "Account number", render: (row) => dash(row.data.accountNumber) },
      { label: "Bank", render: (row) => dash(row.data.bankName) }];
    case "tag": return [{
      label: "Name", render: (row) => <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 999, background: String(row.data.color ?? "#64748b") }} />
        <strong>{row.name}</strong>
      </span>,
    }];
    case "custom-field": return [{ label: "Label", render: (row) => <strong>{row.name}</strong> },
      { label: "Key", render: (row) => <code>{dash(row.code)}</code> },
      { label: "Field type", render: (row) => CUSTOM_FIELD_LABELS[row.data.fieldType as keyof typeof CUSTOM_FIELD_LABELS] ?? dash(row.data.fieldType) },
      { label: "Options", render: (row) => (Array.isArray(row.data.options) && row.data.options.length ? row.data.options.join(", ") : "—") },
      { label: "Required", render: (row) => (row.data.required === true ? "Yes" : "No") }];
    case "number-format": return [name, { label: "Document type", render: (row) => documentTypeLabel(row.data.documentType) },
      { label: "Example", render: (row) => numberPreview(String(row.data.prefix ?? ""), Number(row.data.padding)) || "—" }];
    default: return [name, code, { label: "Description", render: (row) => dash(row.description) }];
  }
}

function CatalogEntryModal({ kind, entry, accounts, onClose, onSaved }: {
  kind: VisibleCatalogKind; entry: CatalogEntry | null; accounts: LedgerAccount[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<CatalogForm>(() => entryToForm(kind, entry));
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [ratePeriods, setRatePeriods] = useState(() => kind === "currency"
    ? readRatePeriods(entry?.data ?? {}).map((period, id) => ({ ...period, id })) : []);
  const nextRatePeriodId = useRef(ratePeriods.length);
  const currencyErrorId = useId();
  const isCompanyCurrency = form.code.trim().toUpperCase() === COMPANY_CURRENCY;
  const updateRatePeriod = (id: number, changes: Partial<RatePeriod>) => setRatePeriods((current) =>
    current.map((period) => period.id === id ? { ...period, ...changes } : period),
  );
  const addRatePeriod = () => {
    const id = nextRatePeriodId.current++;
    setRatePeriods((current) => [...current, { id, startDate: "", endDate: null, rate: "" }]);
  };
  const set = <K extends keyof CatalogForm>(key: K, value: CatalogForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key: "name" | "code" | "description" | "symbol" | "rate" | "accountNumber" | "bankName" | "prefix" | "padding" | "days" | "options", extra: Record<string, unknown> = {}) =>
    <input value={form[key]} onChange={(e) => set(key, e.target.value)} {...extra} />;
  const assetAccounts = accountsOfType(accounts, "asset");

  const save = async () => {
    const problem = validateCatalogForm(kind, form);
    if (problem) { setFailure(problem); return; }
    const customRates = kind === "currency" ? ratePeriods.map(({ startDate, endDate, rate }) => ({
      startDate, endDate, rate: normaliseRate(rate) ?? "",
    })) : null;
    if (customRates) {
      const rateProblem = isCompanyCurrency && customRates.length
        ? "MYR cannot have rate periods. Its rate is always 1."
        : validateRatePeriods(customRates);
      if (rateProblem) { setFailure(rateProblem); return; }
    }
    setBusy(true); setFailure("");
    try {
      const body = formToInput(kind, form);
      if (customRates) body.data = { ...body.data, customRates };
      if (entry) await updateCatalogEntry(kind, entry.id, body);
      else await createCatalogEntry(kind, body);
      onSaved();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const nameField = <Field label={kind === "custom-field" ? "Label *" : "Name *"}>{input("name", { maxLength: 300 })}</Field>;
  const codeField = <Field label="Code">{input("code", { maxLength: 100 })}</Field>;
  const descriptionField = <Field label="Description"><textarea value={form.description} rows={3} onChange={(e) => set("description", e.target.value)} /></Field>;
  let fields;
  switch (kind) {
    case "payment-term":
      fields = <>{nameField}{codeField}<Field label="Days *" hint="Days after the document date that payment is due (0 to 365).">
        {input("days", { type: "number", min: 0, max: 365, step: 1, inputMode: "numeric" })}</Field></>;
      break;
    case "payment-method":
      fields = <>{nameField}<Field label="Type *"><select value={form.type} onChange={(e) => set("type", e.target.value)}>
        {PAYMENT_METHOD_TYPES.map((type) => <option key={type} value={type}>{PAYMENT_METHOD_LABELS[type]}</option>)}
      </select></Field></>;
      break;
    case "currency":
      fields = <>
        <Field label="Currency code *" hint="Three letters, for example USD.">
          <input value={form.code} maxLength={3} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
        {nameField}
        <Field label="Symbol">{input("symbol", { maxLength: 10 })}</Field>
        <Field label="Default rate (MYR per 1 unit)" hint="Optional. Used when no rate period covers the date.">{input("rate", { inputMode: "decimal", placeholder: "4.470000" })}</Field>
        <Field label={form.rate.trim() ? "Rate date *" : "Rate date"}>
          <input type="date" value={form.rateDate} onChange={(e) => set("rateDate", e.target.value)} /></Field>
        <fieldset disabled={busy} style={{ minWidth: 0, display: "grid", gap: 12 }}>
          <legend>Rate periods</legend>
          {isCompanyCurrency ? <small>MYR is always 1.</small> : <small>Leave the end date blank for an ongoing rate.</small>}
          {ratePeriods.map((period, index) => <fieldset key={period.id} style={{ minWidth: 0 }}>
            <legend>Rate period {index + 1}</legend>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))" }}>
              <Field label="Start date *">
                <input type="date" aria-required="true" value={period.startDate} onChange={(e) => updateRatePeriod(period.id, { startDate: e.target.value })} />
              </Field>
              <Field label="End date">
                <input type="date" value={period.endDate ?? ""} onChange={(e) => updateRatePeriod(period.id, { endDate: e.target.value || null })} />
              </Field>
              <Field label="Rate (MYR per unit) *">
                <input inputMode="decimal" aria-required="true" value={period.rate} onChange={(e) => updateRatePeriod(period.id, { rate: e.target.value })} />
              </Field>
            </div>
            <button type="button" className="btn small" aria-label={`Remove rate period ${index + 1}`}
              onClick={() => setRatePeriods((current) => current.filter((row) => row.id !== period.id))}>Remove</button>
          </fieldset>)}
          <div><button type="button" className="btn small" onClick={addRatePeriod}
            disabled={isCompanyCurrency || ratePeriods.length >= MAX_RATE_PERIODS}>Add rate period</button></div>
        </fieldset>
      </>;
      break;
    case "bank-account":
      fields = <>{nameField}{codeField}
        <Field label="Ledger account *" hint="The asset account in the chart of accounts that this bank account posts to.">
          <select value={form.ledgerAccountId} onChange={(e) => set("ledgerAccountId", e.target.value)}>
            <option value="">Choose an account</option>
            {assetAccounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
          </select></Field>
        {!assetAccounts.length && <p className="notice danger">No asset accounts found. Add one in the chart of accounts first.</p>}
        <Field label="Account number">{input("accountNumber", { maxLength: 60 })}</Field>
        <Field label="Bank name">{input("bankName", { maxLength: 120 })}</Field>
      </>;
      break;
    case "tag":
      fields = <>{nameField}<Field label="Colour"><input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} /></Field></>;
      break;
    case "custom-field":
      fields = <>{nameField}
        <Field label="Key *" hint="Lower-case letters, digits and underscores, starting with a letter, e.g. project_code.">
          <input value={form.code} maxLength={40} onChange={(e) => set("code", e.target.value.toLowerCase())} /></Field>
        <Field label="Field type *"><select value={form.fieldType} onChange={(e) => set("fieldType", e.target.value)}>
          {CUSTOM_FIELD_TYPES.map((type) => <option key={type} value={type}>{CUSTOM_FIELD_LABELS[type]}</option>)}
        </select></Field>
        {form.fieldType === "select" && <Field label="Options *" hint="Separate the choices with commas.">{input("options")}</Field>}
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={form.required} onChange={(e) => set("required", e.target.checked)} /> Required
        </label>
      </>;
      break;
    case "number-format": {
      const preview = numberPreview(form.prefix, form.padding);
      fields = <>{nameField}
        <Field label="Document type *"><select value={form.documentType} onChange={(e) => set("documentType", e.target.value)}>
          {(Object.keys(DOCUMENT_LABELS) as DocumentType[]).map((type) => <option key={type} value={type}>{DOCUMENT_LABELS[type]}</option>)}
        </select></Field>
        <Field label="Prefix *" hint="Up to 10 capital letters, digits or hyphens.">
          <input value={form.prefix} maxLength={10} onChange={(e) => set("prefix", e.target.value.toUpperCase())} /></Field>
        <Field label="Digits *" hint="How many digits the running number has (3 to 8).">
          {input("padding", { type: "number", min: 3, max: 8, step: 1 })}</Field>
        <p>Next numbers will look like <strong>{preview || "—"}</strong></p>
      </>;
      break;
    }
    default:
      fields = <>{nameField}{codeField}{descriptionField}</>;
  }

  const singular = CATALOG_SINGULAR[kind];
  return <Modal title={entry ? `Edit ${singular}` : `New ${singular}`} onClose={onClose}>
    <form aria-describedby={kind === "currency" && failure ? currencyErrorId : undefined} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="panel-body" style={{ maxHeight: "70vh", overflowY: "auto", display: "grid", gap: 12 }}>
        {failure && kind !== "currency" && <div className="notice danger" role="alert">{failure}</div>}
        {fields}
        {entry && !entry.isActive && !removesPermanently(kind) && <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
        </label>}
      </div>
      {failure && kind === "currency" && <div id={currencyErrorId} className="notice danger" role="alert">{failure}</div>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  </Modal>;
}

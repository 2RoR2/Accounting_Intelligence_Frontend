"use client";
import { useState } from "react";
import { Badge, DataTable, ErrorState, Field, LoadingState, Modal, Panel, SearchInput, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { createProduct, deactivateProduct, listProducts, updateProduct, type Product, type ProductKind } from "@/lib/api/erp.service";
import { getLedgerAccounts, type LedgerAccount } from "@/lib/api/ledger.service";
import {
  PRODUCT_KINDS, PRODUCT_KIND_LABELS, accountLabel, accountsOfType, errorMessage, formToProductInput, productToForm,
  validateProductForm, type ProductForm,
} from "./catalog-logic";

/** Products & services: company admins and accountants can both create and edit them. */
export function ProductsPanel({ userId }: { userId: string }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ProductKind | "">("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [actionError, setActionError] = useState("");
  const { data, error, loading, refresh } = useResource(async () => {
    const [products, accounts] = await Promise.all([
      listProducts({ search: search.trim() || undefined, kind: kind || undefined, includeInactive: showInactive }),
      getLedgerAccounts().catch(() => [] as LedgerAccount[]),
    ]);
    return { products, accounts };
  }, `erp-products:${userId}:${search.trim()}:${kind}:${showInactive}`);

  const deactivate = async (product: Product) => {
    if (!window.confirm(`Deactivate “${product.name}”? It will no longer be offered on new documents.`)) return;
    setActionError("");
    try {
      await deactivateProduct(product.id);
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const accountCode = (id?: string | null) => (id ? data.accounts.find((account) => account.id === id)?.code ?? "—" : "—");

  return <Panel title="Products & services"
    action={<button type="button" className="btn primary" onClick={() => setEditing("new")}>New product or service</button>}>
    <div className="panel-body" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <SearchInput value={search} onChange={setSearch} placeholder="Search name or SKU…" />
      <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as ProductKind | "")}>
        <option value="">All kinds</option>
        {PRODUCT_KINDS.map((item) => <option key={item} value={item}>{PRODUCT_KIND_LABELS[item]}</option>)}
      </select>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
      </label>
    </div>
    {actionError && <div className="panel-body"><div className="notice danger">{actionError}</div></div>}
    <DataTable rows={data.products} rowKey={(row) => row.id} columns={[
      { label: "Name", render: (row) => <strong>{row.name}</strong> },
      { label: "SKU", render: (row) => row.sku || "—" },
      { label: "Kind", render: (row) => PRODUCT_KIND_LABELS[row.kind] ?? row.kind },
      { label: "Unit", render: (row) => row.unit },
      { label: "Sale price", render: (row) => money(row.salePrice) },
      { label: "Purchase price", render: (row) => money(row.purchasePrice) },
      { label: "Income account", render: (row) => accountCode(row.incomeAccountId) },
      { label: "Expense account", render: (row) => accountCode(row.expenseAccountId) },
      { label: "Status", render: (row) => <Badge>{row.isActive ? "ACTIVE" : "INACTIVE"}</Badge> },
      { label: "Actions", render: (row) => <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn small" onClick={() => setEditing(row)}>Edit</button>
        {row.isActive && <button type="button" className="btn small" onClick={() => void deactivate(row)}>Deactivate</button>}
      </div> },
    ]} />
    {editing && <ProductModal product={editing === "new" ? null : editing} accounts={data.accounts}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
  </Panel>;
}

function ProductModal({ product, accounts, onClose, onSaved }: {
  product: Product | null; accounts: LedgerAccount[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<ProductForm>(() => productToForm(product));
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const income = accountsOfType(accounts, "income");
  const expense = accountsOfType(accounts, "expense");

  const save = async () => {
    const problem = validateProductForm(form);
    if (problem) { setFailure(problem); return; }
    setBusy(true); setFailure("");
    try {
      const body = formToProductInput(form);
      if (product) await updateProduct(product.id, body);
      else await createProduct(body);
      onSaved();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return <Modal title={product ? "Edit product or service" : "New product or service"} onClose={onClose}>
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="panel-body" style={{ maxHeight: "70vh", overflowY: "auto", display: "grid", gap: 12 }}>
        {failure && <div className="notice danger" role="alert">{failure}</div>}
        <Field label="Name *"><input value={form.name} maxLength={300} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="SKU" hint="Optional. Must be unique.">
          <input value={form.sku} maxLength={120} onChange={(e) => set("sku", e.target.value)} /></Field>
        <Field label="Kind *"><select value={form.kind} onChange={(e) => set("kind", e.target.value as ProductKind)}>
          {PRODUCT_KINDS.map((item) => <option key={item} value={item}>{PRODUCT_KIND_LABELS[item]}</option>)}
        </select></Field>
        <Field label="Unit *" hint="For example unit, hour or kg.">
          <input value={form.unit} maxLength={40} onChange={(e) => set("unit", e.target.value)} /></Field>
        <Field label="Sale price (MYR)">
          <input value={form.salePrice} inputMode="decimal" onChange={(e) => set("salePrice", e.target.value)} /></Field>
        <Field label="Purchase price (MYR)">
          <input value={form.purchasePrice} inputMode="decimal" onChange={(e) => set("purchasePrice", e.target.value)} /></Field>
        <Field label="Income account" hint="Optional. Leave blank to use the default Sales account.">
          <select value={form.incomeAccountId} onChange={(e) => set("incomeAccountId", e.target.value)}>
            <option value="">Default</option>
            {income.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
          </select></Field>
        <Field label="Expense account" hint="Optional. Leave blank to use the default Purchases account.">
          <select value={form.expenseAccountId} onChange={(e) => set("expenseAccountId", e.target.value)}>
            <option value="">Default</option>
            {expense.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
          </select></Field>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  </Modal>;
}

"use client";

/**
 * "Add new customer / supplier / product '<typed text>'" from a combobox on the document form: a small dialog on the
 * existing contact and product APIs. On save the new record is handed back and chosen on the form.
 */
import { useState, type FormEvent } from "react";
import { Field, Modal } from "@/components/common/ui";
import { createContact, createProduct, type Contact, type ContactKind, type Product } from "@/lib/api/erp.service";
import { buildContactInput, contactFormProblems, emptyContactForm } from "@/features/common/contacts/contact-logic";
import { formToProductInput, productToForm, validateProductForm } from "./catalog-logic";
import { Combobox } from "./combobox";
import type { ComboOption } from "./assisted-entry";

function useSubmit<T>(save: () => Promise<T>, done: (value: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent, problem: string | null) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError("");
    try { done(await save()); } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save.");
    } finally { setBusy(false); }
  }
  return { busy, error, submit };
}

export function QuickAddContact({ kind, name, onClose, onCreated }: {
  kind: Extract<ContactKind, "customer" | "supplier">; name: string; onClose: () => void; onCreated: (contact: Contact) => void;
}) {
  const [form, setForm] = useState(() => ({ ...emptyContactForm(kind), legalName: name }));
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const { busy, error, submit } = useSubmit(() => createContact(buildContactInput(form)), onCreated);
  const label = kind === "customer" ? "customer" : "supplier";
  return <Modal title={`New ${label}`} onClose={onClose} closeDisabled={busy}>
    <form onSubmit={(event) => void submit(event, contactFormProblems(form)[0] ?? null)} noValidate>
      {error && <p className="notice danger" role="alert">{error}</p>}
      <Field label="Legal name *"><input required autoFocus maxLength={300} value={form.legalName} onChange={set("legalName")} /></Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Code"><input maxLength={60} value={form.code} onChange={set("code")} /></Field>
        <Field label="Payment terms (days)"><input inputMode="numeric" pattern="\d*" maxLength={3} value={form.paymentTermDays} onChange={set("paymentTermDays")} /></Field>
        <Field label="SSM registration no."><input maxLength={60} value={form.registrationNumber} onChange={set("registrationNumber")} /></Field>
        <Field label="TIN"><input maxLength={40} value={form.tin} onChange={set("tin")} /></Field>
        <Field label="SST no."><input maxLength={40} value={form.sstNumber} onChange={set("sstNumber")} /></Field>
        <Field label="Email"><input type="email" maxLength={200} value={form.email} onChange={set("email")} /></Field>
      </div>
      <Field label="Address"><input maxLength={500} value={form.address} onChange={set("address")} /></Field>
      <p className="text-xs">More details can be added later on the contact page.</p>
      <div className="modal-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : `Add ${label}`}</button>
      </div>
    </form>
  </Modal>;
}

export function QuickAddProduct({ name, sales, taxOptions, onClose, onCreated }: {
  name: string; sales: boolean; taxOptions: readonly ComboOption[]; onClose: () => void; onCreated: (product: Product) => void;
}) {
  const [form, setForm] = useState(() => ({ ...productToForm(null), name }));
  const set = (key: "name" | "sku" | "unit" | "salePrice" | "purchasePrice") => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const { busy, error, submit } = useSubmit(() => createProduct(formToProductInput(form)), onCreated);
  const [first, second] = sales ? (["salePrice", "purchasePrice"] as const) : (["purchasePrice", "salePrice"] as const);
  const priceLabel = { salePrice: "Sale price", purchasePrice: "Purchase price" } as const;
  return <Modal title="New product" onClose={onClose} closeDisabled={busy}>
    <form onSubmit={(event) => void submit(event, validateProductForm(form))} noValidate>
      {error && <p className="notice danger" role="alert">{error}</p>}
      <Field label="Name *"><input required autoFocus maxLength={300} value={form.name} onChange={set("name")} /></Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={priceLabel[first]}><input inputMode="decimal" value={form[first]} onChange={set(first)} /></Field>
        <Field label={priceLabel[second]}><input inputMode="decimal" value={form[second]} onChange={set(second)} /></Field>
        <Field label="SKU"><input maxLength={120} value={form.sku} onChange={set("sku")} /></Field>
        <Field label="Unit"><input maxLength={40} value={form.unit} onChange={set("unit")} /></Field>
        <Field label="Default tax code" hint="A label only; tax is typed on each line">
          <Combobox options={taxOptions} value={form.defaultTaxCode} placeholder="No tax code"
            onChange={(id) => setForm((current) => ({ ...current, defaultTaxCode: id }))} />
        </Field>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Add product"}</button>
      </div>
    </form>
  </Modal>;
}

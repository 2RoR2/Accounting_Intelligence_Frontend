"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DataTable, ErrorState, Field, LoadingState, PageHeader, Panel, StatusBadge, formatDate } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments } from "@/lib/api/document.service";
import {
  contactHistory, deactivateContact, getContact, reactivateContact, updateContact, type Contact,
} from "@/lib/api/erp.service";
import { getLedgerAccounts } from "@/lib/api/ledger.service";
import type { User } from "@/types";
import { buildContactInput, contactFormProblems, contactToForm, historyActionLabel, kindLabel, relatedDocuments, type ContactForm } from "./contact-logic";

const message = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

/** One contact: edit its details, deactivate or reactivate it, and see its history and documents. */
export function ContactDetail({ user, contactId, base }: { user: User; contactId: string; base: string }) {
  const { data, error, loading, refresh, setData } = useResource(async () => {
    const [contact, history, documents] = await Promise.all([
      getContact(contactId),
      contactHistory(contactId).catch(() => null),
      getDocuments(user).catch(() => null),
    ]);
    return { contact, history, documents };
  }, `contact:${user.id}:${contactId}`);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const back = <Link className="back-link" href={`${base}/contacts`}><ArrowLeft size={16} aria-hidden="true" /> Back to contacts</Link>;
  if (loading) return <>{back}<LoadingState variant="form" /></>;
  if (error || !data) return <>{back}<ErrorState message={error || "Unable to load this contact."} retry={refresh} /></>;
  const { contact } = data;
  const related = data.documents ? relatedDocuments(contact, data.documents) : null;

  async function save(form: ContactForm) {
    setNotice("");
    const problems = contactFormProblems(form);
    if (problems.length) { setFailure(problems.join(" ")); return; }
    setBusy(true);
    setFailure("");
    try {
      const changes = {
        ...form,
        defaultExpenseAccountId: form.defaultExpenseAccountId === (contact.defaultExpenseAccountId ?? "")
          ? undefined
          : form.defaultExpenseAccountId,
      };
      const saved = await updateContact(contact.id, buildContactInput(changes, contact.fields));
      setData((current) => (current ? { ...current, contact: saved } : current));
      setNotice("Contact saved.");
      void refresh();
    } catch (reason) {
      setFailure(message(reason, "The contact could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setNotice("");
    setFailure("");
    setBusy(true);
    try {
      const result = contact.isActive ? await deactivateContact(contact.id) : await reactivateContact(contact.id);
      setData((current) => (current ? { ...current, contact: { ...current.contact, isActive: result.isActive } } : current));
      setNotice(result.isActive ? "Contact reactivated." : "Contact deactivated. It stays on past documents but is hidden from the list by default.");
      void refresh();
    } catch (reason) {
      setFailure(message(reason, contact.isActive ? "The contact could not be deactivated." : "The contact could not be reactivated."));
    } finally {
      setBusy(false);
    }
  }

  return <>
    {back}
    <PageHeader
      eyebrow={`${kindLabel(contact.kind)}${contact.isActive ? "" : " · Inactive"}`}
      title={contact.legalName}
      description={contact.code ? `Contact code ${contact.code}` : undefined}
      actions={<button type="button" className={contact.isActive ? "btn danger" : "btn"} disabled={busy} onClick={() => void toggleActive()}>
        {contact.isActive ? "Deactivate" : "Reactivate"}
      </button>}
    />
    {notice && <div className="notice success" role="status">{notice}</div>}
    {failure && <div className="notice danger" role="alert">{failure}</div>}
    {/* Keyed on the saved version so the form shows what the backend stored after each save. */}
    <ContactEditor key={`${contact.id}:${contact.updatedAt}`} contact={contact} busy={busy} onSave={(form) => void save(form)} />
    <Panel title="History" subtitle="Changes made to this contact.">
      {data.history === null
        ? <p className="empty-state">The history could not be loaded.</p>
        : data.history.length
          ? <DataTable rows={data.history} rowKey={(row) => `${row.at}:${row.action}:${row.by}`} columns={[
              { label: "What happened", render: (row) => historyActionLabel(row.action) },
              { label: "Who", render: (row) => row.by || "—" },
              { label: "When", render: (row) => formatDate(row.at) },
            ]} />
          : <p className="empty-state">No changes recorded yet.</p>}
    </Panel>
    <Panel title="Related documents" subtitle={`Documents whose ${contact.kind === "customer" ? "customer" : contact.kind === "supplier" ? "supplier" : "supplier or customer"} name matches this contact.`}>
      {related === null
        ? <p className="empty-state">Documents could not be loaded.</p>
        : related.length
          ? <DataTable rows={related} rowKey={(row) => row.id} columns={[
              { label: "Document", render: (row) => <Link className="text-link" href={`${base}/documents/${encodeURIComponent(row.id)}`}>{row.name}</Link> },
              { label: "Type", render: (row) => row.type },
              { label: "Status", render: (row) => <StatusBadge status={row.status} /> },
              { label: "Uploaded", render: (row) => formatDate(row.createdAt) },
            ]} />
          : <p className="empty-state">No documents linked to this contact yet.</p>}
    </Panel>
  </>;
}

function ContactEditor({ contact, busy, onSave }: { contact: Contact; busy: boolean; onSave: (form: ContactForm) => void }) {
  const [form, setForm] = useState<ContactForm>(() => contactToForm(contact));
  const input = (key: keyof ContactForm, props: { type?: string; inputMode?: "email" | "tel" } = {}) => (
    <input {...props} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
  );
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(form); };

  return <form onSubmit={submit}>
    <Panel title="Basic information">
      <div className="form-grid">
        <Field label="Type" hint="The type cannot be changed after the contact is created.">
          <input value={kindLabel(form.kind)} readOnly disabled />
        </Field>
        <Field label="Legal name *">{input("legalName")}</Field>
        <Field label="Contact code">{input("code")}</Field>
        <Field label="Registration no.">{input("registrationNumber")}</Field>
        <Field label="TIN" hint="Tax identification number.">{input("tin")}</Field>
        <Field label="SST registration no.">{input("sstNumber")}</Field>
        {contact.kind === "supplier" && <DefaultExpenseAccount
          contact={contact}
          value={form.defaultExpenseAccountId ?? ""}
          busy={busy}
          onChange={(defaultExpenseAccountId) => setForm((current) => ({ ...current, defaultExpenseAccountId }))}
        />}
      </div>
    </Panel>
    <Panel title="Contact information">
      <div className="form-grid">
        <Field label="Email">{input("email", { inputMode: "email" })}</Field>
        <Field label="Phone">{input("phone", { type: "tel", inputMode: "tel" })}</Field>
      </div>
    </Panel>
    <Panel title="Address">
      <div className="form-grid">
        <Field label="Street address">{input("address")}</Field>
        <Field label="City">{input("city")}</Field>
        <Field label="Postcode">{input("postcode")}</Field>
        <Field label="State">{input("state")}</Field>
      </div>
    </Panel>
    <Panel title="Other">
      <div className="form-grid">
        <Field label="Remarks">
          <textarea rows={3} value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} />
        </Field>
      </div>
      <div className="modal-actions" style={{ marginTop: 18 }}>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Panel>
  </form>;
}

function DefaultExpenseAccount({ contact, value, busy, onChange }: {
  contact: Contact;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const { data, loading, error, refresh } = useResource(getLedgerAccounts, contact.id);
  const accounts = (data ?? []).filter((account) => account.accountType.toLowerCase() === "expense");
  const savedId = contact.defaultExpenseAccountId;
  const savedLabel = [contact.defaultExpenseAccountCode, contact.defaultExpenseAccountName].filter(Boolean).join(" ") || savedId;
  return <div>
    <Field label="Default expense account" hint="Used when posting this supplier’s scanned bills.">
      <select value={value} disabled={busy || loading || !!error} onChange={(event) => onChange(event.target.value)}>
        <option value="">Use company posting account</option>
        {savedId && !accounts.some((account) => account.id === savedId) && <option value={savedId}>{savedLabel}</option>}
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
      </select>
    </Field>
    {loading && <p role="status">Loading expense accounts…</p>}
    {error && <>
      <p className="notice danger" role="alert">{error}</p>
      <button type="button" className="btn small" disabled={busy} onClick={() => void refresh()}>Retry expense accounts</button>
    </>}
  </div>;
}

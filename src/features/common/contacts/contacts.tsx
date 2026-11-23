"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DataTable, ErrorState, Field, LoadingState, Modal, PageHeader, Panel, SearchInput } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { createContact, listContacts, type ContactKind } from "@/lib/api/erp.service";
import type { User } from "@/types";
import { ContactDetail } from "./contact-detail";
import {
  buildContactInput, CONTACT_KINDS, CONTACT_TABS, contactFormProblems, emptyContactForm, filterByTab, kindLabel,
  type ContactForm, type ContactTab,
} from "./contact-logic";

const contactsBase = (user: User) => (user.role === "LOCAL_ADMIN" ? "/company" : "/workspace");

/** Contacts: one list of customers, suppliers and employees; `contactId` opens one contact. */
export function ContactsPage({ user, contactId }: { user: User; contactId?: string }) {
  const base = contactsBase(user);
  if (contactId) return <ContactDetail user={user} contactId={contactId} base={base} />;
  return <ContactList user={user} base={base} />;
}

function ContactList({ user, base }: { user: User; base: string }) {
  const [tab, setTab] = useState<ContactTab>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  // Ask the backend only once typing pauses.
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, error, loading, refresh } = useResource(
    () => listContacts({ search: appliedSearch || undefined, includeInactive: includeInactive || undefined }),
    `contacts:${user.id}:${appliedSearch}:${includeInactive}`,
  );

  const rows = filterByTab(data ?? [], tab);

  return <>
    <PageHeader
      title="Contacts"
      description="Customers, suppliers and employees in one list. Suppliers here are the ones scanned documents are matched to."
      actions={<button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New contact</button>}
    />
    <Panel>
      <div className="workspace-tabs" role="tablist" aria-label="Contact types">
        {CONTACT_TABS.map(([label, value]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>
      <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, registration no. or email" />
        <label className="review-only-toggle">
          <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} /> Show inactive
        </label>
      </form>
      {loading ? <LoadingState variant="table" />
        : error || !data ? <ErrorState message={error || "Unable to load contacts."} retry={refresh} />
          : <DataTable rows={rows} rowKey={(row) => row.id}
            emptyMessage={appliedSearch || data.length
              ? "No contacts match this view. Change the search or contact type, or select Show inactive."
              : "No contacts yet. Select New contact to add a customer, supplier or employee."}
            columns={[
              { label: "Name", render: (row) => <Link className="text-link" href={`${base}/contacts/${encodeURIComponent(row.id)}`}>{row.legalName}</Link> },
              { label: "Type", render: (row) => <span className="badge neutral"><span className="badge-dot" />{kindLabel(row.kind)}</span> },
              { label: "Code", render: (row) => row.code || "—" },
              { label: "Registration no.", render: (row) => row.registrationNumber || "—" },
              { label: "Email", render: (row) => row.email || "—" },
              { label: "Phone", render: (row) => row.phone || "—" },
              { label: "Status", render: (row) => <span className={`badge ${row.isActive ? "green" : "neutral"}`}><span className="badge-dot" />{row.isActive ? "Active" : "Inactive"}</span> },
            ]} />}
    </Panel>
    {creating && <NewContactModal base={base} initialKind={tab === "all" ? "customer" : tab} onClose={() => setCreating(false)} />}
  </>;
}

function NewContactModal({ base, initialKind, onClose }: { base: string; initialKind: ContactKind; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<ContactForm>(() => emptyContactForm(initialKind));
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof ContactForm) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problems = contactFormProblems(form);
    if (problems.length) { setFailure(problems.join(" ")); return; }
    setSaving(true);
    setFailure("");
    try {
      const created = await createContact(buildContactInput(form));
      router.push(`${base}/contacts/${encodeURIComponent(created.id)}`);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "The contact could not be created.");
      setSaving(false);
    }
  }

  return <Modal title="New contact" onClose={onClose}>
    <form onSubmit={submit}>
      {failure && <div className="notice danger" role="alert">{failure}</div>}
      <div className="form-grid">
        <Field label="Type *">
          <select value={form.kind} onChange={(event) => set("kind")(event.target.value)}>
            {CONTACT_KINDS.map((kind) => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}
          </select>
        </Field>
        <Field label="Legal name *"><input value={form.legalName} onChange={(event) => set("legalName")(event.target.value)} required /></Field>
        <Field label="Contact code"><input value={form.code} onChange={(event) => set("code")(event.target.value)} /></Field>
        <Field label="Registration no."><input value={form.registrationNumber} onChange={(event) => set("registrationNumber")(event.target.value)} /></Field>
        <Field label="Email"><input type="text" inputMode="email" value={form.email} onChange={(event) => set("email")(event.target.value)} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(event) => set("phone")(event.target.value)} /></Field>
      </div>
      <div className="modal-actions" style={{ marginTop: 18 }}>
        <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "Creating…" : "Create"}</button>
      </div>
    </form>
  </Modal>;
}

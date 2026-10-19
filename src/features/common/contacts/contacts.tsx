"use client";

import { useEffect, useState } from "react";
import { getCustomers, getSuppliers } from "@/lib/api/workflow.service";
import type { User } from "@/types";
import { ErrorState, Panel } from "@/components/common/ui";

type Contact = { id: string; name: string; registrationNumber?: string; address?: string };

export function ContactsPage({ user }: { user: User }) {
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getCustomers(), getSuppliers()])
      .then(([customerRows, supplierRows]) => {
        if (!active) return;
        setCustomers(customerRows);
        setSuppliers(supplierRows);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Unable to load contacts."));
    return () => { active = false; };
  }, [user.id]);

  const rows = [
    ...customers.map((contact) => ({ ...contact, type: "Customer" })),
    ...suppliers.map((contact) => ({ ...contact, type: "Supplier" })),
  ];

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">DIRECTORY</p><h1>Contacts</h1><p>Customers and suppliers used for document matching.</p></div>
      </header>
      {error ? <ErrorState message={error} /> : <Panel title={`Customers & suppliers (${rows.length})`} subtitle="Tenant-scoped contact records">
        {rows.length === 0 ? <p className="empty-state">No contacts have been added to this workspace yet.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Registration</th><th>Address</th></tr></thead><tbody>
            {rows.map((contact) => <tr key={`${contact.type}-${contact.id}`}><td><strong>{contact.name}</strong></td><td>{contact.type}</td><td>{contact.registrationNumber || "—"}</td><td>{contact.address || "—"}</td></tr>)}
          </tbody></table></div>
        )}
      </Panel>}
    </>
  );
}

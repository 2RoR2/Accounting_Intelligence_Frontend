"use client";

import { useState, type FormEvent } from "react";
import { ErrorState, Field, LoadingState, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getCompanyProfile, updateCompanyProfile } from "@/lib/api/settings.service";

export function CompanyProfile() {
  const { data, loading, error, refresh, setData } = useResource(getCompanyProfile, "company-profile");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  if (loading) return <LoadingState />;
  if (!data) return <ErrorState message={error} retry={refresh} />;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const updated = await updateCompanyProfile(name);
      setData((current) => current && { ...current, name: updated.name });
      setNotice("Company profile saved.");
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Unable to save company profile.");
    } finally {
      setBusy(false);
    }
  }

  return <Panel title="Company profile">
    <form className="panel-body" onSubmit={save}>
      {failure && <ErrorState message={failure} />}
      {notice && <p role="status">{notice}</p>}
      <Field label="Company name"><input name="name" defaultValue={data.name} required maxLength={200} /></Field>
      <dl className="detail-list">
        <div><dt>Company code</dt><dd>{data.companyCode}</dd></div>
        <div><dt>Registration number</dt><dd>{data.registrationNumber}</dd></div>
        <div><dt>Administrator email</dt><dd>{data.adminEmail}</dd></div>
        <div><dt>Reporting currency</dt><dd>{data.reportingCurrency}</dd></div>
        <div><dt>Currencies in use</dt><dd>{data.observedCurrencies.join(", ")}</dd></div>
      </dl>
      <button className="btn primary" disabled={busy}>Save company profile</button>
    </form>
  </Panel>;
}

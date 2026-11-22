"use client";

import { useState, type FormEvent, type SyntheticEvent } from "react";
import { Badge, DataTable, Field, formatDate, LoadingState, Modal, Panel } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { ApiError } from "@/lib/api/client";
import {
  closeAccountingPeriod,
  createAccountingPeriod,
  getAccountingPeriods,
  reopenAccountingPeriod,
  type AccountingPeriod,
} from "@/lib/api/ledger.service";
import { periodFromMonth } from "./period-month";

type PeriodAction = { kind: "add" } | { kind: "lock" | "reopen"; period: AccountingPeriod };
const titles = { add: "Add period", lock: "Lock period", reopen: "Reopen period" };
const actions = { add: "Save period", lock: "Lock", reopen: "Reopen" };

export function Periods({ canManage }: { canManage: boolean }) {
  const { data, error, refresh, setData } = useResource(getAccountingPeriods, "accounting-periods");
  const [action, setAction] = useState<PeriodAction | null>(null);
  const [month, setMonth] = useState("");
  const [reason, setReason] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const dates = periodFromMonth(month);

  function open(next: PeriodAction) {
    setMonth("");
    setReason("");
    setSaveError("");
    setAction(next);
  }

  function close(event?: SyntheticEvent) {
    if (saving) event?.preventDefault();
    else setAction(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !action || saving) return;
    if (action.kind === "reopen" && !reason.trim()) return;

    setSaving(true);
    setSaveError("");
    try {
      let saved: AccountingPeriod;
      if (action.kind === "lock") {
        saved = await closeAccountingPeriod(action.period.id);
      } else if (action.kind === "reopen") {
        saved = await reopenAccountingPeriod(action.period.id, reason.trim());
      } else if (dates) {
        saved = await createAccountingPeriod(dates);
      } else {
        return;
      }
      setData((current) => [...(current ?? []).filter((period) => period.id !== saved.id), saved]);
      setAction(null);
      void refresh();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Unable to save the period.");
      if (cause instanceof ApiError && cause.status === 409) void refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Periods" action={canManage && data && (
      <button type="button" className="btn primary" onClick={() => open({ kind: "add" })}>Add period</button>
    )}>
      {!data && !error && <LoadingState variant="table" />}
      {error && <div className="panel-body">
        <div className="notice danger" role="alert">{error}</div>
        <button type="button" className="btn" onClick={() => void refresh()}>Try again</button>
      </div>}
      {data && <DataTable
        rows={[...data].sort((a, b) => b.periodCode.localeCompare(a.periodCode))}
        rowKey={(period) => period.id}
        columns={[
          { label: "Month", render: (period) => period.periodCode },
          { label: "Start", render: (period) => formatDate(period.startsOn) },
          { label: "End", render: (period) => formatDate(period.endsOn) },
          { label: "Status", render: (period) => <Badge>{period.status === "open" ? "Open" : "Locked"}</Badge> },
          ...(canManage ? [{
            label: "Actions",
            render: (period: AccountingPeriod) => {
              const kind = period.status === "open" ? "lock" : "reopen";
              return <button type="button" className="btn small" onClick={() => open({ kind, period })}>
                {actions[kind]}
              </button>;
            },
          }] : []),
        ]}
      />}
      {canManage && action && <Modal title={titles[action.kind]} onClose={close}>
        <form onSubmit={save}>
          <div className="panel-body">
            {action.kind === "add" ? <>
              <Field label="Month *">
                <input type="month" required value={month} disabled={saving} onChange={(event) => setMonth(event.target.value)} />
              </Field>
              {dates && <dl className="statement">
                <div className="statement-row"><dt>Period code</dt><dd>{dates.periodCode}</dd></div>
                <div className="statement-row"><dt>Start</dt><dd>{formatDate(dates.startsOn)}</dd></div>
                <div className="statement-row"><dt>End</dt><dd>{formatDate(dates.endsOn)}</dd></div>
              </dl>}
            </> : <p><strong>{action.period.periodCode}</strong></p>}
            {action.kind === "lock" && (
              <p>Locking stops posting, voiding and reversing anything dated in this month. You can reopen it later with a reason.</p>
            )}
            {action.kind === "reopen" && <Field label="Reason *">
              <textarea required maxLength={500} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} />
            </Field>}
            {saveError && <div className="notice danger" role="alert">{saveError}</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" disabled={saving} onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" disabled={
              saving || (action.kind === "add" && !dates) || (action.kind === "reopen" && !reason.trim())
            }>{saving ? "Saving…" : actions[action.kind]}</button>
          </div>
        </form>
      </Modal>}
    </Panel>
  );
}

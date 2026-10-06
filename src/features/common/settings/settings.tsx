"use client";
import { useState } from "react";
import type { User, ValidationRules } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import {
  getValidationRules,
  updateValidationRules,
} from "@/lib/api/document.service";
import { getSettings, saveSettings } from "@/lib/api/settings.service";
import Link from "next/link";
import {
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Panel,
  Toast,
} from "@/components/common/ui";
export function RulesPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(
    () => getValidationRules(user),
    user.id,
  );
  const [edited, setEdited] = useState<ValidationRules>();
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const rules = edited ?? data;
  return (
    <>
      <PageHeader
        eyebrow="COMPANY CONFIGURATION"
        title="Validation rules"
        description="Company-specific checks applied when documents are revalidated."
      />
      <Panel title="Invoice validation">
        <form
          className="panel-body"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await updateValidationRules(user, rules);
              setMessage(
                "Company validation rules saved. Revalidate documents to apply.",
              );
              setFailure("");
            } catch (e) {
              setFailure((e as Error).message);
            }
          }}
        >
          {failure && <ErrorState message={failure} />}
          {(
            [
              ["supplier", "Supplier Required"],
              ["invoice", "Invoice Number Required"],
              ["date", "Invoice Date Required"],
              ["total", "Total Calculation"],
              ["duplicate", "Duplicate Invoice Detection"],
            ] as const
          ).map(([key, label]) => (
            <label className="rule-row" key={key}>
              <span>
                <strong>{label}</strong>
                <small>
                  {rules[key] ? "Enabled" : "Disabled"} for this company
                </small>
              </span>
              <input
                className="switch"
                role="switch"
                type="checkbox"
                checked={rules[key]}
                onChange={(e) =>
                  setEdited({ ...rules, [key]: e.target.checked })
                }
              />
            </label>
          ))}
          <Field label="Low confidence threshold (%)">
            <input
              type="number"
              required
              min="0"
              max="100"
              value={rules.threshold}
              onChange={(e) =>
                setEdited({ ...rules, threshold: Number(e.target.value) })
              }
            />
          </Field>
          <button className="btn primary">Save company rules</button>
        </form>
      </Panel>
      <Toast message={message} />
    </>
  );
}
export function SettingsPage({
  user,
  profile = false,
}: {
  user: User;
  profile?: boolean;
}) {
  const { data, error, loading, refresh } = useResource(
    () => getSettings(user),
    user.id,
  );
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE PREFERENCES"
        title={
          profile
            ? "My profile"
            : user.role === "SUPER_ADMIN"
              ? "System settings"
              : "Company settings"
        }
        description="Manage the preferences displayed in your workspace."
      />
      <div className="two-col">
        <Panel title="Account information">
          <div className="panel-body detail-list">
            {[
              ["Name", user.name],
              ["Company email", user.email],
              ["Role", user.role.replaceAll("_", " ")],
              ["Status", user.status],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </Panel>
        {!profile && (
          <Panel title="Preferences">
            <form
              className="panel-body"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                try {
                  await saveSettings(user, {
                    timezone: String(form.get("timezone")),
                    notifications: String(form.get("notifications")),
                  });
                  setMessage("Workspace preferences saved.");
                } catch (e) {
                  setFailure((e as Error).message);
                }
              }}
            >
              {failure && <ErrorState message={failure} />}
              <Field label="Preferred timezone">
                <select name="timezone" defaultValue={data.timezone}>
                  <option>Asia/Kuala_Lumpur</option>
                  <option>Asia/Singapore</option>
                  <option>UTC</option>
                </select>
              </Field>
              <Field label="Notification preference (no email is sent)">
                <select name="notifications" defaultValue={data.notifications}>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
              <button className="btn primary">Save preferences</button>
            </form>
          </Panel>
        )}
      </div>
      {profile && (
        <Panel title="Change my password">
          <div className="panel-body">
            <p>Verify your email before choosing a new password.</p>
            <Link className="btn primary" href="/forgot-password">Reset my password</Link>
          </div>
        </Panel>
      )}
      <Toast message={message} />
    </>
  );
}

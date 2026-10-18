"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, UserRound } from "lucide-react";
import type { User } from "@/types";
import { updateOwnProfile } from "@/lib/api/user.service";
import { changeOwnPassword, isFrontendMockAuthEnabled, resetPassword } from "@/lib/api/auth.service";
import { ErrorState, Field, PageHeader, Panel, Toast } from "@/components/common/ui";

export function ProfilePage({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!isFrontendMockAuthEnabled) {
      setFailure("Profile avatar changes are disabled pending backend endpoint deployment.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1024 * 1024) {
      setFailure("Choose a JPG, PNG, or WebP image smaller than 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFrontendMockAuthEnabled) {
      setFailure("Profile updates are currently disabled pending Rachel's approved user-profile endpoint.");
      return;
    }
    setBusy(true);
    try {
      await updateOwnProfile(user, name, avatar);
      setFailure("");
      setMessage("Your profile has been updated.");
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }


  return (
    <>
      <PageHeader eyebrow="PERSONAL ACCOUNT" title="My profile" description="Manage your personal details and profile image." />
      <div className="profile-layout">
        <Panel title="Profile details">
          <form className="panel-body profile-form" onSubmit={saveProfile}>
            {failure && <ErrorState message={failure} />}
            <div className="avatar-editor">
              <span className="profile-avatar-large">
                {avatar ? (
                  // Profile avatar is stored as a data: URL — next/image cannot optimize it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="Profile" />
                ) : (
                  <UserRound size={38} />
                )}
              </span>
              <div>
                <strong>Profile image</strong>
                <p>JPG, PNG, or WebP · maximum 1 MB</p>
                <label className="btn small">
                  <Camera size={15} /> Choose image
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} hidden />
                </label>
                {avatar && <button className="text-link danger-text" type="button" onClick={() => setAvatar(undefined)}>Remove</button>}
              </div>
            </div>
            <Field label="Display name *">
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
            </Field>
            <Field label="Company email">
              <input value={user.email} disabled />
            </Field>
            <Field label="Role">
              <input value={user.role.replaceAll("_", " ")} disabled />
            </Field>
            <button
              className="btn primary"
              disabled={busy || !isFrontendMockAuthEnabled}
              title={
                !isFrontendMockAuthEnabled
                  ? "Profile updates disabled pending backend API integration"
                  : undefined
              }
            >
              {!isFrontendMockAuthEnabled
                ? "Save profile (API pending)"
                : busy
                  ? "Saving…"
                  : "Save profile"}
            </button>
            {!isFrontendMockAuthEnabled && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  marginTop: "8px",
                }}
              >
                Self-service profile editing is currently disabled pending backend API endpoint deployment.
              </p>
            )}
          </form>
        </Panel>
        {user.role === "ACCOUNTANT" ? (
          <Panel title="Change password">
            <form
              className="panel-body"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!isFrontendMockAuthEnabled && !user.mustChangePassword) {
                  setFailure(
                    "Password change on active accounts is disabled by security policy. Use the email reset flow to update your credentials.",
                  );
                  return;
                }
                const form = new FormData(event.currentTarget);
                try {
                  await changeOwnPassword(
                    user,
                    String(form.get("password")),
                    String(form.get("confirmation")),
                  );
                  setMessage("Password updated. You will not be asked again at sign-in.");
                  setFailure("");
                  event.currentTarget.reset();
                } catch (error) {
                  setFailure((error as Error).message);
                }
              }}
            >
              <Field
                label="New password *"
                hint="Use uppercase, lowercase, a number, and a symbol. You can change it here any time."
              >
                <input name="password" type="password" autoComplete="new-password" required minLength={8} />
              </Field>
              <Field label="Confirm new password *">
                <input name="confirmation" type="password" autoComplete="new-password" required minLength={8} />
              </Field>
              <button
                className="btn primary"
                disabled={!isFrontendMockAuthEnabled && !user.mustChangePassword}
                title={
                  !isFrontendMockAuthEnabled && !user.mustChangePassword
                    ? "Password changes on active accounts require email reset flow"
                    : undefined
                }
              >
                {!isFrontendMockAuthEnabled && !user.mustChangePassword
                  ? "Change password (Disabled on active session)"
                  : "Change password"}
              </button>
              {!isFrontendMockAuthEnabled && !user.mustChangePassword && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    marginTop: "8px",
                  }}
                >
                  Active session password changes require the email reset flow at sign-in until Rachel&apos;s approved credential update API is released.
                </p>
              )}
            </form>
          </Panel>
        ) : (
          <Panel title="Change my password">
            <form
              className="panel-body"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!isFrontendMockAuthEnabled) {
                  setFailure("Password changes require the email reset flow.");
                  return;
                }
                const form = new FormData(event.currentTarget);
                try {
                  await resetPassword(String(form.get("password")), String(form.get("confirmation")));
                  setMessage("Password change recorded successfully.");
                  event.currentTarget.reset();
                } catch (error) {
                  setFailure((error as Error).message);
                }
              }}
            >
              <Field label="New password *" hint="Use uppercase, lowercase, number, and symbol.">
                <input name="password" type="password" autoComplete="new-password" required minLength={8} />
              </Field>
              <Field label="Confirm new password *">
                <input name="confirmation" type="password" autoComplete="new-password" required minLength={8} />
              </Field>
              <button
                className="btn primary"
                disabled={!isFrontendMockAuthEnabled}
              >
                {!isFrontendMockAuthEnabled
                  ? "Change password (API pending)"
                  : "Change password"}
              </button>
              {!isFrontendMockAuthEnabled && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    marginTop: "8px",
                  }}
                >
                  Password changes require using the email reset flow at sign-in.
                </p>
              )}
            </form>
          </Panel>
        )}

      </div>
      <Toast message={message} />
    </>
  );
}

"use client";
import React, { useState } from "react";
import type { InvitationDelivery } from "@/types";
import { Field, Modal, formatDate } from "@/components/common/ui";

export interface UndeliveredInvitation {
  email: string;
  link: string;
  expiresAt: string;
}

/** The backend builds the link from its own setting; keep only the /activate path and token and use this
 *  site's address, so a hosted copy never hands out a loopback link. */
export function activationUrlForThisSite(url: string, origin: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/activate" && parsed.searchParams.get("token")
      ? new URL(`/activate${parsed.search}`, origin).toString()
      : url;
  } catch {
    return url;
  }
}

/** Returns the link to show once when the email could not be sent; otherwise nothing. */
export function undeliveredInvitation(
  delivery: InvitationDelivery | undefined,
  email: string,
  origin: string,
): UndeliveredInvitation | undefined {
  if (!delivery || delivery.emailSent || !delivery.activationLink) return undefined;
  return { email, link: activationUrlForThisSite(delivery.activationLink, origin), expiresAt: delivery.expiresAt };
}

export function invitationMessage(delivery: InvitationDelivery | undefined, email: string) {
  if (delivery && !delivery.emailSent) return `Invitation created for ${email}, but the email could not be sent.`;
  return `Invitation email sent to ${email}.`;
}

/** Shows an activation link exactly once, after the email failed. Nothing is stored. */
export function InvitationLinkModal({ invitation, onClose }: { invitation: UndeliveredInvitation; onClose: () => void }) {
  const [copyMessage, setCopyMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Select the link and copy it manually.");
    }
  }

  return (
    <Modal title="Email not sent: copy the activation link" onClose={onClose}>
      <div className="panel-body">
        <p>
          The invitation for <strong>{invitation.email}</strong> was created, but the email could not be delivered.
          Send this link to them privately. It works once and expires {formatDate(invitation.expiresAt)}.
        </p>
        <Field label="Activation link" hint="Copy it now. It will not be shown again; use Resend to issue a new one.">
          <input value={invitation.link} readOnly onFocus={(event) => event.target.select()} />
        </Field>
        <p role="status">{copyMessage}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Done</button>
          <button type="button" className="btn primary" onClick={() => void copy()}>Copy link</button>
        </div>
      </div>
    </Modal>
  );
}

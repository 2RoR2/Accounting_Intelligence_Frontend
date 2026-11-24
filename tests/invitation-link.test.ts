import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compiles JSX with the classic runtime; the shared UI kit (Modal) relies on Next's automatic one.
(globalThis as { React?: typeof React }).React = React;
import {
  InvitationLinkModal,
  activationUrlForThisSite,
  invitationMessage,
  undeliveredInvitation,
} from "../src/features/common/users/invitation-link";

const failed = { emailSent: false, activationLink: "http://localhost:3000/activate?token=abc_DEF-123", expiresAt: "2026-12-01T10:00:00+00:00" };
const sent = { emailSent: true, activationLink: null, expiresAt: "2026-12-01T10:00:00+00:00" };

test("an activation link is rebased onto this site so a hosted copy never shows a loopback link", () => {
  assert.equal(activationUrlForThisSite(failed.activationLink, "https://accordai.example"),
    "https://accordai.example/activate?token=abc_DEF-123");
  // Anything that is not an activation link is left alone.
  assert.equal(activationUrlForThisSite("https://other.example/share/x", "https://accordai.example"), "https://other.example/share/x");
  assert.equal(activationUrlForThisSite("not a url", "https://accordai.example"), "not a url");
});

test("the copy-once link appears only when the email failed", () => {
  assert.equal(undeliveredInvitation(sent, "a@x.example", "https://accordai.example"), undefined);
  assert.equal(undeliveredInvitation(undefined, "a@x.example", "https://accordai.example"), undefined);
  assert.deepEqual(undeliveredInvitation(failed, "a@x.example", "https://accordai.example"), {
    email: "a@x.example", link: "https://accordai.example/activate?token=abc_DEF-123", expiresAt: failed.expiresAt,
  });
  assert.equal(invitationMessage(sent, "a@x.example"), "Invitation email sent to a@x.example.");
  assert.match(invitationMessage(failed, "a@x.example"), /could not be sent/);
});

test("the modal shows the link read-only with a copy button and says it will not be shown again", () => {
  const invitation = undeliveredInvitation(failed, "a@x.example", "https://accordai.example")!;
  const html = renderToStaticMarkup(createElement(InvitationLinkModal, { invitation, onClose: () => {} }));
  assert.match(html, /value="https:\/\/accordai\.example\/activate\?token=abc_DEF-123"/);
  assert.match(html, /readOnly|readonly/);
  assert.match(html, /Copy link/);
  assert.match(html, /will not be shown again/);
  assert.match(html, /a@x\.example/);
});

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, Modal, PageHeader, Panel } from "@/components/common/ui";
import type { User } from "@/types";
import {
  KIND_LABEL, actionIsRunnable, describeAction, draftClipboardText, groupByKind, isLink, resolveEvidenceHref,
  type InboxAction, type InboxDraft, type InboxItem,
} from "./inbox-contract";
import type { InboxState, PendingAccept } from "./inbox-flow";
import { inboxFlow, useInbox } from "./use-inbox";
// Styles: src/styles/ai-inbox.css, imported by both route-content files (a stylesheet cannot load under the node test runner).

export function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch { /* fall through to the textarea copy */ }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return Promise.resolve(ok);
  } catch { return Promise.resolve(false); }
}

/** A drafted email: shown for the person to copy into their own mail program. This app has no way to send it. */
export function DraftBlock({ draft, copy = copyToClipboard }: { draft: InboxDraft; copy?: (text: string) => Promise<boolean> }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return <div className="ai-draft">
    {(draft.to || draft.subject) && <dl className="ai-draft-head">
      {draft.to && <><dt>To</dt><dd>{draft.to}</dd></>}
      {draft.subject && <><dt>Subject</dt><dd>{draft.subject}</dd></>}
    </dl>}
    <pre className="ai-draft-body">{draft.body}</pre>
    <div className="ai-draft-actions">
      <button type="button" className="btn small" onClick={() => void copy(draftClipboardText(draft)).then((ok) => setState(ok ? "copied" : "failed"))}>
        {state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {state === "copied" ? "Copied" : "Copy"}
      </button>
      <small role="status">{state === "failed" ? "Could not copy. Select the text and copy it yourself." : "Nothing is sent from here. Copy it into your own email."}</small>
    </div>
  </div>;
}

export function InboxCard({ item, prefix, busy, onAccept, onDismiss }: {
  item: InboxItem; prefix: string; busy: boolean;
  onAccept: (item: InboxItem, action: InboxAction) => void; onDismiss: (item: InboxItem) => void;
}) {
  // A draft has nothing to accept: Copy is its only action. The backend also lists COPY and MAILTO for it; this app
  // shows its own Copy button and never opens a mail program, so only page links are taken from the list.
  const runnable = item.draft ? [] : item.actions.filter((action) => !isLink(action) && action.method !== "COPY" && action.method !== "MAILTO");
  const links = item.actions.filter(isLink).map((action) => ({ action, href: resolveEvidenceHref(action.path, prefix) })).filter((entry) => entry.href);
  return <article className="ai-card" aria-label={item.title} data-kind={item.kind} data-severity={item.severity}>
    <h3><span className={`ai-sev is-${item.severity}`}>{item.severity}</span>{item.title}</h3>
    {item.why && <p className="ai-why"><strong>Why: </strong>{item.why}</p>}
    {item.basis.length > 0 && <p className="ai-basis" aria-label="Why this match was chosen">{item.basis.map((entry) => <span key={entry}>{entry}</span>)}</p>}
    {item.evidence.length > 0 && <ul className="ai-evidence" aria-label="Evidence">
      {item.evidence.map((entry, index) => {
        const href = resolveEvidenceHref(entry.href, prefix);
        return <li key={`${entry.label}-${index}`}>
          <span>{entry.label}</span>
          {href ? <Link href={href}>{entry.value || "Open"}</Link> : <strong>{entry.value}</strong>}
        </li>;
      })}
    </ul>}
    {item.draft && <DraftBlock draft={item.draft} />}
    <div className="ai-card-actions">
      {runnable.map((action) => <div className="ai-action" key={`${action.method}-${action.path}-${action.label}`}>
        <span>{action.label}</span>
        <button type="button" className="btn primary small" disabled={busy || !actionIsRunnable(action)} aria-label={`Accept: ${action.label}`}
          onClick={() => onAccept(item, action)}>Accept</button>
      </div>)}
      {links.map(({ action, href }) => <Link key={`${action.path}-${action.label}`} className="btn small" href={href!}>{action.label}</Link>)}
      <button type="button" className="btn small" disabled={busy} onClick={() => onDismiss(item)}>Dismiss</button>
    </div>
  </article>;
}

/** The confirm step: names every call, in order, before anything runs. */
export function ConfirmAcceptDialog({ pending, userName, onConfirm, onCancel }: {
  pending: PendingAccept; userName?: string; onConfirm: () => void; onCancel: () => void;
}) {
  const { headline, confirm, calls, details, followUps } = describeAction(pending.action);
  return <Modal title="Confirm before running" onClose={onCancel} closeDisabled={pending.running}>
    <div className="ai-confirm">
      <p>You are about to run this{userName ? ` as ${userName}` : " as yourself"}:</p>
      <p className="ai-confirm-action"><strong>{headline}</strong></p>
      {confirm && <p className="ai-confirm-text">{confirm}</p>}
      <p className="ai-confirm-call"><span>{calls.length === 1 ? "This calls" : "These calls run in order, and stop at the first one that fails:"}</span></p>
      <ol className="ai-confirm-calls" aria-label="Calls that will run">{calls.map((call, index) => <li key={`${call}-${index}`}><code>{call}</code></li>)}</ol>
      {details.length > 0 && <ul className="ai-confirm-details" aria-label="What will be sent">{details.map((line) => <li key={line}>{line}</li>)}</ul>}
      {followUps > 0 && <p><small>{followUps} follow-up {followUps === 1 ? "call" : "calls"} after the first.</small></p>}
      <p><small>For: {pending.item.title}</small></p>
      {pending.error && <div role="alert" className="ai-confirm-error"><strong>That did not work.</strong> {pending.error}</div>}
      <div className="ai-confirm-buttons">
        <button type="button" className="btn" disabled={pending.running} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={pending.running} onClick={onConfirm}>
          {pending.running ? "Running…" : pending.error ? "Try again" : "Yes, run it"}
        </button>
      </div>
    </div>
  </Modal>;
}

export interface InboxViewProps {
  state: InboxState; prefix: string; userName?: string;
  onRetry: () => void; onAccept: (item: InboxItem, action: InboxAction) => void; onConfirm: () => void; onCancel: () => void;
  onDismiss: (item: InboxItem) => void;
}

/** The page without its data source, so every state can be rendered and tested. */
export function InboxView({ state, prefix, userName, onRetry, onAccept, onConfirm, onCancel, onDismiss }: InboxViewProps) {
  const groups = groupByKind(state.items);
  return <>
    <PageHeader eyebrow="AI INBOX" title="AI Inbox"
      description="Suggestions for you to accept or dismiss. Nothing runs until you confirm it, and no email is ever sent from here."
      actions={<button type="button" className="btn" onClick={onRetry} disabled={state.phase === "loading"}>Refresh</button>} />
    {state.phase === "off" && <Panel><EmptyState message="The AI assistant is not turned on for this workspace." /></Panel>}
    {(state.phase === "idle" || state.phase === "loading") && <LoadingState />}
    {state.phase === "error" && <ErrorState message={state.error} retry={onRetry} />}
    {state.phase === "ready" && <>
      {state.notice && <div className="ai-notice" role="status"><Check size={16} aria-hidden="true" /> {state.notice}</div>}
      {state.error && <ErrorState message={state.error} retry={onRetry} />}
      {state.items.length === 0
        ? <Panel><EmptyState message="Nothing to review. The assistant has no suggestions right now." /></Panel>
        : groups.map((group) => <section className="ai-group" key={group.kind} aria-label={KIND_LABEL[group.kind].title}>
          <div className="ai-group-head"><h2><Sparkles size={16} aria-hidden="true" /> {KIND_LABEL[group.kind].title} <span className="ai-group-count">{group.items.length}</span></h2>
            <p>{KIND_LABEL[group.kind].hint}</p></div>
          {group.items.map((item) => <InboxCard key={item.id} item={item} prefix={prefix} busy={state.dismissing.has(item.id)}
            onAccept={onAccept} onDismiss={onDismiss} />)}
        </section>)}
    </>}
    {state.pending && <ConfirmAcceptDialog pending={state.pending} userName={userName} onConfirm={onConfirm} onCancel={onCancel} />}
  </>;
}

export function AiInboxPage({ user }: { user: User }) {
  const state = useInbox();
  const prefix = user.role === "LOCAL_ADMIN" ? "company" : "workspace";
  useEffect(() => { void inboxFlow.refresh(); }, []);
  return <InboxView state={state} prefix={prefix} userName={user.name}
    onRetry={() => void inboxFlow.refresh()}
    onAccept={(item, action) => { inboxFlow.requestAccept(item, action); }}
    onConfirm={() => void inboxFlow.confirm()} onCancel={() => inboxFlow.cancel()}
    onDismiss={(item) => void inboxFlow.dismiss(item.id)} />;
}

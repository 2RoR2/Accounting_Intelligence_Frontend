"use client";
import Link from "next/link";
import { ArrowUpRight, FileText, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { FALLBACK_NOTE, formatFactValue, safeHref, splitAnswer } from "./assistant-logic";
import type { AssistantAnswer, AssistantFact } from "./types";

/**
 * How one answer is drawn. Everything the model wrote is a plain string rendered as React text, so React escapes it:
 * there is no Markdown, no HTML and no `dangerouslySetInnerHTML` anywhere in the panel. A link is drawn only from an
 * href the server sent and `safeHref` accepted (an in-app path); nothing is built from a record id here.
 */

function Chip({ fact, inline, onNavigate }: { fact: AssistantFact; inline?: boolean; onNavigate?: () => void }) {
  const href = safeHref(fact.href);
  const value = formatFactValue(fact);
  const body: ReactNode = inline
    ? <strong>{value}</strong>
    : <><span className="ask-chip-label">{fact.label}</span><strong>{value}</strong></>;
  const className = `ask-chip${inline ? " is-inline" : ""}${href ? "" : " is-static"}`;
  if (!href) return <span className={className} title={fact.label}>{body}</span>;
  return (
    <Link href={href} className={className} title={`${fact.label}: open the record`} aria-label={`${fact.label}: ${value}. Open the record.`} onClick={onNavigate}>
      {body}
      <ArrowUpRight size={13} aria-hidden="true" className="ask-chip-arrow" />
    </Link>
  );
}

export function FactChip(props: { fact: AssistantFact; inline?: boolean; onNavigate?: () => void }) {
  return <Chip {...props} />;
}

export function SourcesList({ citations, onNavigate }: { citations: AssistantAnswer["citations"]; onNavigate?: () => void }) {
  if (!citations.length) return null;
  return (
    <section className="ask-sources" aria-label="Sources">
      <h4>Sources</h4>
      <ul>
        {citations.map((citation, index) => {
          const href = safeHref(citation.href);
          return (
            <li key={`${citation.label}-${index}`}>
              <FileText size={13} aria-hidden="true" />
              {href
                ? <Link href={href} onClick={onNavigate}>{citation.label}<ArrowUpRight size={12} aria-hidden="true" /></Link>
                : <span>{citation.label}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AnswerView({ answer, onNavigate, onAsk, disabled }: {
  answer: AssistantAnswer;
  onNavigate?: () => void;
  /** A follow-up suggestion was chosen. */
  onAsk?: (question: string) => void;
  disabled?: boolean;
}) {
  const { segments, loose } = splitAnswer(answer.answer, answer.facts);
  const refused = answer.refused;
  return (
    <article className={`ask-answer${refused ? " is-refused" : ""}${answer.fallback ? " is-fallback" : ""}`} aria-label={refused ? "AccordAI cannot help with this" : "AccordAI answer"}>
      {refused && (
        <p className="ask-refusal-head"><ShieldAlert size={15} aria-hidden="true" /> I can&apos;t help with that here</p>
      )}
      <p className="ask-text">
        {segments.map((segment, index) => segment.type === "text"
          ? <span key={index}>{segment.text}</span>
          : <Chip key={index} fact={segment.fact} inline onNavigate={onNavigate} />)}
      </p>
      {loose.length > 0 && (
        <ul className="ask-facts" aria-label="Figures from your books">
          {loose.map((fact) => <li key={fact.id}><Chip fact={fact} onNavigate={onNavigate} /></li>)}
        </ul>
      )}
      <SourcesList citations={answer.citations} onNavigate={onNavigate} />
      {(answer.fallback || answer.auditId) && (
        <footer className="ask-answer-foot">
          {answer.fallback && (
            <span className="ask-badge" title="The AI model was unavailable or busy, so this answer was put together from your reports by fixed rules.">
              <Info size={12} aria-hidden="true" /> {FALLBACK_NOTE}
            </span>
          )}
          {answer.auditId && <span className="ask-audit" title="Every answer is logged, with the figures it used.">Logged · ref {answer.auditId.slice(0, 8)}</span>}
        </footer>
      )}
      {answer.suggestions.length > 0 && onAsk && (
        <div className="ask-followups" role="group" aria-label={refused ? "Things you can ask" : "Follow-up questions"}>
          {answer.suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="ask-followup" disabled={disabled} onClick={() => onAsk(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}
    </article>
  );
}

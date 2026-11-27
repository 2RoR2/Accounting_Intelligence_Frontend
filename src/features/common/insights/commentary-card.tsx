"use client";

import React from "react";
import Link from "next/link";
import { MessageSquareText, Sparkles } from "lucide-react";
import { ErrorState, formatDate } from "@/components/common/ui";
import type { Commentary, CommentaryResult } from "./insights-api";
import { formatFact, resolveHref } from "./insights-data";

/**
 * The AI month-end commentary. Everything the model wrote is rendered as plain text (React escapes it; there is no
 * HTML rendering anywhere in this card), and every figure is a fact chip whose value comes from the fact table the
 * backend computed, linked to the report or record it came from.
 */
export function FactChips({ commentary, factIds, base }: { commentary: Commentary; factIds: string[]; base: string }) {
  const chips = factIds.flatMap((id) => commentary.facts.find((fact) => fact.id === id) ?? []);
  if (chips.length === 0) return null;
  return <ul className="ins-chips" aria-label="Figures cited">
    {chips.map((fact) => {
      const href = resolveHref(fact.href, base);
      const body = <><span>{fact.label}</span><strong>{formatFact(fact)}</strong></>;
      return <li key={fact.id}>{href
        ? <Link className="ins-chip" href={href} title={`Open the source of ${fact.label}`}>{body}</Link>
        : <span className="ins-chip">{body}</span>}</li>;
    })}
  </ul>;
}

export function CommentaryBody({ commentary, base, onExplain }: { commentary: Commentary; base: string; onExplain: () => void }) {
  return <section className="ins-commentary" aria-labelledby="ins-commentary-title">
    <div className="ins-commentary-head">
      <div>
        <div className="ins-badges">
          <span className="ins-ai-mark"><Sparkles size={14} aria-hidden="true" /> AI</span>
          {commentary.fallback
            ? <span className="ins-badge warn" title="The AI model was not used. This text was written from a fixed template over the same figures.">Template, not AI</span>
            : <span className="ins-badge">Draft commentary: review before sending</span>}
          {commentary.partialPeriod && <span className="ins-badge">Month to date</span>}
        </div>
        <h2 id="ins-commentary-title">AI month-end commentary</h2>
      </div>
      <button type="button" className="btn ins-explain" onClick={onExplain}>
        <MessageSquareText size={16} aria-hidden="true" /> Explain this report
      </button>
    </div>
    {commentary.paragraphs.length === 0
      ? <p className="ins-footnote">There is nothing to comment on for this month yet.</p>
      : commentary.paragraphs.map((paragraph, index) => <div className="ins-paragraph" key={index}>
        <p>{paragraph.text}</p>
        <FactChips commentary={commentary} factIds={paragraph.factIds} base={base} />
      </div>)}
    <p className="ins-footnote">
      {commentary.label ? `${commentary.label} ` : ""}
      {commentary.generatedAt ? `Written ${formatDate(commentary.generatedAt)}. ` : ""}
      Every figure is a posted-record figure; select a chip to open its source.
    </p>
  </section>;
}

/** Loading, failure and the switched-off case. When the AI features are off nothing at all is drawn. */
export function CommentarySection({ result, loading, error, retry, base, onExplain }: {
  result: CommentaryResult | undefined;
  loading: boolean;
  error: string;
  retry: () => void;
  base: string;
  onExplain: () => void;
}) {
  if (result?.status === "off") return null;
  if (loading) return <section className="ins-commentary" aria-busy="true" aria-label="AI month-end commentary">
    <div className="ins-skeleton wide" /><div className="ins-skeleton" /><div className="ins-skeleton" />
  </section>;
  if (!result) return <section className="ins-commentary" aria-label="AI month-end commentary">
    <ErrorState message={error || "The commentary could not be loaded."} retry={retry} />
  </section>;
  return <CommentaryBody commentary={result.commentary} base={base} onExplain={onExplain} />;
}

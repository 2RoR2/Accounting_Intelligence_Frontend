"use client";

import { useState } from "react";
import type { CheckFinding } from "@/lib/api/checks.service";
import "@/styles/document-checks.css";
import { canApply, findingKey, partitionFindings, summaryLabel } from "./checks-logic";

const SEVERITY_LABEL = { block: "Fix", warn: "Check", info: "Note" } as const;

/**
 * The findings for the form as it is now. Each says what is wrong and how to fix it; a click jumps to the field or
 * line. Apply sets a suggested value only when the user presses it; Ignore hides a finding for this session.
 */
export function ChecksPanel({ findings, ignored, loading, error, stale, editable, onJump, onApply, onIgnore, onRestore, onRetry }: {
  findings: readonly CheckFinding[]; ignored: ReadonlySet<string>; loading: boolean; error: string; stale: boolean; editable: boolean;
  onJump: (finding: CheckFinding) => void; onApply: (finding: CheckFinding) => void; onIgnore: (finding: CheckFinding) => void;
  onRestore: (finding: CheckFinding) => void; onRetry: () => void;
}) {
  const [showIgnored, setShowIgnored] = useState(false);
  const { open, ignored: hidden } = partitionFindings(findings, ignored);
  const worst = open.some((f) => f.severity === "block") ? "block" : open.some((f) => f.severity === "warn") ? "warn" : "ok";
  return <section className={`checks-panel checks-${worst}`} aria-label="Checks" aria-busy={loading}>
    <header className="checks-head">
      <h2>Checks</h2>
      <span role="status" aria-live="polite">
        {loading ? "Checking…" : error ? "Checks unavailable" : summaryLabel(open)}{stale && !loading ? " (updating)" : ""}
      </span>
      {error && <button type="button" className="btn small" onClick={onRetry}>Try again</button>}
    </header>
    {error && <p className="checks-note">{error} Saving is not affected.</p>}
    {!error && open.length === 0 && !loading && <p className="checks-note">
      Complete is not the same as correct: these checks flag what looks wrong; you decide what to change.</p>}
    {open.length > 0 && <ul className="checks-list">
      {open.map((finding) => <li key={findingKey(finding)} className={`check-item check-${finding.severity}`}>
        <span className="check-badge">{SEVERITY_LABEL[finding.severity]}</span>
        <div className="check-body">
          <button type="button" className="check-message" onClick={() => onJump(finding)}
            title={finding.field === "company" ? "Company details are set under Settings" : "Go to the field"}>
            {finding.message}
          </button>
          <p className="check-fix">{finding.howToFix}</p>
          {finding.suggestion && !canApply(finding.suggestion) && <p className="check-fix">Expected: {finding.suggestion.label}.</p>}
          {editable && <div className="check-actions">
            {canApply(finding.suggestion) && <button type="button" className="btn small primary" onClick={() => onApply(finding)}>
              Apply: {finding.suggestion?.label}</button>}
            {finding.severity !== "block" && <button type="button" className="btn small" onClick={() => onIgnore(finding)}>Ignore</button>}
          </div>}
        </div>
      </li>)}
    </ul>}
    {hidden.length > 0 && <div className="checks-ignored">
      <button type="button" className="btn small" aria-expanded={showIgnored} onClick={() => setShowIgnored((shown) => !shown)}>
        {showIgnored ? "Hide" : "Show"} {hidden.length} ignored</button>
      {showIgnored && <ul className="checks-list">
        {hidden.map((finding) => <li key={findingKey(finding)} className="check-item check-ignored">
          <div className="check-body"><span>{finding.message}</span>
            <div className="check-actions"><button type="button" className="btn small" onClick={() => onRestore(finding)}>Show again</button></div>
          </div>
        </li>)}
      </ul>}
    </div>}
  </section>;
}

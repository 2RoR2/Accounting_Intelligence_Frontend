"use client";

import { Check, FileText, ScanLine, Sparkles, UserRound } from "lucide-react";

const STEPS = [
  { label: "Scan", title: "A paper invoice bends into view.", copy: "Drop the document into the workspace and let the intake flow begin.", icon: FileText },
  { label: "Extract", title: "A scan reveals every field.", copy: "Supplier, date, line items, and total are surfaced without retyping.", icon: ScanLine },
  { label: "Review", title: "A person stays in control.", copy: "Exceptions are highlighted clearly so questionable data never slips through.", icon: UserRound },
  { label: "Record", title: "The dashboard updates.", copy: "Approved information becomes one standard, export-ready accounting record.", icon: Sparkles },
] as const;

export function WorkflowStory() {
  return (
    <section className="workflow-story" aria-labelledby="workflow-story-title">
      <div className="workflow-story-intro">
        <p className="hp-eyebrow">The flow in motion</p>
        <h2 id="workflow-story-title">From paper to <span>trusted record.</span></h2>
        <p className="hp-copy">Every handoff is visible. Scroll through the journey a finance team takes from the first scan to a confident approval.</p>
      </div>
      <div className="workflow-rail">
        <div className="workflow-line" aria-hidden="true" />
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <article className="workflow-step" key={step.label}>
              <div className="workflow-marker"><Icon size={19} /><span>0{index + 1}</span></div>
              <div className="workflow-card">
                <p className="workflow-kicker">{step.label}</p>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                {index === 1 && <div className="workflow-fields" aria-label="Extracted invoice fields"><span>Supplier <b>Atlas Office Supplies</b></span><span>Total <b>RM 800.00</b></span></div>}
                {index === 2 && <div className="workflow-review"><span><i />Total matches line items</span><strong><Check size={14} /> Approved</strong></div>}
                {index === 3 && <div className="workflow-record"><span>INV-2026-00821</span><strong>Ready to export</strong></div>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

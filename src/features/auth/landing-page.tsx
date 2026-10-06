"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, FileCheck, FileText, Gauge, Receipt, Scan, ShieldAlert } from "lucide-react";

const MODULES = [
  { id: "platform", name: "Platform" },
  { id: "documents", name: "Documents" },
  { id: "exceptions", name: "Exceptions" },
  { id: "records", name: "Records" },
  { id: "reports", name: "Reports" },
] as const;

const NAV = ["Platform", "Documents", "Exceptions", "Records", "Reports"] as const;

const FEATURES = [
  {
    title: "Field extraction",
    copy: "Reads supplier, date, line items, and total from invoices, bills, and receipts so the team stops typing them in.",
    mark: "Target ≥ 95% on the pilot set",
    icon: Scan,
  },
  {
    title: "Validation and exceptions",
    copy: "Checks that the amounts agree, then sends every mismatch to a person. Nothing questionable becomes a record on its own.",
    mark: "Exception rate under 10%",
    icon: ShieldAlert,
  },
  {
    title: "Standardised records",
    copy: "Turns a checked document into one accounting record shape, ready for a downstream system without rework.",
    mark: "Manual entry cut by about 70%",
    icon: FileCheck,
  },
  {
    title: "Speed and volume",
    copy: "Measures how fast and how accurately the workspace handles documents, including many submitted at the same time.",
    mark: "About 20 seconds a document",
    icon: Gauge,
  },
] as const;

const STEPS = [
  ["Upload", "The document comes in as an invoice, a bill, or a receipt. This is the only manual step before extraction starts."],
  ["Extract", "The system pulls the accounting fields: who billed you, the date, each line, and the total."],
  ["Validate", "Those fields are checked against each other. A total that does not add up, or a missing value, fails here."],
  ["Review", "Failed documents become exceptions. They go to the right person, and every correction stays on the document."],
  ["Standardise", "A document that passes is written as one record, with the same fields every time."],
  ["Export", "The standardised record can leave the workspace. Tax filing, payment, and a live ledger are out of scope."],
] as const;

const SHEETS = [
  {
    kind: "Invoice",
    kicker: "Demo invoice",
    title: "Supplier invoice, checked.",
    partyLabel: "Supplier",
    party: "Atlas Office Supplies",
    refLabel: "Invoice no.",
    ref: "INV-2026-00821",
    lines: [["Office supplies", "RM 480.00"], ["Printer toner", "RM 320.00"]],
    total: "RM 800.00",
    status: "Validated",
    icon: FileText,
  },
  {
    kind: "Bill",
    kicker: "Demo bill",
    title: "Utility bill, standardised.",
    partyLabel: "Biller",
    party: "Sarawak Energy",
    refLabel: "Bill no.",
    ref: "BILL-2026-01442",
    lines: [["Electricity usage", "RM 186.40"], ["Service charge", "RM 12.00"]],
    total: "RM 198.40",
    status: "Ready",
    icon: FileCheck,
  },
  {
    kind: "Receipt",
    kicker: "Demo receipt",
    title: "Counter receipt, extracted.",
    partyLabel: "Merchant",
    party: "Kuching Stationery",
    refLabel: "Receipt no.",
    ref: "RCP-2026-00391",
    lines: [["A4 paper", "RM 24.50"], ["Binding", "RM 8.00"]],
    total: "RM 32.50",
    status: "Extracted",
    icon: Receipt,
  },
] as const;

function ModuleScreen({ id }: { id: (typeof MODULES)[number]["id"] }) {
  const title = {
    platform: ["SAIC", "Companies and account limits."],
    documents: ["Intake", "Invoices, bills, and receipts."],
    exceptions: ["Review", "Items that need a person."],
    records: ["Ledger", "Records in one standard shape."],
    reports: ["Performance", "How processing is going."],
  }[id];
  const stats = {
    platform: [["Companies", "2"], ["Seats", "12"], ["Pending", "1"]],
    documents: [["Uploaded", "18"], ["Extracting", "3"], ["Ready", "15"]],
    exceptions: [["Open", "7"], ["Today", "2"], ["Rate", "8%"]],
    records: [["Ready", "31"], ["Exported", "20"], ["Currency", "MYR"]],
    reports: [["Accuracy", "96%"], ["Time", "12s"], ["Volume", "42"]],
  }[id];
  const lines = {
    platform: ["ABC Sdn Bhd approved", "XYZ Sdn Bhd pending", "Seat limit set"],
    documents: ["INV-2026-00821 extracted", "Receipt batch uploaded", "Supplier field checked"],
    exceptions: ["Total does not match", "Supplier missing", "Sent to the owner"],
    records: ["Office supplies standardised", "Ready to export", "Change kept on the record"],
    reports: ["Pilot accuracy holding", "Under 20 seconds", "Concurrent uploads ok"],
  }[id];
  return (
    <div className="hp-dash">
      <div className="hp-dash-top">
        <span className="hp-lights" aria-hidden="true"><i /><i /><i /></span>
        <span>Accounting Intelligence workspace</span>
        <span className="hp-ready">Ready</span>
      </div>
      <div className="hp-dash-body">
        <aside>
          <p className="hp-label">Workspace</p>
          {NAV.map((name) => (
            <p key={name} className={name.toLowerCase() === id ? "on" : ""}>{name}</p>
          ))}
        </aside>
        <div className="hp-dash-main">
          <div className="hp-dash-head">
            <div>
              <p className="hp-kicker">{title[0]}</p>
              <p className="hp-dash-title">{title[1]}</p>
            </div>
            <span className="hp-avatar">AT</span>
          </div>
          <div className="hp-stats">
            {stats.map(([label, value]) => (
              <p key={label}><span>{label}</span><strong>{value}</strong><em>Updated just now</em></p>
            ))}
          </div>
          <div className="hp-lower">
            <div>
              <p className="hp-panel-title">{id === "reports" || id === "platform" ? "Processing volume" : "In this module"} <span>Now</span></p>
              <div className="hp-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
            <div>
              <p className="hp-panel-title">Latest <span>Live</span></p>
              <ul>
                {lines.map((line, index) => (
                  <li key={line}><i className={index === 0 ? "a" : index === 1 ? "b" : "c"} />{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [moduleIndex, setModuleIndex] = useState(2);
  const [switchKey, setSwitchKey] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const dragX = useRef(0);

  function showSheet(next: number) {
    setSheetIndex((next + SHEETS.length) % SHEETS.length);
  }

  function showModule(next: number) {
    setModuleIndex((next + MODULES.length) % MODULES.length);
    setSwitchKey((key) => key + 1);
  }

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setModuleIndex((current) => (current + 1) % MODULES.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [switchKey]);

  return (
    <div className="home-wash">
      <header className="hp-header">
        <Link href="/" className="hp-brand">
          Accounting
          <span>Intelligence.</span>
        </Link>
        <nav>
          <Link href="/help">Help</Link>
          <Link href="/request-access" className="hp-register">Register company</Link>
          <Link href="/login" className="hp-login">Log in</Link>
        </nav>
      </header>
      <main>
        <section className="hp-hero">
          <div>
            <p className="hp-eyebrow">Company accounting intelligence</p>
            <p className="hp-quiet">SAIC secure · auditable · built for finance teams</p>
            <h1>From invoice to <span>trusted record.</span></h1>
            <p className="hp-lead">AI-driven invoice processing and automated record standardisation</p>
            <p className="hp-copy">
              Invoices, bills, and receipts become checked accounting records. Extraction, validation, exception review, and a standard record shape sit in one workspace — without posting to a live ledger.
            </p>
            <div className="hp-actions">
              <Link href="/login" className="hp-btn dark">Enter your workspace</Link>
              <Link href="/request-access" className="hp-btn light">Register company</Link>
              <a href="#workspace" className="hp-btn text">Get started</a>
            </div>
          </div>
          <div className="record-stage">
            <p className="record-chip">
              <span className="record-chip-mark" aria-hidden="true"><Check size={13} strokeWidth={2.6} /></span>
              {SHEETS[sheetIndex].kind} sample · no tax fields
            </p>
            <div className="record-deck">
              {SHEETS.map((sheet, index) => {
                const place = (index - sheetIndex + SHEETS.length) % SHEETS.length;
                const Icon = sheet.icon;
                const front = place === 0;
                return (
                  <article
                    key={sheet.kind}
                    className="record-sheet"
                    data-place={place}
                    aria-hidden={front ? undefined : true}
                    role={front ? "button" : undefined}
                    tabIndex={front ? 0 : undefined}
                    aria-label={front ? `Show the next sample. Current sample is the ${sheet.kind.toLowerCase()}.` : undefined}
                    onClick={front ? () => showSheet(sheetIndex + 1) : undefined}
                    onKeyDown={front ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        showSheet(sheetIndex + 1);
                      }
                    } : undefined}
                  >
                    <div className="record-row">
                      <span className="record-mark" aria-hidden="true"><Icon size={20} strokeWidth={2.2} /></span>
                      <span className="record-status"><i />{sheet.status}</span>
                    </div>
                    <p className="record-kicker">{sheet.kicker}</p>
                    <h2>{sheet.title}</h2>
                    <dl className="record-meta">
                      <div><dt>{sheet.partyLabel}</dt><dd>{sheet.party}</dd></div>
                      <div><dt>{sheet.refLabel}</dt><dd>{sheet.ref}</dd></div>
                    </dl>
                    <div className="record-lines">
                      {sheet.lines.map(([label, amount]) => (
                        <p key={label}><span>{label}</span><strong>{amount}</strong></p>
                      ))}
                      <p className="total"><span>Total amount</span><strong>{sheet.total}</strong></p>
                    </div>
                    <p className="record-ready"><Check size={16} strokeWidth={2.6} />Extracted. Checked. No tax calculation.</p>
                  </article>
                );
              })}
              <button type="button" className="record-next" aria-label="Next sample" onClick={() => showSheet(sheetIndex + 1)}>
                <ChevronRight size={18} strokeWidth={2.4} />
              </button>
            </div>
            <div className="record-pager" role="tablist" aria-label="Document samples">
              {SHEETS.map((sheet, index) => (
                <button key={sheet.kind} type="button" className={index === sheetIndex ? "on" : ""} aria-pressed={index === sheetIndex} onClick={() => showSheet(index)}>
                  {sheet.kind}
                </button>
              ))}
            </div>
            <aside className="record-accuracy">
              <span className="record-scan" aria-hidden="true"><Scan size={16} strokeWidth={2.2} /></span>
              <p><strong>96.4%</strong><span>Illustrative extraction accuracy</span></p>
            </aside>
          </div>
        </section>

        <section className="hp-block" aria-labelledby="modules-title">
          <p className="hp-eyebrow">Modules</p>
          <h2 id="modules-title">A general look across the workspace.</h2>
          <p className="hp-copy">The open card stays in the centre and moves every 4 seconds.</p>
          <div
            className="stack"
            onPointerDown={(event) => { dragX.current = event.clientX; }}
            onPointerUp={(event) => {
              const delta = event.clientX - dragX.current;
              if (delta > 48) showModule(moduleIndex - 1);
              if (delta < -48) showModule(moduleIndex + 1);
            }}
          >
            {MODULES.map((item, index) => {
              let slot = index - moduleIndex;
              if (slot > MODULES.length / 2) slot -= MODULES.length;
              if (slot < -MODULES.length / 2) slot += MODULES.length;
              const place = slot === -1 || slot === 0 || slot === 1 ? String(slot) : "hide";
              return (
                <article key={item.id} data-slot={place} className="stack-card">
                  <ModuleScreen id={item.id} />
                </article>
              );
            })}
          </div>
          <div className="stack-nav">
            <button type="button" aria-label="Previous module" onClick={() => showModule(moduleIndex - 1)}>←</button>
            <div role="tablist" aria-label="Module pages">
              {MODULES.map((item, index) => (
                <button key={item.id} type="button" className={index === moduleIndex ? "on" : ""} aria-label={item.name} aria-pressed={index === moduleIndex} onClick={() => showModule(index)} />
              ))}
            </div>
            <button type="button" className="next" aria-label="Next module" onClick={() => showModule(moduleIndex + 1)}>→</button>
          </div>
        </section>

        <section id="workspace" className="hp-block">
          <p className="hp-eyebrow">What the system does</p>
          <h2>From a document to a record you can trust.</h2>
          <p className="hp-copy">Four jobs cover the project: read the document, check it, standardise it, and show whether the system is fast and accurate enough.</p>
          <div className="hp-cards two">
            {FEATURES.map((item, index) => (
              <article key={item.title} className="plain-card">
                <div className="card-top"><span>0{index + 1}</span><item.icon size={18} aria-hidden="true" /></div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <strong>{item.mark}</strong>
              </article>
            ))}
          </div>
        </section>

        <section id="process" className="hp-block">
          <p className="hp-eyebrow">The six steps</p>
          <h2>What each step is for.</h2>
          <p className="hp-copy">A document only becomes a standardised record after these six steps. The later ones exist so a bad extraction is never treated as finished.</p>
          <ol className="hp-cards three">
            {STEPS.map(([name, detail], index) => (
              <li key={name} className="plain-card">
                <span>Step 0{index + 1}</span>
                <h3>{name}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="hp-block">
          <div className="brand-gradient">
            <p className="hp-eyebrow light">Ready to try the workspace?</p>
            <h2>Clean extraction. Checked records. A standard you can export.</h2>
            <div className="hp-actions">
              <Link href="/request-access" className="hp-btn light">Register company</Link>
              <Link href="/login" className="hp-btn ghost">Sign in</Link>
              <Link href="/help" className="hp-btn text light">Help</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="hp-footer">
        <div>
          <p className="hp-footer-title">Accounting Intelligence</p>
          <p>AI-driven invoice processing and automated record standardisation. A SAIC proof of concept for finance teams.</p>
        </div>
        <div>
          <p className="hp-eyebrow">On this page</p>
          <a href="#workspace">What the system does</a>
          <a href="#process">The six steps</a>
          <Link href="/request-access">Register a company</Link>
          <Link href="/help">Help</Link>
        </div>
        <div>
          <p className="hp-eyebrow">In scope</p>
          <p>Ingestion, field extraction, validation, exception review, standardised records, and performance. Not tax filing, payment, or a live general ledger.</p>
        </div>
        <small>SAIC · Accounting Intelligence</small>
      </footer>
    </div>
  );
}

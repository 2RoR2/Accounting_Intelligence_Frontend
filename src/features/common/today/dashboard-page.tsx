"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, FileSearch, Files, HandCoins,
  Landmark, Plus, Receipt, Search, ShieldAlert, Send, type LucideIcon,
} from "lucide-react";
import { ErrorState, LoadingState, StatusBadge, formatDate } from "@/components/common/ui";
import { MalaysiaDayNight } from "@/components/common/dashboard/malaysia-day-night";
import { useResource } from "@/features/common/hooks/use-resource";
import { getHomeSummary } from "@/lib/api/home.service";
import { getDocuments } from "@/lib/api/document.service";
import { DASHBOARD_REFRESH_MS, dashboardView, firstName, greetingFor, pollWhileVisible } from "@/lib/dashboard";
import { documentKindLabel } from "@/lib/glossary";
import { areaFor, monthEndView, type TileId, type TodayRole, type TodayTileView } from "@/lib/today";
import type { User } from "@/types";

const ICONS: Record<TileId, LucideIcon> = {
  toReview: FileSearch, needsFixing: ShieldAlert, readyToApprove: ClipboardCheck, waitingApproval: Send,
  bankToMatch: Landmark, billsDueSoon: CalendarClock, billsOverdue: AlertTriangle, invoicesOverdue: HandCoins,
  journalsToPost: Receipt,
};

const documentAction = (status: string) => {
  if (status === "FAILED") return "See problem";
  if (["EXTRACTED", "IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(status)) return "Review";
  if (["UPLOADED", "QUEUED", "PROCESSING"].includes(status)) return "Check progress";
  return "View record";
};

/** A headline number: the whole card opens the list it counts. */
function Kpi({ tile }: { tile: TodayTileView }) {
  const Icon = ICONS[tile.id];
  const unavailable = tile.tone === "unavailable";
  const body = <>
    <span className="dash-kpi-icon" aria-hidden><Icon size={18} /></span>
    <span className="dash-kpi-label">{tile.title}</span>
    <strong className="dash-kpi-value">{unavailable ? "–" : tile.value}</strong>
    <small className="dash-kpi-caption">{unavailable ? tile.value : tile.caption || tile.nextStep}</small>
  </>;
  return tile.href && !unavailable
    ? <Link className={`dash-kpi dash-tone-${tile.tone}`} href={tile.href} aria-label={`${tile.title}: ${tile.value}`}>{body}</Link>
    : <div className={`dash-kpi dash-tone-${tile.tone}`}>{body}</div>;
}

/** One row of "Attention needed", in the team's style: icon, what it is, what to do, arrow. */
function AttentionRow({ tile }: { tile: TodayTileView }) {
  const Icon = ICONS[tile.id];
  const unavailable = tile.tone === "unavailable";
  const content = <>
    <span className={`dash-row-icon dash-tone-${tile.tone}`} aria-hidden><Icon size={18} /></span>
    <span className="dash-row-text">
      {unavailable
        ? <strong>{tile.title}: <span className="dash-row-unknown">{tile.value.toLowerCase()}</span></strong>
        : <strong><b>{tile.value}</b> {tile.title.toLowerCase()}</strong>}
      <small>{unavailable ? tile.details[0] ?? "" : tile.caption}</small>
    </span>
    <ArrowRight size={18} aria-hidden className="dash-row-arrow" />
  </>;
  return tile.href
    ? <Link className="dash-attention-row" href={tile.href}>{content}</Link>
    : <div className="dash-attention-row">{content}</div>;
}

function MoneyCard({ tile }: { tile: TodayTileView }) {
  const Icon = ICONS[tile.id];
  const inner = <>
    <span className={`dash-money-icon dash-tone-${tile.tone}`} aria-hidden><Icon size={16} /></span>
    <span className="dash-money-label">{tile.title}</span>
    <strong className="dash-money-value">{tile.value}</strong>
    <small>{tile.caption || tile.nextStep}</small>
  </>;
  return tile.href && tile.tone === "attention"
    ? <Link className="dash-money" href={tile.href} title={tile.details.join(" ")}>{inner}</Link>
    : <div className="dash-money" title={tile.details.join(" ")}>{inner}</div>;
}

/** The Dashboard: the team's greeting banner and layout, with Today's figures (B3) and month-end progress. */
export function DashboardPage({ user }: { user: User }) {
  const role: TodayRole = user.role === "LOCAL_ADMIN" ? "LOCAL_ADMIN" : "ACCOUNTANT";
  const base = `/${areaFor(role)}`;
  const summary = useResource(() => getHomeSummary(user), `dashboard:${user.id}`);
  const recent = useResource(() => getDocuments(user).catch(() => []), `dashboard-docs:${user.id}`);
  const refreshSummary = summary.refresh;
  const refreshRecent = recent.refresh;
  // An open Dashboard stays current: refresh every 30 s while the tab is visible, and on return to it.
  useEffect(() => pollWhileVisible(() => { void refreshSummary(); void refreshRecent(); }, DASHBOARD_REFRESH_MS, document),
    [refreshSummary, refreshRecent]);
  if (summary.loading) return <LoadingState variant="dashboard" />;
  if (summary.error || !summary.data) return <ErrorState message={summary.error} retry={summary.refresh} />;

  const view = dashboardView(summary.data, role);
  const month = monthEndView(summary.data, role);
  const hour = Number(new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", hour12: false }).format(new Date()));
  const company = (user.tenantName || "").split("—")[0].trim();
  const docs = (recent.data ?? []).slice(0, 6);

  return (
    <div className="dashboard-page dash-home">
      <header className="workspace-dashboard-header dashboard-reference-header">
        <MalaysiaDayNight />
        <div>
          <span className="workspace-dashboard-kicker">{formatDate(summary.data.asOf)}{company ? ` · ${company}` : ""}</span>
          <h1>{greetingFor(hour % 24)}, {firstName(user.name)}</h1>
          <p className="dash-headline">{view.headline}</p>
        </div>
        <div className="workspace-dashboard-actions">
          <Link className="btn" href={`${base}/documents`}><Search size={15} aria-hidden /> Search documents</Link>
          <Link className="btn primary" href={`${base}/upload`}><Plus size={15} aria-hidden /> Upload documents</Link>
        </div>
      </header>

      <section className="dash-kpis" aria-label="Today in numbers">
        {view.kpis.map((tile) => <Kpi key={tile.id} tile={tile} />)}
      </section>

      <div className="dash-columns">
        <section className="dash-card" aria-labelledby="dash-attention-title">
          <div className="dash-card-head">
            <div><h2 id="dash-attention-title">Attention needed</h2><p>Your work for today, in the order to do it.</p></div>
          </div>
          {view.attention.length > 0 && <div className="dash-attention-list">{view.attention.map((tile) => <AttentionRow key={tile.id} tile={tile} />)}</div>}
          {view.allClear && <p className="dash-all-clear"><CheckCircle2 size={18} aria-hidden /> Nothing needs you right now.</p>}
        </section>

        <section className="dash-card" aria-labelledby="dash-month-title">
          <div className="dash-card-head">
            <div><h2 id="dash-month-title">{month.title}</h2><p>Month-end progress for the whole company.</p></div>
          </div>
          {month.available ? (
            <ol className="dash-month">
              {month.steps.map((step) => (
                <li key={step.key} className={step.complete ? "complete" : ""} title={step.details.join(" ")}>
                  <div className="dash-month-row">
                    {step.href ? <Link href={step.href}>{step.label}</Link> : <span>{step.label}</span>}
                    <strong>{step.complete ? <><CheckCircle2 size={14} aria-hidden /> Done</> : step.value}</strong>
                  </div>
                  <div className={`dash-progress${step.percent === null ? " dash-progress-none" : ""}`} role="progressbar" aria-label={step.label}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={step.percent ?? 0}>
                    <span style={{ width: `${step.percent ?? 0}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="dash-muted" title={month.details.join(" ")}>Month-end figures are not available yet.</p>}
        </section>
      </div>

      <section className="dash-card" aria-labelledby="dash-money-title">
        <div className="dash-card-head">
          <div><h2 id="dash-money-title">Money due</h2><p>Unpaid amounts from approved bills and invoices.</p></div>
          <Link className="btn" href={`${base}/records`}>Standardised Records <ArrowRight size={14} aria-hidden /></Link>
        </div>
        <div className="dash-money-grid">{view.money.map((tile) => <MoneyCard key={tile.id} tile={tile} />)}</div>
      </section>

      <section className="dash-card workspace-documents-card" aria-labelledby="dash-recent-title">
        <div className="dash-card-head">
          <div><h2 id="dash-recent-title">Recent documents</h2><p>The latest documents you can work on.</p></div>
          <Link className="btn" href={`${base}/documents`}>View all <ArrowRight size={14} aria-hidden /></Link>
        </div>
        <div className="workspace-document-table">
          <div className="workspace-document-row workspace-document-head"><span>Document</span><span>Type</span><span>Uploaded</span><span>Status</span><span>Action</span></div>
          {docs.map((doc) => (
            <Link className="workspace-document-row" key={doc.id} href={`${base}/documents/${doc.id}`}>
              <strong><Files size={15} aria-hidden />{doc.name}</strong>
              <span>{documentKindLabel(doc.type)}</span>
              <span>{formatDate(doc.createdAt)}</span>
              <StatusBadge status={doc.status} />
              <span className="document-row-action">{documentAction(doc.status)} <ArrowRight size={13} aria-hidden /></span>
            </Link>
          ))}
          {!docs.length && <div className="workspace-document-empty">{recent.loading ? "Loading documents…" : "No documents yet. Upload an invoice, bill or receipt to begin."}</div>}
        </div>
      </section>
    </div>
  );
}

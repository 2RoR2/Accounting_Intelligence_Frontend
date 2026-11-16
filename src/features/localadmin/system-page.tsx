"use client";

import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "@/types";
import type { BankMoneyTransaction } from "@/types/money";
import { useResource } from "@/features/common/hooks/use-resource";
import { getDocuments } from "@/lib/api/document.service";
import { getMoneyTransactions } from "@/lib/api/money.service";
import { getProcessingHealth, getTrends } from "@/lib/api/processing.service";
import { ErrorState, LoadingState, PageHeader, StatusBadge, formatDate } from "@/components/common/ui";

/**
 * Admin-only: how document reading is running for this company. These panels used to sit on the
 * accountant and local-admin dashboards; accountants do not need them to do their work.
 */
function SystemPanel({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return <section className={`dashboard-widget dashboard-widget-${id}`} aria-label={title}>
    <div className="dashboard-widget-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
    {children}
  </section>;
}

const queueBackendText = (backend?: string) =>
  backend === "inline" ? "Inside the app service (no separate queue)" : backend ? backend : "Separate worker queue";

export function SystemPage({ user }: { user: User }) {
  const { data, error, loading, refresh } = useResource(async () => {
    const optional = <T,>(request: Promise<T>, fallback: T) => request.catch(() => fallback);
    const [docs, health, trends, moneyIn, moneyOut] = await Promise.all([
      getDocuments(user),
      optional(getProcessingHealth(), null),
      optional(getTrends("week"), []),
      optional(getMoneyTransactions(user, "money_in"), [] as BankMoneyTransaction[]),
      optional(getMoneyTransactions(user, "money_out"), [] as BankMoneyTransaction[]),
    ]);
    return { docs, health, trends, bank: [...moneyIn, ...moneyOut] };
  }, `${user.id}:system`);

  if (loading) return <LoadingState variant="dashboard" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;

  const { docs, health, trends } = data;
  const queued = docs.filter((doc) => ["UPLOADED", "QUEUED"].includes(doc.status)).length;
  const active = docs.filter((doc) => doc.status === "PROCESSING").length;
  const failed = docs.filter((doc) => doc.status === "FAILED").length;
  const review = docs.filter((doc) => ["EXTRACTED", "IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(doc.status)).length;
  const saved = docs.filter((doc) => ["COMPLETED", "STANDARDISED"].includes(doc.status)).length;
  const oldestWaiting = docs.filter((doc) => ["UPLOADED", "QUEUED", "PROCESSING"].includes(doc.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const maxProcessed = Math.max(1, ...trends.map((point) => point.processed));
  const averageProcessed = trends.length ? Math.round(trends.reduce((sum, point) => sum + point.processed, 0) / trends.length) : 0;
  const weekTotal = trends.reduce((sum, point) => sum + point.processed, 0);
  const flagged = data.bank.filter((row) => row.anomaly?.isAnomaly)
    .sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()).slice(0, 6);
  const largestFlagged = Math.max(1, ...flagged.map((row) => Number(row.amount) || 0));

  return <div className="dashboard-page system-page">
    <PageHeader eyebrow="ADMIN ONLY" title="System"
      description="How document reading is running for this company. Accountants do not need this page to do their work."
      actions={<button type="button" className="btn" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button>} />

    <div className="dashboard-widget-grid">
      <div className="dashboard-widget-slot">
        <SystemPanel id="service" title="Processing service" subtitle="Whether uploaded documents are being read">
          {health ? <div className="widget-health-diagram">
            <div><strong><StatusBadge status={health.status === "healthy" ? "ACTIVE" : "WARNING"} /></strong><span>{health.status === "healthy" ? "Running normally" : "Not running normally"}</span></div>
            <div><strong>{health.worker ? "Yes" : "No"}</strong><span>Reader running</span></div>
            <div><strong>{health.pendingJobs}</strong><span>Waiting or being read</span></div>
            {health.workers != null && <div><strong>{health.busyWorkers ?? 0} / {health.workers}</strong><span>Readers busy</span></div>}
          </div> : <div className="widget-empty">Service status is not available right now.</div>}
          {health && <details className="system-details"><summary>Details</summary><dl>
            <dt>Queue</dt><dd>{queueBackendText(health.queueBackend)}</dd>
            <dt>Redis</dt><dd>{health.redis === "not_used" ? "Not used" : health.redis}</dd>
            <dt>Raw status</dt><dd>{health.status}</dd>
          </dl></details>}
        </SystemPanel>
      </div>

      <div className="dashboard-widget-slot">
        <SystemPanel id="health" title="Document pipeline" subtitle="Where every document is right now">
          <div className="widget-health-diagram">
            <div><strong>{queued}</strong><span>Waiting to be read</span></div>
            <div><strong>{active}</strong><span>Reading now</span></div>
            <div><strong>{review}</strong><span>With accountants</span></div>
            <div><strong>{saved}</strong><span>Saved to records</span></div>
          </div>
          <div className="widget-health-line"><i /><i /><i /><i /></div>
          <p className="widget-health-note">{oldestWaiting ? `Oldest waiting: ${formatDate(oldestWaiting.createdAt)}` : "Nothing is waiting to be read."}</p>
          <Link className="widget-inline-link" href="/company/documents">{failed} could not be read <ArrowRight size={15} /></Link>
        </SystemPanel>
      </div>

      <div className="dashboard-widget-slot">
        <SystemPanel id="activity" title="Reading attempts" subtitle="Attempts per day this week, including retries">
          {trends.length ? <div className="processing-visual">
            <div className="processing-visual-top"><strong>{weekTotal}</strong><span>Total this week</span><span className="processing-legend"><i /> Read <i className="failed" /> Failed (included)</span></div>
            <div className="processing-chart-shell">
              <div className="processing-y-axis"><span>{maxProcessed}</span><span>{Math.round(maxProcessed * .66)}</span><span>{Math.round(maxProcessed * .33)}</span><span>0</span></div>
              <div className="processing-visual-chart">
                {[maxProcessed, Math.round(maxProcessed * .66), Math.round(maxProcessed * .33), 0].map((tick) => <i className="processing-gridline" key={tick} style={{ bottom: `${(tick / maxProcessed) * 100}%` }} />)}
                <div className="processing-average" style={{ bottom: `${Math.max(8, (averageProcessed / maxProcessed) * 100)}%` }}><span>Avg. {averageProcessed}</span></div>
                {trends.map((point) => <div className="processing-bar-wrap" key={point.day}>
                  <span className="processing-bar" role="img" style={{ height: `${Math.max(12, (point.processed / maxProcessed) * 100)}%` }} aria-label={`${point.day}: ${point.processed} attempts, ${point.failed ?? 0} failed`} title={`${point.day}: ${point.processed} attempts, ${point.failed ?? 0} failed`} />
                  <strong>{point.processed}</strong><span>{point.day}</span>
                </div>)}
              </div>
            </div>
          </div> : <div className="widget-empty">Attempts appear here after documents are read.</div>}
        </SystemPanel>
      </div>

      <div className="dashboard-widget-slot">
        <SystemPanel id="transaction-insights" title="Unusual bank amounts" subtitle="Imported bank lines whose amount stands out">
          <div className="transaction-insights-note">Checks the amount only. Duplicates and unusual frequency are not checked.</div>
          {flagged.length ? <div className="transaction-insights-list">{flagged.map((row) => {
            const directionPath = row.direction === "money_in" ? "money-in" : "money-out";
            const width = Math.max(10, ((Number(row.amount) || 0) / largestFlagged) * 100);
            return <Link className="transaction-insight-row" key={row.id} href={`/company/${directionPath}?transaction=${encodeURIComponent(row.id)}`}>
              <span className="transaction-insight-main"><strong>{row.description || "Bank transaction"}</strong><small>{row.postedDate || "Date not recorded"} · {row.direction === "money_in" ? "Money in" : "Money out"}</small><i><em style={{ width: `${width}%` }} /></i></span>
              <span className="transaction-insight-amount">{row.currency ?? "MYR"} {Number(row.amount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<ArrowRight size={15} /></span>
            </Link>;
          })}</div> : <div className="widget-empty">No unusual amounts have been flagged.</div>}
        </SystemPanel>
      </div>

      <div className="dashboard-widget-slot">
        <SystemPanel id="actions" title="More system pages" subtitle="Measurements of the reading engine">
          <div className="widget-actions">
            <Link href="/company/performance">Processing performance <ArrowRight size={16} /></Link>
            <Link href="/company/evaluation">Reading accuracy evaluation <ArrowRight size={16} /></Link>
            <Link href="/company/validation-overview">Checks overview <ArrowRight size={16} /></Link>
          </div>
        </SystemPanel>
      </div>
    </div>
  </div>;
}

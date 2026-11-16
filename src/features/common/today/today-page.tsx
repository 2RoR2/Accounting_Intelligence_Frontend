"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ErrorState, LoadingState, PageHeader, Panel, formatDate } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getHomeSummary } from "@/lib/api/home.service";
import { monthEndView, todayTiles, type TodayRole, type TodayTileView } from "@/lib/today";
import type { User } from "@/types";

function Details({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <details className="today-details">
      <summary>Details</summary>
      <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
    </details>
  );
}

function Tile({ tile }: { tile: TodayTileView }) {
  const body = (
    <>
      <span className="today-tile-title">{tile.title}</span>
      <span className="today-tile-value">{tile.value}</span>
      {tile.caption && <span className="today-tile-caption">{tile.caption}</span>}
    </>
  );
  return (
    <article className={`today-tile today-tile-${tile.tone}`} aria-label={tile.title}>
      {tile.href && tile.tone !== "clear"
        ? <Link className="today-tile-main" href={tile.href}>{body}<ArrowRight size={16} aria-hidden className="today-tile-arrow" /></Link>
        : <div className="today-tile-main">{body}</div>}
      {tile.nextStep && (
        <p className="today-tile-next">
          <CheckCircle2 size={16} aria-hidden />
          {tile.nextHref ? <Link href={tile.nextHref}>{tile.nextStep}</Link> : <span>{tile.nextStep}</span>}
        </p>
      )}
      <Details lines={tile.details} />
    </article>
  );
}

/** Today (plan v2 B3): what to do today, in accounting words. Processing health lives on the admin System page. */
export function TodayPage({ user }: { user: User }) {
  const role: TodayRole = user.role === "LOCAL_ADMIN" ? "LOCAL_ADMIN" : "ACCOUNTANT";
  const { data, error, loading, refresh } = useResource(() => getHomeSummary(user), `today:${user.id}`);
  if (loading) return <LoadingState variant="dashboard" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const tiles = todayTiles(data, role);
  const month = monthEndView(data, role);
  const allClear = tiles.every((tile) => tile.tone === "clear");
  return (
    <div className="today-page">
      <PageHeader
        eyebrow={formatDate(data.asOf)}
        title="Today"
        description={role === "LOCAL_ADMIN"
          ? "What the company needs today. Each box opens the list it counts."
          : "Your work for today. Each box opens the list it counts."}
      />
      {allClear && <p className="today-all-clear"><CheckCircle2 size={18} aria-hidden /> Nothing needs you right now.</p>}
      <section className="today-grid" aria-label="Things to do">
        {tiles.map((tile) => <Tile key={tile.id} tile={tile} />)}
      </section>
      <Panel title={month.title} subtitle="Month-end checklist for the whole company.">
        {month.available ? (
          <ol className="today-month">
            {month.steps.map((step) => (
              <li key={step.key} className={step.complete ? "complete" : ""}>
                <div className="today-month-row">
                  {step.href ? <Link href={step.href}>{step.label}</Link> : <span>{step.label}</span>}
                  <strong>{step.value}</strong>
                </div>
                {step.percent !== null && (
                  <div className="today-progress" role="progressbar" aria-label={step.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={step.percent}>
                    <span style={{ width: `${step.percent}%` }} />
                  </div>
                )}
                <Details lines={step.details} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="today-month-unavailable"><strong>Not available yet</strong><Details lines={month.details} /></div>
        )}
      </Panel>
    </div>
  );
}

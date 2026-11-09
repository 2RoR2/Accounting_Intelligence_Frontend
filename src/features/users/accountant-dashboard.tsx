"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Files, FileCheck2, Plus } from "lucide-react";
import type { Document, User } from "@/types";
import type { BankMoneyTransaction } from "@/types/money";
import { Badge, formatDate, SpinningCounter } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getTrends } from "@/lib/api/processing.service";
import { TotalSalesChart } from "@/components/common/charts/total-sales-chart";
import { DocumentStackWidget } from "@/components/common/documents/document-stack-widget";
import { MalaysiaDayNight } from "@/components/common/dashboard/malaysia-day-night";
import { getMoneyTransactions } from "@/lib/api/money.service";

const approvedStatuses = ["COMPLETED", "VALIDATED", "STANDARDISED"];
const totalApproved = (docs: Document[], type: string) => docs.filter((doc) => doc.type === type && approvedStatuses.includes(doc.status)).reduce((sum, doc) => sum + (Number(doc.totalAmount) || 0), 0);

const overdueCount = (docs: Document[], type: "INVOICE" | "BILL") => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return docs.filter((doc) => {
    if (doc.type !== type || !doc.dueDate || approvedStatuses.includes(doc.status)) return false;
    const dueDate = new Date(doc.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }).length;
};

const documentAction = (status: string) => {
  if (status === "FAILED") return "View error";
  if (["IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(status)) return "Review";
  if (["UPLOADED", "QUEUED", "PROCESSING"].includes(status)) return "View progress";
  return "View record";
};

function DashboardWidget({ id, title, subtitle, onDragStart, onDrop, onKeyboardMove, children }: { id: string; title: string; subtitle?: string; onDragStart: (id: string) => void; onDrop: (id: string) => void; onKeyboardMove: (id: string, direction: -1 | 1) => void; children: ReactNode }) {
  return <section className={`dashboard-widget dashboard-widget-${id}`} draggable onDragStart={() => onDragStart(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(id)}>
    <div className="dashboard-widget-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="widget-drag-handle" type="button" draggable aria-label={`Reorder ${title}`} title="Drag this grip to reorder. Use Alt + Arrow keys to move" onDragStart={() => onDragStart(id)} onKeyDown={(event) => { if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); onKeyboardMove(id, event.key === "ArrowUp" ? -1 : 1); } }}><span className="drag-dots" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span></button></div>
    {children}
  </section>;
}

export function AccountantDashboard({ user, docs, exceptions, userName = "there", base = "/workspace" }: { user: User; docs: Document[]; exceptions: number; userName?: string; base?: string }) {
  const malaysiaHour = Number(new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = malaysiaHour < 5 ? "Good night" : malaysiaHour < 12 ? "Good morning" : malaysiaHour < 17 ? "Good afternoon" : malaysiaHour < 21 ? "Good evening" : "Good night";
  const { data: trends } = useResource(() => getTrends("week"), "accountant-dashboard-week");
  const { data: bankTransactions } = useResource(
    () => Promise.all([getMoneyTransactions(user, "money_in"), getMoneyTransactions(user, "money_out")]).then(([moneyIn, moneyOut]) => [...moneyIn, ...moneyOut]),
    `${user.id}:accountant-dashboard-bank-anomalies`,
  );
  const [widgetOrder, setWidgetOrder] = useState(["attention", "metrics", "activity", "review-queue", "documents", "stacks", "health", "review-activity", "finance", "bank", "transaction-insights", "actions"]);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`accordai-dashboard-widgets-${base}`) || "null");
      if (Array.isArray(saved) && saved.every((value) => typeof value === "string")) {
        const defaults = ["attention", "metrics", "activity", "review-queue", "documents", "stacks", "health", "review-activity", "finance", "bank", "transaction-insights", "actions"];
        const savedOrder = saved.filter((value) => defaults.includes(value));
        setWidgetOrder([...savedOrder, ...defaults.filter((value) => !savedOrder.includes(value))]);
      }
    } catch { /* local storage is optional */ }
  }, []);

  const reorderWidget = (target: string) => {
    if (!draggedWidget || draggedWidget === target) return;
    const next = [...widgetOrder]; const from = next.indexOf(draggedWidget); const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1); next.splice(to, 0, draggedWidget); setWidgetOrder(next);
    window.localStorage.setItem(`accordai-dashboard-widgets-${base}`, JSON.stringify(next)); setDraggedWidget(null);
  };
  const moveWidget = (id: string, direction: -1 | 1) => {
    const index = widgetOrder.indexOf(id); const target = index + direction;
    if (index < 0 || target < 0 || target >= widgetOrder.length) return;
    const next = [...widgetOrder]; [next[index], next[target]] = [next[target], next[index]];
    setWidgetOrder(next); window.localStorage.setItem(`accordai-dashboard-widgets-${base}`, JSON.stringify(next));
  };

  const processing = docs.filter((doc) => ["UPLOADED", "QUEUED", "PROCESSING"].includes(doc.status)).length;
  const review = docs.filter((doc) => ["IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(doc.status)).length;
  const failed = docs.filter((doc) => doc.status === "FAILED").length;
  const standardised = docs.filter((doc) => approvedStatuses.includes(doc.status)).length;
  const queued = docs.filter((doc) => ["UPLOADED", "QUEUED"].includes(doc.status)).length;
  const active = docs.filter((doc) => doc.status === "PROCESSING").length;
  const oldestWaiting = docs.filter((doc) => ["UPLOADED", "QUEUED", "PROCESSING"].includes(doc.status)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const maxProcessed = Math.max(1, ...(trends ?? []).map((point) => point.processed));
  const averageProcessed = trends?.length ? Math.round(trends.reduce((sum, point) => sum + point.processed, 0) / trends.length) : 0;
  const invoiceTotal = totalApproved(docs, "INVOICE");
  const billTotal = totalApproved(docs, "BILL");
  const receiptTotal = totalApproved(docs, "RECEIPT");
  const reviewDocs = docs.filter((doc) => ["IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(doc.status)).slice(0, 4);
  const overdueInvoices = overdueCount(docs, "INVOICE");
  const overdueBills = overdueCount(docs, "BILL");
  const approvedInvoices = docs.filter((doc) => doc.type === "INVOICE" && approvedStatuses.includes(doc.status)).length;
  const approvedBills = docs.filter((doc) => doc.type === "BILL" && approvedStatuses.includes(doc.status)).length;
  const salesByDay = docs.filter((doc) => doc.type === "INVOICE" && approvedStatuses.includes(doc.status)).reduce<Record<string, number>>((result, doc) => {
    const label = new Intl.DateTimeFormat("en-MY", { day: "2-digit", month: "short" }).format(new Date(doc.createdAt));
    result[label] = (result[label] ?? 0) + (Number(doc.totalAmount) || 0);
    return result;
  }, {});
  const salesChartData = Object.entries(salesByDay).slice(-7).map(([label, value]) => ({ label, value }));
  const flaggedTransactions = (bankTransactions ?? []).filter((transaction) => transaction.anomaly?.isAnomaly).sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()).slice(0, 6);
  const largestFlaggedAmount = Math.max(1, ...flaggedTransactions.map((transaction) => Number(transaction.amount) || 0));
  const widgetProps = { onDragStart: setDraggedWidget, onDrop: reorderWidget, onKeyboardMove: moveWidget };

  const widgets: Record<string, ReactNode> = {
    metrics: <DashboardWidget id="metrics" title="Document summary" subtitle="Select a metric to filter your workflow" {...widgetProps}><div className="widget-metric-grid"><Link href={`${base}/documents`}><strong>{docs.length}</strong><span>All documents</span><em className="metric-spark spark-blue" /></Link><Link href={`${base}/documents?status=PROCESSING`}><strong>{processing}</strong><span>Processing</span><em className="metric-spark spark-cyan" /></Link><Link href={`${base}/documents?status=IN_REVIEW`}><strong>{review}</strong><span>Needs review</span><em className="metric-spark spark-amber" /></Link><Link href={`${base}/records`}><strong>{standardised}</strong><span>Standardised</span><em className="metric-spark spark-green" /></Link></div><div className="widget-overdue-row"><Link href={`${base}/documents?type=INVOICE&status=OVERDUE`}><strong>{overdueInvoices}</strong><span>Overdue invoices</span><ArrowRight size={14} /></Link><Link href={`${base}/documents?type=BILL&status=OVERDUE`}><strong>{overdueBills}</strong><span>Overdue bills</span><ArrowRight size={14} /></Link></div></DashboardWidget>,
    attention: <DashboardWidget id="attention" title="Attention needed" subtitle="Failures and review work are tracked separately" {...widgetProps}><div className="widget-attention-list"><Link className="widget-attention-row" href={`${base}/documents?status=FAILED`}><span><strong>{failed} failed job{failed === 1 ? "" : "s"}</strong><small>Review the error or retry the source document.</small></span><ArrowRight size={18} /></Link><Link className="widget-attention-row" href={`${base}/exceptions`}><span><strong>{exceptions} review task{exceptions === 1 ? "" : "s"}</strong><small>Documents awaiting correction or approval.</small></span><ArrowRight size={18} /></Link></div></DashboardWidget>,
    activity: <DashboardWidget id="activity" title="Processing activity" subtitle="Documents processed per day" {...widgetProps}>{trends?.length ? <div className="processing-visual"><div className="processing-visual-top"><strong>{trends.reduce((sum, point) => sum + point.processed, 0)}</strong><span>Total this week</span><span className="processing-legend"><i /> Completed <i className="failed" /> Failed</span></div><div className="processing-visual-date">Current week · daily volume</div><div className="processing-chart-shell"><div className="processing-y-axis"><span>{maxProcessed}</span><span>{Math.round(maxProcessed * .66)}</span><span>{Math.round(maxProcessed * .33)}</span><span>0</span></div><div className="processing-visual-chart">{[maxProcessed, Math.round(maxProcessed * .66), Math.round(maxProcessed * .33), 0].map((tick) => <i className="processing-gridline" key={tick} style={{ bottom: `${(tick / maxProcessed) * 100}%` }} />)}<div className="processing-average" style={{ bottom: `${Math.max(8, (averageProcessed / maxProcessed) * 100)}%` }}><span>Avg. {averageProcessed}</span></div>{trends.map((point) => <div className="processing-bar-wrap" key={point.day}><button className="processing-bar" style={{ height: `${Math.max(12, (point.processed / maxProcessed) * 100)}%` }} title={`${point.day}: ${point.processed} completed, ${point.exceptions} failed`} aria-label={`${point.day}: ${point.processed} documents completed and ${point.exceptions} failed`} /><strong>{point.processed}</strong><span>{point.day}</span></div>)}</div></div><div className="processing-readings"><span>Latest total <strong>{trends[trends.length - 1]?.processed ?? 0}</strong></span><span>Weekly total <strong>{trends.reduce((sum, point) => sum + point.processed, 0)}</strong></span></div></div> : <div className="widget-empty">Trend data will appear after documents are processed.</div>}<div className="widget-health"><strong>Processing health</strong><span>{queued} queued · {active} active{oldestWaiting ? ` · oldest ${formatDate(oldestWaiting.createdAt)}` : ""}</span></div></DashboardWidget>,
    documents: <DashboardWidget id="documents" title="Recent documents" subtitle="The latest files moving through your workflow" {...widgetProps}><div className="widget-document-mini">{docs.slice(0, 4).map((doc) => <Link key={doc.id} href={`/workspace/documents/${doc.id}`}><span><Files size={14} /><strong>{doc.name}</strong></span><Badge>{doc.status}</Badge></Link>)}{!docs.length && <div className="widget-empty">Upload an invoice, bill, or receipt to get started.</div>}</div></DashboardWidget>,
    stacks: <DashboardWidget id="stacks" title="Document types" subtitle="Your workspace at a glance" {...widgetProps}><DocumentStackWidget items={[{ label: "Invoices", count: docs.filter((doc) => doc.type === "INVOICE").length, href: "/workspace/documents?type=INVOICE", tone: "blue" }, { label: "Bills", count: docs.filter((doc) => doc.type === "BILL").length, href: "/workspace/documents?type=BILL", tone: "green" }, { label: "Receipts", count: docs.filter((doc) => doc.type === "RECEIPT").length, href: "/workspace/documents?type=RECEIPT", tone: "red" }]} /></DashboardWidget>,
    "review-queue": <DashboardWidget id="review-queue" title="Your review queue" subtitle="Documents that need your attention" {...widgetProps}><div className="widget-queue">{reviewDocs.map((doc) => <Link key={doc.id} href={`/workspace/documents/${doc.id}`}><span><FileCheck2 size={15} /><strong>{doc.name}</strong></span><ArrowRight size={15} /></Link>)}{!reviewDocs.length && <div className="widget-empty"><FileCheck2 size={20} /> No review tasks waiting.</div>}</div></DashboardWidget>,
    finance: <DashboardWidget id="finance" title="Money position" subtitle="Approved document totals only" {...widgetProps}><div className="widget-finance-grid"><Link href={`${base}/money-in`}><strong><SpinningCounter value={invoiceTotal} /></strong><span>Sales invoices</span></Link><Link href={`${base}/money-out`}><strong><SpinningCounter value={billTotal} /></strong><span>Purchase bills</span></Link><Link href={`${base}/documents?type=RECEIPT`}><strong><SpinningCounter value={receiptTotal} /></strong><span>Receipts</span></Link><div><strong>{overdueInvoices + overdueBills}</strong><span>Overdue documents</span></div></div><TotalSalesChart data={salesChartData} /></DashboardWidget>,
    health: <DashboardWidget id="health" title="Processing health" subtitle="Current document processing status" {...widgetProps}><div className="widget-health-diagram"><div><strong>{queued}</strong><span>Queued</span></div><div><strong>{active}</strong><span>Active</span></div><div><strong>{review}</strong><span>Review</span></div><div><strong>{standardised}</strong><span>Standardised</span></div></div><div className="widget-health-line"><i /><i /><i /><i /></div><p className="widget-health-note">{oldestWaiting ? `Oldest active item: ${formatDate(oldestWaiting.createdAt)}` : "All processing stages are clear."}</p></DashboardWidget>,
    bank: <DashboardWidget id="bank" title="Bank reconciliation" subtitle="Match imported bank transactions to approved records" {...widgetProps}><div className="widget-bank-summary"><Link href={`${base}/money-in`}><strong>{approvedInvoices}</strong><span>Approved Money In</span><small>Incoming records</small></Link><Link href={`${base}/money-out`}><strong>{approvedBills}</strong><span>Approved Money Out</span><small>Outgoing records</small></Link><Link href={`${base}/money-in`}><strong>0</strong><span>Suggested matches</span><small>Awaiting review</small></Link><Link href={`${base}/money-in`}><strong>{exceptions}</strong><span>Needs review</span><small>Human confirmation</small></Link></div><Link className="widget-inline-link" href={`${base}/money-in`}>Review reconciliation <ArrowRight size={15} /></Link></DashboardWidget>,
    "transaction-insights": <DashboardWidget id="transaction-insights" title="Transaction insights" subtitle="Amount anomalies in imported bank rows" {...widgetProps}><div className="transaction-insights-note">Amount anomaly detection only. Duplicates and unusual frequency are not checked.</div>{flaggedTransactions.length ? <div className="transaction-insights-list">{flaggedTransactions.map((transaction: BankMoneyTransaction) => { const directionPath = transaction.direction === "money_in" ? "money-in" : "money-out"; const width = Math.max(10, ((Number(transaction.amount) || 0) / largestFlaggedAmount) * 100); return <Link className="transaction-insight-row" key={transaction.id} href={`${base}/${directionPath}?transaction=${encodeURIComponent(transaction.id)}`}><span className="transaction-insight-main"><strong>{transaction.description || "Bank transaction"}</strong><small>{transaction.postedDate} · {transaction.direction === "money_in" ? "Money In" : "Money Out"}</small><i><em style={{ width: `${width}%` }} /></i></span><span className="transaction-insight-amount">{transaction.currency ?? "MYR"} {Number(transaction.amount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<ArrowRight size={15} /></span></Link>})}</div> : <div className="widget-empty">No amount anomalies have been flagged.</div>}</DashboardWidget>,
    "review-activity": <DashboardWidget id="review-activity" title="Recent activity" subtitle="The latest events in your accounting workflow" {...widgetProps}><div className="widget-history-list"><div className="widget-history-item"><i className="history-blue" /><div><strong>{docs.length ? `Uploaded ${docs.length} document${docs.length === 1 ? "" : "s"}` : "No documents uploaded yet"}</strong><span>{docs[0] ? formatDate(docs[0].createdAt) : "Upload a document to begin"}</span></div></div><div className="widget-history-item"><i className="history-green" /><div><strong>{standardised ? `${standardised} record${standardised === 1 ? "" : "s"} approved` : "Approval activity"}</strong><span>{standardised ? "Ready for accounting use" : "No approvals yet"}</span></div></div><div className="widget-history-item"><i className="history-red" /><div><strong>{failed ? `${failed} failed job${failed === 1 ? "" : "s"}` : "Processing is healthy"}</strong><span>{failed ? "Review the error details" : `${active} active document${active === 1 ? "" : "s"}`}</span></div></div></div></DashboardWidget>,
    actions: <DashboardWidget id="actions" title="Next actions" subtitle="Shortcuts for the accounting workflow" {...widgetProps}><div className="widget-actions"><Link href={`${base}/exceptions`}>Open exception queue <ArrowRight size={16} /></Link><Link href={`${base}/records`}>View standardised records <ArrowRight size={16} /></Link><Link href={`${base}/upload`}>Upload a new document <ArrowRight size={16} /></Link></div></DashboardWidget>,
  };

  return <div className="dashboard-page">
    <div className="workspace-dashboard-header dashboard-reference-header"><MalaysiaDayNight /><div><span className="workspace-dashboard-kicker">OVERVIEW</span><h1>{greeting}, {userName}</h1></div><div className="workspace-dashboard-actions"><Link className="btn" href={`${base}/documents`}>Search documents</Link><Link className="btn primary" href={`${base}/upload`}><Plus size={15} /> Upload documents</Link></div></div>
    <section className="workspace-dashboard-layout"><section className="workspace-documents-card"><div className="workspace-documents-toolbar"><div><span className="workspace-dashboard-kicker">RECENT DOCUMENTS</span><h2>Recent document activity</h2><p>{docs.length} documents in this workspace</p></div><Link className="btn" href={`${base}/documents`}>View all <ArrowRight size={14} /></Link></div><div className="workspace-document-table"><div className="workspace-document-row workspace-document-head"><span>Document</span><span>Type</span><span>Uploaded</span><span>Status</span><span>Action</span></div>{docs.slice(0, 6).map((doc) => <Link className="workspace-document-row" key={doc.id} href={`/workspace/documents/${doc.id}`}><strong><Files size={15} />{doc.name}</strong><span>{doc.type.replaceAll("_", " ")}</span><span>{formatDate(doc.createdAt)}</span><Badge>{doc.status}</Badge><span className="document-row-action">{documentAction(doc.status)} <ArrowRight size={13} /></span></Link>)}{!docs.length && <div className="workspace-document-empty">No documents yet. Upload an invoice, bill, or receipt to begin.</div>}</div></section></section>
    <div className="dashboard-widget-grid">{widgetOrder.map((id) => <div className="dashboard-widget-slot" key={id}>{widgets[id]}</div>)}</div>
  </div>;
}
